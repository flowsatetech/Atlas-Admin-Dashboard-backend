/** IMPORT */
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger } = require('../helpers');
const db = require('../db');
const { LeadSchema } = require('../models/lead');

/** SETUP */
const router = express.Router();

/** * RATE LIMITER 
 * Now using the specific leads rate limiter as requested 
 */
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

        res.status(200).json({
            status: "success",
            code: 200,
            data: result,
            message: 'Leads fetched successfully'
        });
    } catch (e) {
        logger('LEADS_GET').error(e);
        res.status(400).json({ 
            status: "error",
            code: 400,
            message: 'Failed to fetch leads' 
        });
    }
});

// 2. POST /api/leads - Add a new lead
router.post('/', leadsRateLimiter, async (req, res) => {
    try {
        /** * REUSABLE VALIDATION 
         * Using LeadSchema from functions/models/lead.js 
         */
        const validatedData = LeadSchema.parse(req.body);
        
        const newLead = await db.addLead({
            ...validatedData,
            id: `lead_${Date.now()}`,
            createdAt: new Date().toISOString()
        });

        res.status(201).json({
            status: "success",
            code: 201,
            data: newLead,
            message: 'Lead added successfully'
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ 
                status: "error",
                code: 400,
                errors: e.errors.map(err => err.message) 
            });
        }
        logger('LEADS_POST').error(e);
        res.status(400).json({ 
            status: "error",
            code: 400,
            message: 'Failed to add lead' 
        });
    }
});

// 3. GET /api/leads/:leadId - Get details of a single lead
router.get('/:leadId', leadsRateLimiter, async (req, res) => {
    try {
        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return res.status(404).json({
                status: "error",
                code: 404,
                message: 'Lead not found'
            });
        }

        res.status(200).json({
            status: "success",
            code: 200,
            data: lead,
            message: 'Lead details fetched successfully'
        });
    } catch (e) {
        logger('LEADS_DETAIL_GET').error(e);
        res.status(400).json({ 
            status: "error",
            code: 400,
            message: 'Failed to fetch lead details' 
        });
    }
});

// 4. PATCH /api/leads/:leadId - Update an individual lead
router.patch('/:leadId', leadsRateLimiter, async (req, res) => {
    try {
        const updateSchema = LeadSchema.partial();
        const validatedData = updateSchema.parse(req.body);

        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return res.status(404).json({
                status: "error",
                code: 404,
                message: 'Lead not found'
            });
        }

        const updates = {
            ...validatedData,
            updatedAt: new Date().toISOString()
        };

        await db.updateLead(req.params.leadId, updates);

        res.status(200).json({
            status: "success",
            code: 200,
            message: 'Lead updated successfully'
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ 
                status: "error",
                code: 400,
                errors: e.errors.map(err => err.message) 
            });
        }
        logger('LEADS_PATCH').error(e);
        res.status(400).json({ 
            status: "error",
            code: 400,
            message: 'Failed to update lead' 
        });
    }
});

// 5. DELETE /api/leads/:leadId - Delete an individual lead
router.delete('/:leadId', leadsRateLimiter, async (req, res) => {
    try {
        const lead = await db.getLeadById(req.params.leadId);
        if (!lead) {
            return res.status(404).json({
                status: "error",
                code: 404,
                message: 'Lead not found'
            });
        }

        await db.deleteLead(req.params.leadId);

        res.status(200).json({
            status: "success",
            code: 200,
            message: 'Lead successfully deleted'
        });
    } catch (e) {
        logger('LEADS_DELETE').error(e);
        res.status(400).json({ 
            status: "error",
            code: 400,
            message: 'Failed to delete lead' 
        });
    }
});

/** EXPORTS */
module.exports = router;