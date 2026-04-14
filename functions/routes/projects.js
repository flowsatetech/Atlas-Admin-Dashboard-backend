/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken } = require('../helpers');
const db = require('../db');
const services = require('../services');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { projects } = middlewares.rateLimiters;

/** MAIN USER ROUTES */
router.get('/all', projects, async (req, res) => {
    try {
        const projects = await db.getProjects();
        const formattedProjects = await Promise.all(projects.map(async (project) => {
            const assigneesList = await Promise.all(
                project.assignees.map(async (userId) => {
                    const user = await db.getUserById(userId);
                    return {
                        id: userId,
                        name: user ? user.firstName : "Unknown User"
                    };
                })
            );
            const { _id, ...client } = await db.getClientById(project.client);

            return {
                id: project.id,
                name: project.name,
                client,
                dueTime: project.dueTime,
                assignees: assigneesList
            };
        }));

        res.status(200).json({
            success: true,
            message: 'Fetch projects success',
            data: {
                projects: formattedProjects
            }
        });
    } catch (e) {
        logger('ALL_PROJECTS').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.post('/new', middlewares.adminOnly, projects, async (req, res) => {
    try {
        const validData = z.object({
            name: z.string().min(1),
            client: z.string(),
            dueTime: z.number(),
            assignees: z.array(z.string()),
            budget: z.number().nonnegative().optional(),
            recognizedRevenue: z.number().nonnegative().optional(),
            recognizedAt: z.number().int().nonnegative().optional(),
        }).safeParse(req.body);

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t complete signup request'
            })
        }

        const { name, client, dueTime, assignees, budget, recognizedRevenue, recognizedAt } = validData.data;
        const now = Date.now();

        if ((recognizedRevenue !== undefined || recognizedAt !== undefined) &&
            !(recognizedRevenue !== undefined && recognizedAt !== undefined)) {
            return res.status(400).json({
                success: false,
                message: 'recognizedRevenue and recognizedAt must be provided together'
            });
        }

        const project = {
            id: generateToken(),
            name,
            client,
            dueTime,
            assignees,
            budget: budget || 0,
            status: 'InProgress',
            progress: 0,
            recognizedRevenue: recognizedRevenue ?? null,
            recognizedAt: recognizedAt ?? null,
            createdAt: now,
            updatedAt: now
        };

        await db.addProject(project);
        await services.logActivity({
            type: 'project.created',
            actorId: req.user?.userId || null,
            entityId: project.id,
            entityType: 'project',
            message: `${project.name} project was created`,
            meta: {
                clientId: project.client,
                dueTime: project.dueTime
            }
        });
        await services.recordAnalyticsEvent({
            pageViewsDelta: 1,
            trafficSource: 'Direct'
        });

        res.status(200).json({
            success: true,
            message: 'Project added successfully'
        });
    } catch (e) {
        logger('NEW_PROJECT').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.put('/:projectId', middlewares.adminOnly, projects, async (req, res) => {
    try {
        const { projectId } = req.params;
        const validData = z.object({
            name: z.string().min(1).optional(),
            client: z.string().optional(),
            dueTime: z.number().optional(),
            assignees: z.array(z.string()).optional(),
            budget: z.number().nonnegative().optional(),
            status: z.enum(['Planned', 'InProgress', 'OnHold', 'Completed', 'Cancelled']).optional(),
            progress: z.number().min(0).max(100).optional(),
            recognizedRevenue: z.number().nonnegative().nullable().optional(),
            recognizedAt: z.number().int().nonnegative().nullable().optional()
        }).safeParse(req.body);

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t complete update project request'
            });
        }

        const existing = await db.getProjectById(projectId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        const incoming = validData.data;
        if ((Object.prototype.hasOwnProperty.call(incoming, 'recognizedRevenue') ||
            Object.prototype.hasOwnProperty.call(incoming, 'recognizedAt')) &&
            !(Object.prototype.hasOwnProperty.call(incoming, 'recognizedRevenue') &&
              Object.prototype.hasOwnProperty.call(incoming, 'recognizedAt'))) {
            return res.status(400).json({
                success: false,
                message: 'recognizedRevenue and recognizedAt must be provided together'
            });
        }

        const nextStatus = incoming.status || existing.status;
        const nextRecognizedRevenue = Object.prototype.hasOwnProperty.call(incoming, 'recognizedRevenue')
            ? incoming.recognizedRevenue
            : existing.recognizedRevenue;
        const nextRecognizedAt = Object.prototype.hasOwnProperty.call(incoming, 'recognizedAt')
            ? incoming.recognizedAt
            : existing.recognizedAt;

        if (nextStatus !== 'Completed' && (nextRecognizedRevenue != null || nextRecognizedAt != null)) {
            return res.status(400).json({
                success: false,
                message: 'recognizedRevenue and recognizedAt are only allowed for Completed projects'
            });
        }

        const updateData = {
            ...incoming,
            updatedAt: Date.now()
        };

        await db.updateProjectById(projectId, updateData);
        await services.logActivity({
            type: 'project.updated',
            actorId: req.user?.userId || null,
            entityId: projectId,
            entityType: 'project',
            message: `${existing.name || 'Project'} was updated`,
            meta: {
                fields: Object.keys(validData.data)
            }
        });
        await services.recordAnalyticsEvent({
            pageViewsDelta: 1,
            trafficSource: 'Direct'
        });

        return res.status(200).json({
            success: true,
            message: 'Project updated successfully'
        });
    } catch (e) {
        logger('UPDATE_PROJECT').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        });
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
