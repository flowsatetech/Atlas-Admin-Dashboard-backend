/** IMPORT
 * All libraries / local exports / packages are imported here
 */
const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, isEmpty } = require('../helpers');
const db = require('../db');

/** SETUP */
const router = express.Router();
const { members: membersRateLimiter, createMember: createMemberRateLimiter } = middlewares.rateLimiters;

/** MAIN USER ROUTES */

// 1. GET /api/members - Paginated list of staff
router.get('/', middlewares.adminOnly, membersRateLimiter, async (req, res) => {
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

// 2. POST /api/members - Add new staff member (admin only)
router.post('/', middlewares.adminOnly, createMemberRateLimiter, async (req, res) => {
    try {
        const schema = z.object({
            firstName: z.string().min(1, 'First name is required'),
            lastName: z.string().min(1, 'Last name is required'),
            email: z.string().email('Invalid email address'),
            password: z.string().min(8, 'Password must be at least 8 characters'),
            role: z.enum(['admin', 'staff']),
            job: z.string().optional()
        });

        const validData = schema.safeParse(req.body);
        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t create member. Some fields are missing or invalid.',
            });
        }

        const { firstName, lastName, email, password, role, job } = validData.data;

        const empty = isEmpty({ firstName, lastName, email, password });
        if (empty) {
            return res.status(400).json({
                success: false,
                message: `${empty} is required but is empty`
            });
        }

        const existing = await db.getUserByEmail(email);
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'A member with this email already exists'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = generateToken();
        const stamp = `${generateToken()}_stamp_${Date.now()}`;

        const newMember = {
            userId,
            firstName,
            lastName,
            email,
            password: hashedPassword,
            role,
            job: job || null,
            status: 'active',
            authProvider: 'atlas',
            createdAt: Date.now(),
            lastLogin: null,
            stamp
        };

        await db.addMember(newMember);

        res.status(201).json({
            success: true,
            message: 'Member added successfully',
            data: {
                user: { userId, firstName, lastName, email, role, job: newMember.job }
            }
        });
    } catch (e) {
        logger('MEMBERS_POST').error(e);
        res.status(500).json({
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

        const validData = schema.safeParse(req.body);
        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid update data.',
            });
        }

        const userId = req.params.id;
        const result = await db.updateUser(userId, validData.data);

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
        logger('MEMBERS_PUT').error(e);
        res.status(500).json({ 
            success: false, 
            message: 'An unknown error occurred' 
        });
    }
});

/** EXPORTS */
module.exports = router;