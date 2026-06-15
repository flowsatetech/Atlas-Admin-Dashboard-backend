/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');
const multer = require('multer');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, serverError, clientError, uploadGeneralFile, deleteCloudinaryAsset, stripMongoId } = require('../helpers');
const db = require('../db');
const models = require('../models');
const services = require('../services');
const { mediaFileSchema } = require('../models/media-file');

/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();

const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_BYTES) || 50 * 1024 * 1024;

const projectFileUpload = multer({
  limits: { fileSize: MAX_FILE_SIZE },
  storage: multer.memoryStorage(),
});

const projectFileUploadMiddleware = (req, res, next) => {
  const handler = projectFileUpload.single('file');
  handler(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      success: false,
      message: 'Project file upload error',
      data: { error: err.message },
    });
  });
};

function inferMediaType(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    mimeType.includes('excel') ||
    mimeType.includes('powerpoint') ||
    mimeType.startsWith('text/')
  ) return 'document';
  return 'other';
}

function resolveCloudinaryResourceType(file) {
  if (file?.resourceType) return file.resourceType;
  if (file?.type === 'image') return 'image';
  if (file?.type === 'video') return 'video';
  return 'raw';
}

function publicMediaFile(file) {
  return stripMongoId(file);
}

/** MAIN PROJECT ROUTES */

router.get('/stats', async (req, res) => {
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

router.get('/', async (req, res) => {
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

router.get('/:projectId', async (req, res) => {
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

router.post('/', middlewares.adminOnly, async (req, res) => {
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

router.patch('/:projectId', middlewares.adminOnly, async (req, res) => {
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

        const nextStatus = incoming.status || existing.status;

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

        if (Object.prototype.hasOwnProperty.call(incoming, 'status') && incoming.status !== existing.status) {
            const statusRecipients = [...new Set((updateData.teamIds || existing.teamIds || [])
                .filter((memberId) => memberId && memberId !== req.user?.userId))];

            services.NotificationService.dispatchMany(statusRecipients.map((memberId) => ({
                recipientId: memberId,
                type: 'PROJECT_STATUS_CHANGE',
                title: 'Project Status Updated',
                message: `${existing.name || 'Project'} moved from ${existing.status || 'Unknown'} to ${incoming.status}`,
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
            message: `Project ${existing.name || 'Project'}'s payment has been updated`,
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

router.delete('/:projectId', middlewares.adminOnly, async (req, res) => {
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

router.post('/:projectId/comments', async (req, res) => {
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

        const mentionedUsers = mentionTokens.length > 0
            ? await db.getUsersByMentionTokens(mentionTokens)
            : [];
        const mentionedRecipientIds = new Set(mentionedUsers
            .filter((mentionedUser) => mentionedUser.userId && mentionedUser.userId !== req.user.userId)
            .map((mentionedUser) => mentionedUser.userId));

        const mentionNotifications = [...mentionedRecipientIds].map((recipientId) => ({
            recipientId,
            type: 'COMMENT_MENTION',
            title: 'You were mentioned',
            message: `You were mentioned in a comment on project: ${existing.name || 'Project'}`,
            link: `/projects/${req.params.projectId}`,
            referenceId: req.params.projectId,
            referenceType: 'Project',
            createdBy: req.user?.userId
        }));

        const commentNotifications = [...new Set(existing.teamIds || [])]
            .filter((memberId) => memberId && memberId !== req.user.userId && !mentionedRecipientIds.has(memberId))
            .map((memberId) => ({
                recipientId: memberId,
                type: 'PROJECT_COMMENT',
                title: 'New Project Comment',
                message: `Someone commented on project: ${existing.name || 'Project'}`,
                link: `/projects/${req.params.projectId}`,
                referenceId: req.params.projectId,
                referenceType: 'Project',
                createdBy: req.user?.userId
            }));

        services.NotificationService.dispatchMany([
            ...mentionNotifications,
            ...commentNotifications,
        ], 'ADD_COMMENT');

        res.status(204).send();
    } catch (e) {
        logger('ADD_COMMENT').error(e);
        return serverError(res, e, 'Failed to add comment.');
    }
});

router.get('/:projectId/comments', async (req, res) => {
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

router.post('/:projectId/files', projectFileUploadMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;

        const project = await db.getProjectById(projectId);
        if (!project) {
            return clientError(res, 404, 'Project not found');
        }

        if (!req.file) {
            return clientError(res, 400, 'No file uploaded');
        }

        const uploaded = await uploadGeneralFile(req.file);
        const url = uploaded.secure_url || uploaded.url;
        const id = generateToken(32);

        const record = {
            id,
            fileName: req.file.originalname || uploaded.original_filename || id,
            type: inferMediaType(req.file.mimetype),
            mimeType: req.file.mimetype || 'application/octet-stream',
            sizeBytes: Number(req.file.size) || Number(uploaded.bytes) || 0,
            storageProvider: 'cloudinary',
            publicId: uploaded.public_id || null,
            resourceType: uploaded.resource_type || null,
            url,
            uploadedBy: req.user?.userId || null,
            projectId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        const parsed = mediaFileSchema.safeParse(record);
        if (!parsed.success) {
            if (uploaded.public_id) await deleteCloudinaryAsset(uploaded.public_id, uploaded.resource_type);
            return clientError(res, 400, 'Invalid file metadata', parsed.error.issues.map((i) => i.message));
        }

        const saved = await db.addMediaFile(parsed.data);
        await db.addFileToProject(projectId, id);

        await services.logActivity({
            type: 'project.file.uploaded',
            actorId: req.user?.userId || null,
            entityId: projectId,
            entityType: 'project',
            message: `File "${parsed.data.fileName}" uploaded to project "${project.name || 'Project'}"`,
            meta: { fileId: id, mediaType: parsed.data.type, publicId: parsed.data.publicId },
        });

        res.status(201).json({
            success: true,
            message: 'Project file uploaded successfully',
            data: { file: publicMediaFile(saved) },
        });
    } catch (e) {
        logger('PROJECT_FILE_UPLOAD').error(e);
        return serverError(res, e, 'Failed to upload project file.');
    }
});

router.get('/:projectId/files', async (req, res) => {
    try {
        const { projectId } = req.params;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(Math.max(1, Number(req.query.limit) || 100), 100);

        const project = await db.getProjectById(projectId);
        if (!project) {
            return clientError(res, 404, 'Project not found');
        }

        const result = await db.getMediaFilesByProjectId({ projectId, page, limit });

        res.status(200).json({
            success: true,
            message: 'Fetch project files success',
            data: {
                files: result.files.map(publicMediaFile),
                pagination: result.pagination,
            },
        });
    } catch (e) {
        logger('PROJECT_FILE_LIST').error(e);
        return serverError(res, e, 'Failed to fetch project files.');
    }
});

router.delete('/:projectId/files/:fileId', async (req, res) => {
    try {
        const { projectId, fileId } = req.params;

        const project = await db.getProjectById(projectId);
        if (!project) {
            return clientError(res, 404, 'Project not found');
        }

        const file = await db.getMediaFileById(fileId);
        if (!file) {
            return clientError(res, 404, 'File not found');
        }

        if (file.projectId && file.projectId !== projectId) {
            return clientError(res, 400, 'File does not belong to this project');
        }

        // Delete from Cloudinary if applicable
        if (file.publicId) {
            await deleteCloudinaryAsset(file.publicId, resolveCloudinaryResourceType(file));
        }
        
        await db.removeFileFromProject(projectId, fileId);

        await db.deleteMediaFileById(fileId);

        await services.logActivity({
            type: 'project.file.deleted',
            actorId: req.user?.userId || null,
            entityId: projectId,
            entityType: 'project',
            message: `File "${file.fileName}" removed from project "${project.name || 'Project'}"`,
            meta: { fileId, mediaType: file.type, publicId: file.publicId || null },
        });

        res.status(200).json({
            success: true,
            message: 'Project file deleted successfully',
            data: { id: fileId },
        });
    } catch (e) {
        logger('PROJECT_FILE_DELETE').error(e);
        return serverError(res, e, 'Failed to delete project file.');
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;