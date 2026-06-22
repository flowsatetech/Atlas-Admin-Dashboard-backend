/** IMPORT */
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, stripMongoId, serverError, clientError } = require('../helpers');
const db = require('../db');
const { createLeadSchema, updateLeadSchema, leadStatusEnum } = require('../models/lead');
const services = require('../services');

/** SETUP */
const router = express.Router();

const emptyToUndefined = (value) => (value === "" ? undefined : value);
const listLeadsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    status: z.preprocess(emptyToUndefined, leadStatusEnum.optional()),
});

/** MAIN LEADS ROUTES */

// New Route: GET /api/leads/stats - Fetch pipeline aggregation telemetry
router.get('/stats', middlewares.adminOnly, async (req, res) => {
    try {
        const stats = await db.getLeadStats();
        return res.status(200).json({
            success: true,
            message: 'Fetch lead stats success',
            data: stats
        });
    } catch (e) {
        logger('LEADS_STATS_GET').error(e);
        return serverError(res, e, 'Failed to fetch lead stats.');
    }
});

// 1. GET /api/leads - Paginated list of leads with search
router.get('/', middlewares.adminOnly, async (req, res) => {
    try {
        const parsed = listLeadsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return clientError(res, 400, 'Invalid query parameters.', parsed.error.issues.map(i => i.message));
        }

        const { page, limit, search = "", status = "" } = parsed.data;

        let assignedTo = "";
        const isAdmin = req.user?.role === 'admin';
        const includeUnassigned = req.query.includeUnassigned !== 'false';

        if (!isAdmin || (!includeUnassigned && isAdmin)) {
            assignedTo = req.user?.userId;
        }

        const result = await db.getAllLeads({ page, limit, search, status, assignedTo });

        return res.status(200).json({
            success: true,
            message: 'Leads fetched successfully',
            data: stripMongoId(result),
        });
    } catch (e) {
        logger('LEADS_GET').error(e);
        return serverError(res, e, 'Failed to fetch leads.');
    }
});

// 2. POST /api/leads - Add a new lead
router.post('/', middlewares.adminOnly, async (req, res) => {
    try {
        const parsed = createLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            return clientError(res, 400, 'Couldn\'t create lead. Some fields are missing or invalid.', parsed.error.issues.map(i => i.message));
        }

        const now = Date.now();
        const newLead = await db.addLead({
            ...parsed.data,
            id: generateToken(),
            createdAt: now,
            updatedAt: now,
        });

        if (parsed.data.assignedTo) {
            const staffExists = await db.getUserById(parsed.data.assignedTo);
            if (staffExists) {
                services.NotificationService.dispatch({
                    recipientId: staffExists.userId,
                    type: 'LEAD_ASSIGNMENT',
                    title: 'Lead Assigned',
                    message: `You have been assigned to lead: ${newLead.firstName} ${newLead.lastName}`,
                    link: `/leads/${newLead.id}`,
                    referenceId: newLead.id,
                    referenceType: 'Lead',
                    createdBy: req.user?.userId
                }, 'NEW_LEAD');
            }
        }

        return res.status(201).json({
            success: true,
            message: 'Lead added successfully',
            data: { lead: stripMongoId(newLead) },
        });
    } catch (e) {
        logger('LEADS_POST').error(e);
        return serverError(res, e, 'Failed to add lead.');
    }
});

// 3. GET /api/leads/:leadId - Get details of a single lead
router.get('/:leadId', middlewares.adminOnly, async (req, res) => {
    try {
        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return clientError(res, 404, 'Lead not found');
        }

        return res.status(200).json({
            success: true,
            message: 'Lead details fetched successfully',
            data: { lead: stripMongoId(lead) },
        });
    } catch (e) {
        logger('LEADS_DETAIL_GET').error(e);
        return serverError(res, e, 'Failed to fetch lead details.');
    }
});

// 4. PATCH /api/leads/:leadId - Update an individual lead
router.patch('/:leadId', middlewares.adminOnly, async (req, res) => {
    try {
        const parsed = updateLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            return clientError(res, 400, 'Invalid update data.', parsed.error.issues.map(i => i.message));
        }

        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return clientError(res, 404, 'Lead not found');
        }

        await db.updateLead(req.params.leadId, { ...parsed.data, updatedAt: Date.now() });

        if (parsed.data.assignedTo && parsed.data.assignedTo !== lead.assignedTo) {
            const staffExists = await db.getUserById(parsed.data.assignedTo);
            if (staffExists) {
                services.NotificationService.dispatch({
                    recipientId: staffExists.userId,
                    type: 'LEAD_ASSIGNMENT',
                    title: 'Lead Assigned',
                    message: `You have been assigned to lead: ${lead.firstName} ${lead.lastName}`,
                    link: `/leads/${lead.id}`,
                    referenceId: lead.id,
                    referenceType: 'Lead',
                    createdBy: req.user?.userId
                }, 'UPDATE_LEAD');
            }
        }

        if (Object.prototype.hasOwnProperty.call(parsed.data, 'status') && parsed.data.status !== lead.status) {
            const adminRecipients = await db.getUsersByRoles(['admin', 'manager']);
            const recipientIds = new Set([
                parsed.data.assignedTo || lead.assignedTo,
                ...adminRecipients.map((recipient) => recipient.userId),
            ].filter((recipientId) => recipientId && recipientId !== req.user?.userId));

            services.NotificationService.dispatchMany([...recipientIds].map((recipientId) => ({
                recipientId,
                type: 'LEAD_STATUS_CHANGE',
                title: 'Lead Status Updated',
                message: `${lead.firstName} ${lead.lastName} moved from ${lead.status || 'Unknown'} to ${parsed.data.status}`,
                link: `/leads/${lead.id}`,
                referenceId: lead.id,
                referenceType: 'Lead',
                createdBy: req.user?.userId
            })), 'UPDATE_LEAD');
        }

        return res.status(200).json({
            success: true,
            message: 'Lead updated successfully',
        });
    } catch (e) {
        logger('LEADS_PATCH').error(e);
        return serverError(res, e, 'Failed to update lead.');
    }
});

// 5. DELETE /api/leads/:leadId - Delete an individual lead
router.delete('/:leadId', middlewares.adminOnly, async (req, res) => {
    try {
        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return clientError(res, 404, 'Lead not found');
        }

        await db.deleteLead(req.params.leadId);

        return res.status(200).json({
            success: true,
            message: 'Lead deleted successfully',
        });
    } catch (e) {
        logger('LEADS_DELETE').error(e);
        return serverError(res, e, 'Failed to delete lead.');
    }
});

/** EXPORTS */
module.exports = router;