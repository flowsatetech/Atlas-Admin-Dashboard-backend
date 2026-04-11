/** IMPORT */
const express = require('express');
const { z } = require('zod');
const middlewares = require('../middlewares');
const { logger } = require('../helpers');
const db = require('../db');

/** SETUP */
const router = express.Router();
const { clients: rateLimiter } = middlewares.rateLimiters;

/** CLIENT ROUTES */

// GET /api/clients - Paginated list of clients [cite: 34, 37]
router.get('/', rateLimiter,async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const result = await db.getClients({ page, limit });

        res.status(200).json({
            success: true,
            message: 'Clients fetched successfully',
            data: result
        });
    } catch (e) {
        logger('CLIENTS_GET').error(e);
        res.status(400).json({ success: false, message: 'An unknown error occurred' });
    }
});

// POST /api/clients - Create a new client [cite: 38, 39, 40]
router.post('/', rateLimiter, async (req, res) => {
    try {
        // Validation schema based on Page 2 of the Backend Plan 
        const clientSchema = z.object({
            fullName: z.string().min(1),
            companyId: z.string(), // Plan: use IDs, not names [cite: 4]
            email: z.string().email(),
            phone: z.string(),
            statusId: z.string(),
            tags: z.array(z.string()),
            assignedStaffId: z.string(),
            notes: z.string().default("")
        });

        const validation = clientSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request body',
                errors: validation.error.errors
            });
        }

        const newClient = await db.addClient(validation.data);

        res.status(201).json({
            success: true,
            message: 'Client added successfully',
            data: newClient // Returning the new object 
        });
    } catch (e) {
        logger('CLIENTS_POST').error(e);
        res.status(400).json({ success: false, message: 'An unknown error occurred' });
    }
});

module.exports = router;