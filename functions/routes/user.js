/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, serverError, clientError } = require('../helpers');
const db = require('../db');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { profile } = middlewares.rateLimiters;

/** MAIN USER ROUTES */
router.get('/profile', profile, async (req, res) => {
    try {
        const user = req.db_user;

        /** Extra validation if user exists in the db */
        if (!user) {
            return clientError(res, 401, 'Invalid User');
        }

        res.status(200).json({
            success: true,
            message: 'Fetch profile success',
            data: {
                profile: {
                    userId: user.userId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role || 'staff'
                }
            }
        });
    } catch (e) {
        logger('GET_PROFILE').error(e);
        return serverError(res, e, 'Failed to fetch profile.');
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;