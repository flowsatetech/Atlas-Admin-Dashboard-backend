const express = require('express');
const { z } = require('zod');
const { logger, generateToken, clientError, serverError } = require('../helpers');
const db = require('../db');
const middlewares = require('../middlewares');

const router = express.Router();

function webhookAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token || token !== process.env.WEBHOOK_BEARER_TOKEN) {
        return clientError(res, 401, 'Unauthorized');
    }
    next();
}

function splitName(fullName) {
    const parts = String(fullName).trim().split(/\s+/);
    return {
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
    };
}

const qualifiedLeadSchema = z.object({
    form_type: z.string().trim().optional(),
    name: z.string().trim().min(1, 'Name is required'),
    email: z.string().trim().email('Invalid email address'),
    phone: z.string().trim().optional().default(''),
    service: z.string().trim().optional().default(''),
    budget: z.string().trim().optional().default(''),
    details: z.string().trim().optional().default(''),
});

const generalLeadSchema = z.object({
    name: z.string().trim().min(1, 'Name is required'),
    email: z.string().trim().email('Invalid email address'),
    phone: z.string().trim().optional().default(''),
    business: z.string().trim().optional().default(''),
    service: z.string().trim().optional().default(''),
    challenge: z.string().trim().optional().default(''),
    budget: z.string().trim().optional().default(''),
});

router.post('/leads/qualified', webhookAuth, async (req, res) => {
    try {
        const parsed = qualifiedLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            return clientError(res, 400, 'Invalid payload', parsed.error.issues.map(i => i.message));
        }

        const { name, email, phone, service, budget, details } = parsed.data;
        const { firstName, lastName } = splitName(name);
        const notes = [
            service   && `Service: ${service}`,
            budget    && `Budget: ${budget}`,
            details   && `Details: ${details}`,
        ].filter(Boolean).join('\n');

        const now = Date.now();
        await db.addLead({
            id: generateToken(),
            firstName,
            lastName,
            fullName: name,
            email,
            phone,
            company: '',
            status: 'qualified',
            stage: 'Qualified Lead',
            source: 'quote_request',
            notes,
            value: 0,
            contactPerson: '',
            assignedTo: '',
            createdAt: now,
            updatedAt: now,
        });

        logger('WEBHOOK').info(`Qualified lead received: ${email}`);
        return res.status(201).json({ success: true, message: 'Lead received' });
    } catch (e) {
        logger('WEBHOOK').error(e);
        return serverError(res, e, 'Failed to store lead.');
    }
});

router.post('/leads/general', webhookAuth, async (req, res) => {
    try {
        const parsed = generalLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            return clientError(res, 400, 'Invalid payload', parsed.error.issues.map(i => i.message));
        }

        const { name, email, phone, business, service, challenge, budget } = parsed.data;
        const { firstName, lastName } = splitName(name);
        const notes = [
            service   && `Service: ${service}`,
            budget    && `Budget: ${budget}`,
            challenge && `Challenge: ${challenge}`,
        ].filter(Boolean).join('\n');

        const now = Date.now();
        await db.addLead({
            id: generateToken(),
            firstName,
            lastName,
            fullName: name,
            email,
            phone,
            company: business,
            status: 'new',
            stage: 'General Lead',
            source: 'book_a_call',
            notes,
            value: 0,
            contactPerson: '',
            assignedTo: '',
            createdAt: now,
            updatedAt: now,
        });

        logger('WEBHOOK').info(`General lead received: ${email}`);
        return res.status(201).json({ success: true, message: 'Lead received' });
    } catch (e) {
        logger('WEBHOOK').error(e);
        return serverError(res, e, 'Failed to store lead.');
    }
});

module.exports = router;
