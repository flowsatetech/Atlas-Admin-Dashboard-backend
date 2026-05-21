/** IMPORT */
const express = require('express');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, stripMongoId } = require('../helpers');
const db = require('../db');
const { createLeadSchema, updateLeadSchema } = require('../models/lead');

/** SETUP */
const router = express.Router();
const { leads: leadsRateLimiter } = middlewares.rateLimiters;

/** MAIN LEADS ROUTES */

// 1. GET /api/leads - Paginated list of leads with search
router.get('/', leadsRateLimiter, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const status = req.query.status || "";

        const result = await db.getAllLeads({ page, limit, search, status });

        return res.status(200).json({
            success: true,
            message: 'Leads fetched successfully',
            data: stripMongoId(result),
        });
    } catch (e) {
        logger('LEADS_GET').error(e);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch leads',
        });
    }
});

// 2. POST /api/leads - Add a new lead
router.post('/', leadsRateLimiter, async (req, res) => {
    try {
        const parsed = createLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t create lead. Some fields are missing or invalid.',
                data: { errors: parsed.error.issues.map(i => i.message) },
            });
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
        return res.status(500).json({
            success: false,
            message: 'Failed to add lead',
        });
    }
});

// 3. GET /api/leads/:leadId - Get details of a single lead
router.get('/:leadId', leadsRateLimiter, async (req, res) => {
    try {
        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Lead details fetched successfully',
            data: { lead: stripMongoId(lead) },
        });
    } catch (e) {
        logger('LEADS_DETAIL_GET').error(e);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch lead details',
        });
    }
});

// 4. PATCH /api/leads/:leadId - Update an individual lead
router.patch('/:leadId', leadsRateLimiter, async (req, res) => {
    try {
        const parsed = updateLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid update data.',
                data: { errors: parsed.error.issues.map(i => i.message) },
            });
        }

        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found',
            });
        }

        await db.updateLead(req.params.leadId, { ...parsed.data, updatedAt: Date.now() });

        return res.status(200).json({
            success: true,
            message: 'Lead updated successfully',
        });
    } catch (e) {
        logger('LEADS_PATCH').error(e);
        return res.status(500).json({
            success: false,
            message: 'Failed to update lead',
        });
    }
});

// 5. DELETE /api/leads/:leadId - Delete an individual lead
router.delete('/:leadId', leadsRateLimiter, async (req, res) => {
    try {
        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found',
            });
        }

        await db.deleteLead(req.params.leadId);

        return res.status(200).json({
            success: true,
            message: 'Lead deleted successfully',
        });
    } catch (e) {
        logger('LEADS_DELETE').error(e);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete lead',
        });
    }
});

/** EXPORTS */
module.exports = router;