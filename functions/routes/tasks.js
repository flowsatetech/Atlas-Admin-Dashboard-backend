const express = require('express');
const { z } = require('zod');
const middlewares = require('../middlewares');
const { logger } = require('../helpers');
const db = require('../db');

const router = express.Router();
const { tasks: tasksRateLimiter } = middlewares.rateLimiters;

// 1. GET /api/tasks - Fetch all tasks (can filter by assignedTo)
router.get('/', tasksRateLimiter, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const assignedTo = req.query.assignedTo || null;

        const result = await db.getTasks({ page, limit, assignedTo });

        res.status(200).json({
            success: true,
            message: 'Tasks fetched successfully',
            data: result
        });
    } catch (e) {
        logger('TASKS_GET').error(e);
        res.status(400).json({ success: false, message: 'An unknown error occurred' });
    }
});

// 2. POST /api/tasks - Create a new task linked to a staff member
router.post('/', tasksRateLimiter, async (req, res) => {
    try {
        const schema = z.object({
            title: z.string().min(3),
            description: z.string().optional(),
            priority: z.enum(['low', 'medium', 'high']),
            assignedTo: z.string().min(1), // This should be a staff_id
            dueDate: z.string().optional()
        });

        const validatedData = schema.parse(req.body);

        // Optional: Check if the staff member actually exists before assigning
        const staff = await db.getUserById(validatedData.assignedTo);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Assigned staff member not found' });
        }

        const newTask = await db.addTask({
            ...validatedData,
            status: 'pending',
            taskId: `task_${Date.now()}`,
            createdAt: new Date().toISOString()
        });

        res.status(201).json({
            success: true,
            message: 'Task created and assigned successfully',
            data: newTask
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return res.status(400).json({ success: false, errors: e.errors });
        }
        logger('TASKS_POST').error(e);
        res.status(400).json({ success: false, message: 'Failed to create task' });
    }
});

module.exports = router;