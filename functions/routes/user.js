/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger } = require('../helpers');
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
            return res.status(401).json({
                success: false,
                message: 'Invalid User'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Fetch profile success',
            data: {
                profile: {
                    userId: user.userId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email
                }
            }
        });
    } catch (e) {
        logger('SIGNIN').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;