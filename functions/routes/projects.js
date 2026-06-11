/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, serverError, clientError } = require('../helpers');
const db = require('../db');
const models = require('../models');
const services = require('../services');

/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { projectsRead, projectsWrite } = middlewares.rateLimiters;

/** MAIN PROJECT ROUTES */

router.get('/stats', projectsRead, async (req, res) => {
    try {
        const stats = await db.getProjectStats();
        res.status(200).json({
            success: true,
            message: 'Fetch project stats success',
            data: { stats }
        });
    } catch (e) {
        logger('GET_PROJECT_STATS').error(e);
        return serverError(res, e, 'Failed to fetch project stats.');
    }
});

router.get('/', projectsRead, async (req, res) => {
    try {
        const querySchema = models.common.paginationQuerySchema.extend({
            status: z.string().optional().default("")
        });
        const parsed = querySchema.safeParse(req.query);

        if (!parsed.success) {
            return clientError(res, 400, 'Invalid query parameters.', parsed.error.issues.map(i => i.message));
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
        return serverError(res, e, 'Failed to fetch projects.');
    }
});

router.get('/:projectId', projectsRead, async (req, res) => {
    try {
        const project = await db.getProjectDetailById(req.params.projectId);

        if (!project) {
            return clientError(res, 404, 'Project not found');
        }

        res.status(200).json({
            success: true,
            message: 'Fetch project success',
            data: {
                project: {
                    id: project.id,
                    name: project.name,
                    clientId: project.clientId,
                    client: project.client || null,
                    description: project.description,
                    deadline: project.deadline,
                    comments: project.comments || [],
                    budget: project.budget,
                    priority: project.priority,
                    teamIds: project.teamIds,
                    files: project.files,
                    status: project.status,
                    totalTasks: project.totalTasks || 0,
                    completedTasks: project.completedTasks || 0,
                    progress: project.progress,
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt,
                }
            }
        });
    } catch (e) {
        logger('GET_PROJECT').error(e);
        return serverError(res, e, 'Failed to fetch project.');
    }
});

router.post('/', middlewares.adminOnly, projectsWrite, async (req, res) => {
    try {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'progress')) {
            return clientError(res, 400, 'Project progress is derived from task completion and cannot be set manually.');
        }

        const validData = models.project.createProjectSchema.safeParse({
            id: generateToken(),
            ...req.body,
        });

        if (!validData.success) {
            return clientError(res, 400, 'Couldn\'t create project. Some fields are missing or invalid.', validData.error.issues.map(i => i.message));
        }

        const clientExists = await db.getClientById(validData.data.clientId);
        if (!clientExists) {
            return clientError(res, 404, 'Client not found');
        }

        if (validData.data.teamIds && validData.data.teamIds.length > 0) {
            const foundUsers = await db.getUsersByIds(validData.data.teamIds);
            if (foundUsers.length !== validData.data.teamIds.length) {
                return clientError(res, 404, 'One or more team members not found');
            }
        }

        const now = Date.now();
        const projectData = {
            ...validData.data,
            createdAt: now,
            updatedAt: now,
        };

        const newProject = await db.addProject(projectData);
        // eslint-disable-next-line no-unused-vars
        const { _id, ...projectOut } = newProject;

        if (projectData.teamIds && projectData.teamIds.length > 0) {
            services.NotificationService.dispatchMany(projectData.teamIds.map((memberId) => ({
                recipientId: memberId,
                type: 'PROJECT_ASSIGNMENT',
                title: 'Added to Project',
                message: `You have been added to the project: ${projectData.name}`,
                link: `/projects/${projectData.id}`,
                referenceId: projectData.id,
                referenceType: 'Project',
                createdBy: req.user?.userId
            })), 'NEW_PROJECT');
        }

        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            data: { project: projectOut }
        });
    } catch (e) {
        logger('NEW_PROJECT').error(e);
        return serverError(res, e, 'Failed to create project.');
    }
});

router.patch('/:projectId', middlewares.adminOnly, projectsWrite, async (req, res) => {
    try {
        const { projectId } = req.params;

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'progress')) {
            return clientError(res, 400, 'Project progress is derived from task completion and cannot be set manually.');
        }

        const existing = await db.getProjectById(projectId);
        if (!existing) {
            return clientError(res, 404, 'Project not found');
        }

        const validData = models.project.updateProjectSchema.safeParse(req.body);
        if (!validData.success) {
            return clientError(res, 400, 'Invalid update data.', validData.error.issues.map(i => i.message));
        }

        const incoming = validData.data;
        const assigneeIds = incoming.teamIds || incoming.assignees;

        if (incoming.clientId) {
            const clientExists = await db.getClientById(incoming.clientId);
            if (!clientExists) {
                return clientError(res, 404, 'Client not found');
            }
        }

        if (assigneeIds && assigneeIds.length > 0) {
            const foundUsers = await db.getUsersByIds(assigneeIds);
            if (foundUsers.length !== assigneeIds.length) {
                return clientError(res, 404, 'One or more team members not found');
            }
        }

        if ((Object.prototype.hasOwnProperty.call(incoming, 'recognizedRevenue') ||
            Object.prototype.hasOwnProperty.call(incoming, 'recognizedAt')) &&
            !(Object.prototype.hasOwnProperty.call(incoming, 'recognizedRevenue') &&
              Object.prototype.hasOwnProperty.call(incoming, 'recognizedAt'))) {
            return clientError(res, 400, 'recognizedRevenue and recognizedAt must be provided together');
        }

        const nextStatus = incoming.status || existing.status;
        const nextRecognizedRevenue = Object.prototype.hasOwnProperty.call(incoming, 'recognizedRevenue')
            ? incoming.recognizedRevenue
            : existing.recognizedRevenue;
        const nextRecognizedAt = Object.prototype.hasOwnProperty.call(incoming, 'recognizedAt')
            ? incoming.recognizedAt
            : existing.recognizedAt;

        if (nextStatus !== 'Completed' && (nextRecognizedRevenue != null || nextRecognizedAt != null)) {
            return clientError(res, 400, 'recognizedRevenue and recognizedAt are only allowed for Completed projects');
        }

        const updateData = {
            ...incoming,
            updatedAt: Date.now(),
        };

        if (updateData.assignees && !updateData.teamIds) {
            updateData.teamIds = updateData.assignees;
        }
        delete updateData.assignees;

        const updatedProject = await db.updateProject(projectId, updateData);

        if (updateData.teamIds && Array.isArray(updateData.teamIds)) {
            const existingTeamIds = existing.teamIds || [];
            const newTeamIds = updateData.teamIds.filter(id => !existingTeamIds.includes(id));
            
            services.NotificationService.dispatchMany(newTeamIds.map((memberId) => ({
                recipientId: memberId,
                type: 'PROJECT_ASSIGNMENT',
                title: 'Added to Project',
                message: `You have been added to the project: ${existing.name || 'Project'}`,
                link: `/projects/${projectId}`,
                referenceId: projectId,
                referenceType: 'Project',
                createdBy: req.user?.userId
            })), 'UPDATE_PROJECT');
        }

        await services.logActivity({
            type: 'project.updated',
            actorId: req.user?.userId || null,
            entityId: projectId,
            entityType: 'project',
            message: `${existing.name || 'Project'} was updated`,
            meta: {
                fields: Object.keys(updateData).filter((field) => field !== 'updatedAt')
            }
        });
        await services.recordAnalyticsEvent({
            pageViewsDelta: 1,
            trafficSource: 'Direct'
        });

        res.status(200).json({
            success: true,
            message: 'Project updated successfully',
            data: { project: updatedProject }
        });
    } catch (e) {
        logger('UPDATE_PROJECT').error(e);
        return serverError(res, e, 'Failed to update project.');
    }
});

router.delete('/:projectId', middlewares.adminOnly, projectsWrite, async (req, res) => {
    try {
        const existing = await db.getProjectById(req.params.projectId);

        if (!existing) {
            return clientError(res, 404, 'Project not found');
        }

        await db.deleteProject(req.params.projectId);
        res.status(204).send();
    } catch (e) {
        logger('DELETE_PROJECT').error(e);
        return serverError(res, e, 'Failed to delete project.');
    }
});

router.post('/:projectId/comments', projectsWrite, async (req, res) => {
    try {
        const existing = await db.getProjectById(req.params.projectId);

        if (!existing) {
            return clientError(res, 404, 'Project not found');
        }

        const commentSchema = z.object({
            comment: z.string().min(1),
        });

        const validData = commentSchema.safeParse(req.body);

        if (!validData.success) {
            return clientError(res, 400, 'Comment content is required.');
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

        const content = validData.data.comment;
        const mentionTokens = [...new Set(
            [...content.matchAll(/@([A-Za-z0-9_-]+)/g)].map((match) => match[1])
        )];

        if (mentionTokens.length > 0) {
            const mentionedUsers = await db.getUsersByMentionTokens(mentionTokens);
            const notificationItems = mentionedUsers
                .filter((mentionedUser) => mentionedUser.userId && mentionedUser.userId !== req.user.userId)
                .map((mentionedUser) => ({
                    recipientId: mentionedUser.userId,
                    type: 'COMMENT_MENTION',
                    title: 'You were mentioned',
                    message: `You were mentioned in a comment on project: ${existing.name || 'Project'}`,
                    link: `/projects/${req.params.projectId}`,
                    referenceId: req.params.projectId,
                    referenceType: 'Project',
                    createdBy: req.user?.userId
                }));

            services.NotificationService.dispatchMany(notificationItems, 'ADD_COMMENT');
        }

        res.status(204).send();
    } catch (e) {
        logger('ADD_COMMENT').error(e);
        return serverError(res, e, 'Failed to add comment.');
    }
});

router.get('/:projectId/comments', projectsRead, async (req, res) => {
    try {
        const existing = await db.getProjectById(req.params.projectId);
        if (!existing) {
            return clientError(res, 404, 'Project not found');
        }

        const comments = await db.getCommentsByProjectId(req.params.projectId);
        res.status(200).json({
            success: true,
            message: 'Fetch comments success',
            data: { comments }
        });
    } catch (e) {
        logger('GET_COMMENTS').error(e);
        return serverError(res, e, 'Failed to fetch comments.');
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
