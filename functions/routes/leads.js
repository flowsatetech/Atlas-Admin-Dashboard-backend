/** IMPORT */
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, stripMongoId, serverError, clientError } = require('../helpers');
const db = require('../db');
const { createLeadSchema, updateLeadSchema, leadStatusEnum } = require('../models/lead');

/** SETUP */
const router = express.Router();
const { leads: leadsRateLimiter } = middlewares.rateLimiters;

const emptyToUndefined = (value) => (value === "" ? undefined : value);
const listLeadsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    status: z.preprocess(emptyToUndefined, leadStatusEnum.optional()),
});

/** MAIN LEADS ROUTES */

// 1. GET /api/leads - Paginated list of leads with search
router.get('/', leadsRateLimiter, async (req, res) => {
    try {
        const parsed = listLeadsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return clientError(res, 400, 'Invalid query parameters.', parsed.error.issues.map(i => i.message));
        }

        const { page, limit, search = "", status = "" } = parsed.data;
        const result = await db.getAllLeads({ page, limit, search, status });

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
router.post('/', middlewares.adminOnly, leadsRateLimiter, async (req, res) => {
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
router.get('/:leadId', leadsRateLimiter, async (req, res) => {
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
router.patch('/:leadId', middlewares.adminOnly, leadsRateLimiter, async (req, res) => {
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
router.delete('/:leadId', middlewares.adminOnly, leadsRateLimiter, async (req, res) => {
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