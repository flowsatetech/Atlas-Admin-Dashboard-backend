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
const { dashboard } = middlewares.rateLimiters;

/** MAIN USER ROUTES */
router.get('/general/info', dashboard, async (req, res) => {
    try {
        const user = req.db_user;
        return res.status(200).json({
            success: true,
            data: {
                activeProjects: [0,0],
                newLeads: [0,0],
                campaignReach: [0,0],
                engagementRate: [0,0]
            }
        });

    } catch (e) {
        logger('GETINFO').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;