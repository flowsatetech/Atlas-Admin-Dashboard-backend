/** IMPORT
 * All libraries / local exports / packages are imported here
 */
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcrypt');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, serverError, clientError, uploadProfilePicture, deleteCloudinaryAsset } = require('../helpers');
const db = require('../db');
const { createMemberSchema, updateMemberSchema, adminChangeMemberPasswordSchema } = require('../models/user');
const services = require('../services');

/** SETUP */
const router = express.Router();
const { membersRead, membersWrite, createMember: createMemberRateLimiter } = middlewares.rateLimiters;

const profilePictureUpload = multer({
    limits: { fileSize: 5 * 1024 * 1024 },
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        const allowedExtensions = /\.(jpe?g|png|webp)$/i;

        if (!allowedMimeTypes.has(file.mimetype)) {
            return cb(new Error('Profile picture must be a JPEG, PNG, or WebP image'), false);
        }

        if (!allowedExtensions.test(file.originalname || '')) {
            return cb(new Error('Profile picture file extension must be .jpg, .jpeg, .png, or .webp'), false);
        }

        return cb(null, true);
    },
});

const profilePictureUploadHandler = profilePictureUpload.single('picture');
const profilePictureUploadMiddleware = (req, res, next) => {
    profilePictureUploadHandler(req, res, (err) => {
        if (!err) return next();

        return res.status(400).json({
            success: false,
            message: 'Profile picture upload error',
            data: { error: err.message },
        });
    });
};

const formatMember = (member) => ({
    userId: member.userId,
    firstName: member.firstName,
    lastName: member.lastName,
    fullName: member.fullName,
    email: member.email,
    phone: member.phone ?? null,
    role: member.role,
    job: member.job ?? null,
    status: member.status ?? null,
    avatarUrl: member.avatarUrl ?? null,
    lastLogin: member.lastLogin ?? null,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
});

/** MAIN USER ROUTES */

// 1. GET /api/members - Paginated list of staff
router.get('/', membersRead, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const search = req.query.search || "";

        const result = await db.getAllMembers({ page, limit, search });

        res.status(200).json({
            success: true,
            message: 'Staff members fetched successfully',
            data: {
                members: result.members.map(formatMember),
                pagination: result.pagination,
            }
        });
    } catch (e) {
        logger('MEMBERS_GET').error(e);
        return serverError(res, e, 'Failed to fetch staff members.');
    }
});

// 2. POST /api/members - Add new staff member (admin only)
router.post('/', middlewares.adminOnly, createMemberRateLimiter, async (req, res) => {
    try {
        const validData = createMemberSchema.safeParse(req.body);
        if (!validData.success) {
            return clientError(res, 400, 'Couldn\'t create member. Some fields are missing or invalid.', validData.error.issues.map(i => i.message));
        }

        const { firstName, lastName, email, phone, password, role, job, status } = validData.data;

        const existing = await db.getUserByEmail(email);
        if (existing) {
            return clientError(res, 409, 'A member with this email already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = generateToken();
        const stamp = `${generateToken()}_stamp_${Date.now()}`;

        const now = Date.now();
        const { userSchema } = require('../models/user');
        const defaultNotificationPreferences = userSchema.shape.notificationPreferences.parse(undefined);

        const newMember = {
            userId,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            email,
            phone,
            password: hashedPassword,
            role,
            job: job || null,
            status,
            authProvider: 'atlas',
            createdAt: now,
            updatedAt: now,
            lastLogin: null,
            stamp,
            notificationPreferences: defaultNotificationPreferences
        };

        await db.addMember(newMember);

        res.status(201).json({
            success: true,
            message: 'Member added successfully',
            data: {
                user: formatMember(newMember)
            }
        });
    } catch (e) {
        if (e.code === 11000) {
            return clientError(res, 409, 'A member with this email already exists');
        }
        logger('MEMBERS_POST').error(e);
        return serverError(res, e, 'Failed to create member.');
    }
});

// 3. PUT /api/members/:id/password - Change a member's password (admin only)
router.put('/:id/password', middlewares.adminOnly, membersWrite, async (req, res) => {
    try {
        const validData = adminChangeMemberPasswordSchema.safeParse(req.body);
        if (!validData.success) {
            return clientError(res, 400, 'Invalid password data.', validData.error.issues.map(i => i.message));
        }

        const userId = req.params.id;
        const existing = await db.getUserById(userId);
        if (!existing) {
            return clientError(res, 404, 'Member not found');
        }

        const hashedPassword = await bcrypt.hash(validData.data.password, 10);
        await db.updateUser(userId, {
            password: hashedPassword,
            stamp: null,
            updatedAt: Date.now()
        });

        services.NotificationService.dispatch({
            recipientId: existing.userId,
            type: 'PASSWORD_UPDATED',
            title: 'Password Updated',
            message: 'Your account password was updated by an administrator.',
            link: '/profile',
            referenceId: existing.userId,
            referenceType: 'User',
            createdBy: req.user?.userId,
            _emailContext: { NEW_PASSWORD: validData.data.password }
        }, 'MEMBERS_PASSWORD_PUT');

        res.status(200).json({
            success: true,
            message: 'Member password updated successfully'
        });
    } catch (e) {
        logger('MEMBERS_PASSWORD_PUT').error(e);
        return serverError(res, e, 'Failed to update member password.');
    }
});

// 4. PATCH /api/members/:id - Update staff member
router.patch('/:id', middlewares.adminOnly, membersWrite, async (req, res) => {
    try {
        const validData = updateMemberSchema.safeParse(req.body);
        if (!validData.success) {
            return clientError(res, 400, 'Invalid update data.', validData.error.issues.map(i => i.message));
        }

        const userId = req.params.id;

        const existing = await db.getUserById(userId);
        if (!existing) {
            return clientError(res, 404, 'Member not found');
        }

        const updateData = { ...validData.data, updatedAt: Date.now() };
        if (updateData.firstName || updateData.lastName) {
            updateData.fullName = `${updateData.firstName || existing.firstName} ${updateData.lastName || existing.lastName}`;
        }
        await db.updateUser(userId, updateData);

        if (updateData.role && updateData.role !== existing.role) {
            services.NotificationService.dispatch({
                recipientId: existing.userId,
                type: 'ROLE_CHANGE',
                title: 'Role Updated',
                message: `Your role has been updated to: ${updateData.role}`,
                createdBy: req.user?.userId
            }, 'MEMBERS_PATCH');
        }

        res.status(200).json({
            success: true,
            message: 'Member updated successfully'
        });
    } catch (e) {
        logger('MEMBERS_PATCH').error(e);
        return serverError(res, e, 'Failed to update member.');
    }
});

// 5. PUT /api/members/:id/picture - Upload or replace a staff member's profile picture (admin only)
router.put('/:id/picture', middlewares.adminOnly, membersWrite, profilePictureUploadMiddleware, async (req, res) => {
    try {
        const memberId = req.params.id;
        const member = await db.getUserById(memberId);
        if (!member) {
            return clientError(res, 404, 'Member not found');
        }

        if (!req.file) {
            return clientError(res, 400, 'No profile picture uploaded');
        }

        const uploaded = await uploadProfilePicture(req.file);

        if (member.avatarPublicId) {
            try {
                await deleteCloudinaryAsset(member.avatarPublicId, member.avatarResourceType || 'image');
            } catch (deleteError) {
                logger('DELETE_OLD_MEMBER_PICTURE').error(deleteError);
            }
        }

        const updateData = {
            avatarUrl: uploaded.secure_url || uploaded.url,
            avatarPublicId: uploaded.public_id,
            avatarResourceType: uploaded.resource_type || 'image',
            updatedAt: Date.now(),
        };

        await db.updateUser(memberId, updateData);

        res.status(200).json({
            success: true,
            message: 'Member picture updated successfully',
            data: {
                member: formatMember({ ...member, ...updateData }),
            }
        });
    } catch (e) {
        logger('UPDATE_MEMBER_PICTURE').error(e);

        if (e.statusCode === 400) {
            return clientError(res, 400, e.message);
        }

        return serverError(res, e, 'Failed to update member picture.');
    }
});

// 6. DELETE /api/members/:memberId - Delete staff member (admin only)
router.delete('/:memberId', middlewares.adminOnly, membersWrite, async (req, res) => {
    try {
        const member = await db.getUserById(req.params.memberId);
        if (!member) {
            return clientError(res, 404, 'Staff member not found');
        }

        await db.deleteUserById(req.params.memberId);

        res.status(200).json({
            success: true,
            message: 'Staff member removed successfully'
        });
    } catch (e) {
        logger('MEMBERS_DELETE').error(e);
        return serverError(res, e, 'Failed to delete member.');
    }
});

/** EXPORTS */
module.exports = router;