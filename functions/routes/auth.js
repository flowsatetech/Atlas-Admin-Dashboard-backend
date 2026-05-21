/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken, isEmpty, getAuthCookieOptions } = require('../helpers');
const db = require('../db');
const { loginSchema } = require('../models/user');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { authLoginIp, authLogin, logout, createMember: createMemberRateLimiter } = middlewares.rateLimiters;
const { userAlreadyAuth, authMiddleware, adminOnly } = middlewares;

/** MAIN AUTH ROUTES */
router.post('/signup', authMiddleware, adminOnly, createMemberRateLimiter, async (req, res) => {
    try {
        const validData = z.object({
            firstName: z.string().min(1, 'First name is required'),
            lastName: z.string().min(1, 'Last name is required'),
            email: z.email('Invalid email address'),
            password: z.string().min(8, 'Password must be at least 8 characters'),
            isAdmin: z.boolean().optional()
        }).safeParse(req.body);

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t create account. Some fields are missing or invalid.'
            });
        }

        const { firstName, lastName, email, password, isAdmin } = validData.data;

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
                message: 'Email already registered'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = generateToken();
        const role = isAdmin ? 'admin' : 'staff';

        const newUser = {
            userId,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            email,
            password: hashedPassword,
            role,
            status: 'active',
            authProvider: 'atlas',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastLogin: null,
            stamp: null
        };

        await db.addUser(newUser);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            data: {
                user: { userId, firstName, lastName, email, role }
            }
        });
    } catch (e) {
        logger('SIGNUP').error(e);
        res.status(500).json({
            success: false,
            message: 'An unknown error occurred'
        });
    }
});

router.post('/login', authLoginIp, authLogin, userAlreadyAuth, async (req, res) => {
    try {
        const validData = loginSchema.safeParse(req.body);

        if(!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t complete login request'
            })
        }
        const { email, password, rememberMe } = validData.data;

        /** Check if user doesn't exists in the db / password not matching */
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
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
        res.status(500).json({
            success: false, message: 'An unknown error occured'
        })
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
        res.status(500).json({
            success: false,
            message: 'Server error during logout'
        });
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
