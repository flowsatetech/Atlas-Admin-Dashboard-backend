/** IMPORT
 * All libraries / local exports / packages are imported here
 */
const express = require('express');
const bcrypt = require('bcrypt');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken } = require('../helpers');
const db = require('../db');
const { createMemberSchema, updateMemberSchema } = require('../models/user');

/** SETUP */
const router = express.Router();
const { members: membersRateLimiter, createMember: createMemberRateLimiter } = middlewares.rateLimiters;

/** MAIN USER ROUTES */

// 1. GET /api/members - Paginated list of staff
router.get('/', middlewares.adminOnly, membersRateLimiter, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const search = req.query.search || "";

        const result = await db.getAllMembers({ page, limit, search });

        const sanitizeMember = (m) => ({
            userId: m.userId,
            firstName: m.firstName,
            lastName: m.lastName,
            fullName: m.fullName,
            email: m.email,
            role: m.role,
            job: m.job ?? null,
            status: m.status ?? null,
            avatarUrl: m.avatarUrl ?? null,
            lastLogin: m.lastLogin ?? null,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
        });

        res.status(200).json({
            success: true,
            message: 'Staff members fetched successfully',
            data: {
                members: result.members.map(sanitizeMember),
                pagination: result.pagination,
            }
        });
    } catch (e) {
        logger('MEMBERS_GET').error(e);
        res.status(500).json({ 
            success: false, 
            message: 'An unknown error occurred' 
        });
    }
});

// 2. POST /api/members - Add new staff member (admin only)
router.post('/', middlewares.adminOnly, createMemberRateLimiter, async (req, res) => {
    try {
        const validData = createMemberSchema.safeParse(req.body);
        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t create member. Some fields are missing or invalid.',
            });
        }

        const { firstName, lastName, email, password, role, job } = validData.data;

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

        const now = Date.now();
        const newMember = {
            userId,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            email,
            password: hashedPassword,
            role,
            job: job || null,
            status: 'active',
            authProvider: 'atlas',
            createdAt: now,
            updatedAt: now,
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
        if (e.code === 11000) {
            return res.status(409).json({ success: false, message: 'A member with this email already exists' });
        }
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
        const validData = updateMemberSchema.safeParse(req.body);
        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid update data.',
            });
        }

        const userId = req.params.id;

        const existing = await db.getUserById(userId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'Member not found',
            });
        }

        const updateData = { ...validData.data, updatedAt: Date.now() };
        if (updateData.firstName || updateData.lastName) {
            updateData.fullName = `${updateData.firstName || existing.firstName} ${updateData.lastName || existing.lastName}`;
        }
        await db.updateUser(userId, updateData);

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

// 4. DELETE /api/members/:memberId - Delete staff member (admin only)
router.delete('/:memberId', middlewares.adminOnly, membersRateLimiter, async (req, res) => {
    try {
        const member = await db.getUserById(req.params.memberId);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Staff member not found'
            });
        }

        await db.deleteUserById(req.params.memberId);

        res.status(200).json({
            success: true,
            message: 'Staff member removed successfully'
        });
    } catch (e) {
        logger('MEMBERS_DELETE').error(e);
        res.status(500).json({
            success: false,
            message: 'An unknown error occurred'
        });
    }
});

/** EXPORTS */
module.exports = router;