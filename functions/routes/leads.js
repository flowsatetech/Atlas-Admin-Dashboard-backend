/** IMPORT */
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger } = require('../helpers');
const db = require('../db');

/** SETUP */
const router = express.Router();
// Use the members rate limiter or create a new one in rate_limiters.js later
const { members: leadsRateLimiter } = middlewares.rateLimiters;

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
        const schema = z.object({
            firstName: z.string().min(1, "First name is required"),
            lastName: z.string().min(1, "Last name is required"),
            email: z.string().email("Invalid email address"),
            phone: z.string().optional(),
            company: z.string().optional(),
            source: z.string().optional(),
        });

        const validatedData = schema.parse(req.body);
        
        const newLead = await db.addLead({
            ...validatedData,
            id: `lead_${Date.now()}`,
            status: 'new',
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

/** EXPORTS */
module.exports = router;