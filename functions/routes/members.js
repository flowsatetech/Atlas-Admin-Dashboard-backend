/** IMPORT
 * All libraries / local exports / packages are imported here
 */
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger } = require('../helpers');
const db = require('../db');

/** SETUP */
const router = express.Router();
const { members: membersRateLimiter } = middlewares.rateLimiters;

/** MAIN USER ROUTES */

// 1. GET /api/members - Paginated list of staff
router.get('/', membersRateLimiter, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";

        const result = await db.getAllMembers({ page, limit, search });

        res.status(200).json({
            success: true,
            message: 'Staff members fetched successfully',
            data: result
        });
    } catch (e) {
        logger('MEMBERS_GET').error(e);
        res.status(400).json({ 
            success: false, 
            message: 'An unknown error occurred' 
        });
    }
});

// 2. POST /api/members - Add new staff member
router.post('/', membersRateLimiter, async (req, res) => {
    try {
        const schema = z.object({
            firstName: z.string().min(1, "First name is required"),
            lastName: z.string().min(1, "Last name is required"),
            email: z.string().email("Invalid email address"),
            role: z.enum(['admin', 'staff']),
            job: z.string().optional()
        });

        const validatedData = schema.parse(req.body);
        
        // Check if member already exists
        const existing = await db.getUserByEmail(validatedData.email);
        if (existing) {
            return res.status(409).json({ 
                success: false, 
                message: 'A member with this email already exists' 
            });
        }

        const newMember = await db.addMember({
            ...validatedData,
            userId: `staff_${Date.now()}`, // Unique ID generation
            createdAt: new Date().toISOString(),
            status: 'active'
        });

        res.status(201).json({
            success: true,
            message: 'Member added successfully',
            data: newMember
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ 
                success: false, 
                errors: e.errors.map(err => err.message) 
            });
        }
        logger('MEMBERS_POST').error(e);
        res.status(400).json({ 
            success: false, 
            message: 'An unknown error occurred' 
        });
    }
});

// 3. PUT /api/members/:id - Update staff member
router.put('/:id', middlewares.adminOnly, membersRateLimiter, async (req, res) => {
    try {
        const schema = z.object({
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            role: z.enum(['admin', 'staff']).optional(),
            job: z.string().optional(),
            status: z.string().optional()
        });

        const validatedData = schema.parse(req.body);
        const userId = req.params.id;

        const result = await db.updateUser(userId, validatedData);

        if (result.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Member not found or no changes made' 
            });
        }

        res.status(200).json({
            success: true,
            message: 'Member updated successfully'
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ 
                success: false, 
                errors: e.errors.map(err => err.message) 
            });
        }
        logger('MEMBERS_PUT').error(e);
        res.status(400).json({ 
            success: false, 
            message: 'An unknown error occurred' 
        });
    }
});

/** EXPORTS */
module.exports = router;