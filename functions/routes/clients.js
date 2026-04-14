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
const { clientStatusEnum } = require('../models/client');
const services = require('../services');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { clients } = middlewares.rateLimiters;

const listClientsQuerySchema = z.object({
    status: clientStatusEnum.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});

const createClientRequestSchema = z.object({
    fullName: z.string().min(1),
    companyName: z.string().min(1),
    email: z.email(),
    phone: z.string().min(3),
    status: clientStatusEnum.default('Lead'),
    tags: z.array(z.string().min(1)).default([]),
    assignedStaffId: z.string().min(1).nullable().optional(),
    leadSource: z.string().min(1).nullable().optional(),
    notes: z.string().optional()
});

/** MAIN USER ROUTES */
router.get('/', clients, async (req, res) => {
    try {
        const parsedQuery = listClientsQuerySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return res.status(400).json({
                success: false,
                message: 'Invalid query parameters',
                data: {
                    errors: parsedQuery.error.issues.map((issue) => issue.message)
                }
            });
        }

        const { status, page, limit } = parsedQuery.data;
        const { rows, total } = await db.getClientsPaginated({ status, page, limit });

        const managerIds = [...new Set(
            rows
                .map((client) => client.assignedStaffId)
                .filter(Boolean)
        )];

        const managersMap = {};
        await Promise.all(managerIds.map(async (managerId) => {
            const manager = await db.getUserById(managerId);
            managersMap[managerId] = manager
                ? `${manager.firstName || ''} ${manager.lastName || ''}`.trim() || manager.email || managerId
                : 'Unassigned';
        }));

        const formattedClients = rows.map((clientDoc) => ({
            id: clientDoc.id,
            fullName: clientDoc.fullName,
            company: clientDoc.companyName,
            status: clientDoc.status,
            tags: clientDoc.tags || [],
            manager: clientDoc.assignedStaffId ? (managersMap[clientDoc.assignedStaffId] || 'Unassigned') : 'Unassigned',
            projectsCount: clientDoc.projectsCount || 0
        }));

        res.status(200).json({
            success: true,
            message: 'Fetch clients success',
            data: {
                clients: formattedClients,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (e) {
        logger('ALL_CLIENTS').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

router.post('/', middlewares.adminOnly, clients, async (req, res) => {
    try {
        const validData = createClientRequestSchema.safeParse(req.body);

        if (!validData.success) {
            return res.status(400).json({
                success: false,
                message: 'Couldn\'t complete create client request',
                data: {
                    errors: validData.error.issues.map((issue) => issue.message)
                }
            })
        }

        const clientData = validData.data;
        const now = Date.now();

        const newClient = {
            id: generateToken(),
            fullName: clientData.fullName,
            companyName: clientData.companyName,
            email: clientData.email,
            phone: clientData.phone,
            status: clientData.status || 'Lead',
            tags: clientData.tags || [],
            assignedStaffId: clientData.assignedStaffId || null,
            leadSource: clientData.leadSource || null,
            notes: clientData.notes || '',
            projectsCount: 0,
            createdAt: now,
            updatedAt: now
        };

        await db.addClient(newClient);
        await services.logActivity({
            type: 'client.created',
            actorId: req.user?.userId || null,
            entityId: newClient.id,
            entityType: 'client',
            message: `${newClient.fullName} was added as a new client`,
            meta: {
                companyName: newClient.companyName,
                status: newClient.status
            }
        });
        await services.recordAnalyticsEvent({
            visitorsDelta: 1,
            pageViewsDelta: 1,
            trafficSource: newClient.leadSource || 'Direct'
        });

        res.status(201).json({
            success: true,
            message: 'Client added successfully',
            data: {
                client: {
                    id: newClient.id,
                    fullName: newClient.fullName,
                    company: newClient.companyName,
                    status: newClient.status,
                    tags: newClient.tags,
                    manager: newClient.assignedStaffId || 'Unassigned',
                    projectsCount: 0
                }
            }
        });
    } catch (e) {
        logger('NEW_CLIENT').error(e);
        res.status(400).json({
            success: false, message: 'An unknown error occured'
        })
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
