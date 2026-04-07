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
const { clients } = middlewares.rateLimiters;

/** MAIN USER ROUTES */
router.get('/all', clients, async (req, res) => {
    try {
        const clients = await db.getClients();

        res.status(200).json({
            success: true,
            message: 'Fetch clients success',
            data: {
                clients
            }
        });
    } catch (e) {
        logger('ALL_PROJECTS').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.post('/new', middlewares.adminOnly, clients, async (req, res) => {
    try {
        const validData = z.object({
            name: z.string().min(1)
        }).safeParse(req.body);

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t complete signup request'
            })
        }

        const { name } = validData.data;

        await db.addClient({ name, id: generateToken() })

        res.status(200).json({
            success: true,
            message: 'Project added successfully'
        });
    } catch (e) {
        logger('NEW_PROJECT').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;