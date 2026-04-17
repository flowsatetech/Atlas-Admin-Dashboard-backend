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
const models = require('../models');

/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { projects } = middlewares.rateLimiters;

/** MAIN PROJECT ROUTES */

router.get('/', projects, async (req, res) => {
    try {
        const querySchema = models.common.paginationQuerySchema.extend({
            status: z.string().optional().default("")
        });
        const parsed = querySchema.safeParse(req.query);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid query parameters.',
            });
        }

        const { page, limit, status } = parsed.data;
        const result = await db.getProjectsPaginated({ page, limit, status });

        res.status(200).json({
            success: true,
            message: 'Fetch projects success',
            data: {
                projects: result.projects,
                pagination: result.pagination,
                infoData: result.infoData,
            }
        });
    } catch (e) {
        logger('GET_PROJECTS').error(e);
        res.status(500).json({
            success: false, message: 'An unknown error occurred'
        });
    }
});

router.get('/:projectId', projects, async (req, res) => {
    try {
        const project = await db.getProjectById(req.params.projectId);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        const comments = await db.getCommentsByProjectId(project.id);

        res.status(200).json({
            success: true,
            message: 'Fetch project success',
            data: {
                project: {
                    id: project.id,
                    projectName: project.name,
                    clientId: project.clientId,
                    description: project.description,
                    deadline: project.deadline,
                    comments,
                    budget: project.budget,
                    priority: project.priority,
                    teamIds: project.teamIds,
                    files: project.files,
                    status: project.status,
                    progress: project.progress,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt,
                }
            }
        });
    } catch (e) {
        logger('GET_PROJECT').error(e);
        res.status(500).json({
            success: false, message: 'An unknown error occurred'
        });
    }
});

router.post('/', middlewares.adminOnly, projects, async (req, res) => {
    try {
        const validData = models.project.createProjectSchema.safeParse({
            id: generateToken(),
            ...req.body,
        });

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t create project. Some fields are missing or invalid.',
            });
        }

        const now = Date.now();
        const projectData = {
            ...validData.data,
            createdAt: now,
            updatedAt: now,
        };

        const newProject = await db.addProject(projectData);

        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            data: { project: newProject }
        });
    } catch (e) {
        logger('NEW_PROJECT').error(e);
        res.status(500).json({
            success: false, message: 'An unknown error occurred'
        });
    }
});

router.patch('/:projectId', middlewares.adminOnly, projects, async (req, res) => {
    try {
        const existing = await db.getProjectById(req.params.projectId);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        const validData = models.project.updateProjectSchema.safeParse(req.body);

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid update data.',
            });
        }

        const updateData = {
            ...validData.data,
            updatedAt: Date.now(),
        };

        const updatedProject = await db.updateProject(req.params.projectId, updateData);

        res.status(200).json({
            success: true,
            message: 'Project updated successfully',
            data: { project: updatedProject }
        });
    } catch (e) {
        logger('UPDATE_PROJECT').error(e);
        res.status(500).json({
            success: false, message: 'An unknown error occurred'
        });
    }
});

router.delete('/:projectId', middlewares.adminOnly, projects, async (req, res) => {
    try {
        const existing = await db.getProjectById(req.params.projectId);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        await db.deleteProject(req.params.projectId);
        res.status(204).send();
    } catch (e) {
        logger('DELETE_PROJECT').error(e);
        res.status(500).json({
            success: false, message: 'An unknown error occurred'
        });
    }
});

router.post('/:projectId/comments', projects, async (req, res) => {
    try {
        const existing = await db.getProjectById(req.params.projectId);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Project not found',
            });
        }

        const commentSchema = z.object({
            comment: z.string().min(1),
        });

        const validData = commentSchema.safeParse(req.body);

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Comment content is required.',
            });
        }

        const now = Date.now();
        const commentData = {
            id: generateToken(),
            projectId: req.params.projectId,
            authorId: req.user.userId,
            content: validData.data.comment,
            createdAt: now,
            updatedAt: now,
        };

        await db.addComment(commentData);
        res.status(204).send();
    } catch (e) {
        logger('ADD_COMMENT').error(e);
        res.status(500).json({
            success: false, message: 'An unknown error occurred'
        });
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;