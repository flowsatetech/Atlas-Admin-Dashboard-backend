/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, generateToken } = require('../helpers');
const db = require('../db');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { members } = middlewares.rateLimiters;

/** MAIN USER ROUTES */
router.get('/all', members, async (req, res) => {
    try {
        let $members = await db.getAllMembers();
        const members = $members.map(({ firstName, lastName, userId: id }) => {
            return { name: firstName, id  };
        });

        res.status(200).json({
            success: true,
            message: 'Fetch members success',
            data: {
                members
            }
        });
    } catch (e) {
        logger('ALL_MEMBERS').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;