/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger } = require('../helpers');
const db = require('../db');


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
        }).safeParse(req.body);

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t complete signup request'
            })
        }

        const { name, client, dueTime, assignees } = validData.data;

        await db.addProject({ name, client, dueTime, assignees })

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

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;