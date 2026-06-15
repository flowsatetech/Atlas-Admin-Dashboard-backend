/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, getAuthCookieOptions, serverError, clientError } = require('../helpers');
const db = require('../db');
const { loginSchema } = require('../models/user');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { authLoginIp, authLogin, logout } = middlewares.rateLimiters;
const { userAlreadyAuth, authMiddleware } = middlewares;

/** MAIN AUTH ROUTES */

router.post('/test-reset-password', async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return clientError(res, 404, 'Route not found');
        }

        const schema = z.object({
            email: z.email(),
            password: z.string().min(8, 'Password must be at least 8 characters'),
            resetCode: z.string().min(1, 'Reset code is required'),
        });

        const validData = schema.safeParse(req.body);
        if (!validData.success) {
            return clientError(res, 400, 'Invalid reset password request', validData.error.issues.map(i => i.message));
        }

        const configuredResetCode = process.env.TEST_PASSWORD_RESET_SECRET;
        if (!configuredResetCode) {
            return clientError(res, 503, 'Test password reset is not configured');
        }

        const { email, password, resetCode } = validData.data;
        if (resetCode.trim() !== configuredResetCode.trim()) {
            return clientError(res, 403, 'Invalid reset code');
        }

        const user = await db.getUserByEmail(email);
        if (!user) {
            return clientError(res, 404, 'User not found');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.updateUser(user.userId, {
            password: hashedPassword,
            stamp: null,
            updatedAt: Date.now(),
        });

        res.clearCookie("auth_token", getAuthCookieOptions());

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully. You can now log in with the new password.',
            data: {
                user: {
                    userId: user.userId,
                    email: user.email,
                    role: user.role || 'staff',
                }
            }
        });
    } catch (e) {
        logger('TEST_RESET_PASSWORD').error(e);
        return serverError(res, e, 'Password reset failed. Please try again.');
    }
});

router.post('/login', authLoginIp, authLogin, userAlreadyAuth, async (req, res) => {
    try {
        const validData = loginSchema.safeParse(req.body);

        if(!validData.success) {
            return clientError(res, 400, 'Couldn\'t complete login request', validData.error.issues.map(i => i.message));
        }
        const { email, password, rememberMe } = validData.data;

        /** Check if user doesn't exists in the db / password not matching */
        const user = await db.getUserByEmail(email);
        if (!user) {
            return clientError(res, 401, 'Invalid email or password');
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return clientError(res, 401, 'Invalid email or password');
        }

        /** Prepare new auth cookie and reload stamp to invalidate all old cookies */
        const stamp = `${generateToken()}_stamp_${Date.now()}`;

        const ms = (days) => days * 24 * 60 * 60 * 1000;
        const duration = rememberMe ? ms(30) : 60 * 60 * 1000;
        const token = jwt.sign(
            { userId: user.userId, email: user.email, firstName: user.firstName, lastName: user.lastName, stamp },
            process.env.JWT_SECRET,
            { expiresIn: Math.floor(duration / 1000) }
        );

        /** Update user's last login timestamp and new cookie stamp */
        await db.updateUser(user.userId, {
            lastLogin: Date.now(),
            stamp
        });

        res.cookie("auth_token", token, getAuthCookieOptions({ maxAge: duration }));

        res.status(200).json({
            success: true,
            message: 'Signed in successfully',
            data: {
                user: {
                    userId: user.userId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role || 'staff'
                }
            }
        });
    } catch (e) {
        logger('SIGNIN').error(e);
        return serverError(res, e, 'Login failed. Please try again.');
    }
});

router.post('/logout', authMiddleware, logout, async (req, res) => {
    try {
        res.clearCookie("auth_token", getAuthCookieOptions());

        await db.updateUser(req.user.userId, { stamp: null })

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        logger('LOGOUT').error(error);
        return serverError(res, error, 'Logout failed. Please try again.');
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
