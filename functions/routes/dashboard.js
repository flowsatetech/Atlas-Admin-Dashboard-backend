/** IMPORT
 * All libraries / local exports / packages are imported here
 */

// <-- PACKAGE IMPORTS -->
const express = require('express');
const { z } = require('zod');

// <-- LOCAL EXPORTS IMPORTS -->
const middlewares = require('../middlewares');
const { logger, analytics, cache } = require('../helpers');
const db = require('../db');
const { dashboard: dashboardContracts } = require('../contracts');


/** SETUP
 * Global variables referenced in this file are defined here
 */
const router = express.Router();
const { dashboard } = middlewares.rateLimiters;
const DASHBOARD_CACHE_TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS || 30_000);

const ACTIVE_PROJECT_STATUSES = ['InProgress', 'OnHold', 'Planned'];
const PENDING_TASK_STATUSES = ['Todo', 'InProgress', 'Review', 'Blocked'];

const performanceQuerySchema = z.object({
    period: z.enum(['3months', '6months', '12months']).default('6months')
});

const inProgressQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(20).default(4)
});

const activitiesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10)
});

const createdAtRangeFilter = (from, to) => ({
    createdAt: { $gte: from, $lte: to }
});

function getCalendarMonthRanges(nowTs = Date.now()) {
    const now = new Date(nowTs);
    const currentStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const currentEnd = nextMonthStart - 1;

    const previousStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const previousEnd = currentStart - 1;

    return { currentStart, currentEnd, previousStart, previousEnd };
}

function toMetricCard(value, currentPeriodValue, previousPeriodValue) {
    const changePct = analytics.percentageChange(currentPeriodValue, previousPeriodValue);
    return {
        value,
        changePct: Number(changePct.toFixed(2)),
        direction: analytics.getTrendDirection(changePct),
        compareLabel: 'Vs last month'
    };
}

function toActivityTitle(type) {
    const map = {
        'client.created': 'New Client Added',
        'project.created': 'New Project Added',
        'project.updated': 'Project Updated',
        'project.comment.created': 'Project Comment Added',
        'task.created': 'New Task Added',
        'task.updated': 'Task Updated',
        'cms.updated': 'CMS Content Updated',
        'media.uploaded': 'Media Uploaded',
        'auth.login': 'User Logged In',
        'auth.logout': 'User Logged Out'
    };

    return map[type] || 'New Activity';
}

function toProjectStatusLabel(project) {
    const status = project.status || 'InProgress';
    const progress = Number.isFinite(project.progress) ? project.progress : 0;
    const deadline = project.deadline || project.dueTime || null;

    if (status === 'OnHold' || status === 'Cancelled') return 'At Risk';
    if (status === 'Completed' || progress >= 90) return 'Finishing';
    if (deadline && deadline < Date.now() && progress < 100) return 'At Risk';
    if (progress >= 80) return 'Finishing';
    if (progress < 35) return 'At Risk';
    return 'On Track';
}

function dashboardError(res, message, status = 400, code = 'DASHBOARD_ERROR', details = []) {
    return res.status(status).json(dashboardContracts.createDashboardError(message, code, details));
}

/** MAIN DASHBOARD ROUTES */
router.get('/metrics', dashboard, async (req, res) => {
    try {
        const cacheKey = cache.buildCacheKey('dashboard:metrics', {});
        const cached = cache.getCached(cacheKey);
        if (cached) return res.status(200).json(cached);

        const range = getCalendarMonthRanges();
        const currentRange = createdAtRangeFilter(range.currentStart, range.currentEnd);
        const previousRange = createdAtRangeFilter(range.previousStart, range.previousEnd);

        const [
            totalClients,
            currentClients,
            previousClients,
            activeProjectsTotal,
            activeProjectsCurrent,
            activeProjectsPrevious,
            pendingTasksTotal,
            pendingTasksCurrent,
            pendingTasksPrevious,
            totalLeads,
            currentLeads,
            previousLeads
        ] = await Promise.all([
            db.countClientsByFilter({}),
            db.countClientsByFilter(currentRange),
            db.countClientsByFilter(previousRange),
            db.countProjectsByFilter({ status: { $in: ACTIVE_PROJECT_STATUSES } }),
            db.countProjectsByFilter({ ...currentRange, status: { $in: ACTIVE_PROJECT_STATUSES } }),
            db.countProjectsByFilter({ ...previousRange, status: { $in: ACTIVE_PROJECT_STATUSES } }),
            db.countPendingTasks(),
            db.countTasksByFilter({ ...currentRange, status: { $in: PENDING_TASK_STATUSES } }),
            db.countTasksByFilter({ ...previousRange, status: { $in: PENDING_TASK_STATUSES } }),
            db.countClientsByFilter({ status: 'Lead' }),
            db.countClientsByFilter({ ...currentRange, status: 'Lead' }),
            db.countClientsByFilter({ ...previousRange, status: 'Lead' })
        ]);

        const data = {
            totalClients: toMetricCard(totalClients, currentClients, previousClients),
            activeProjects: toMetricCard(activeProjectsTotal, activeProjectsCurrent, activeProjectsPrevious),
            pendingTasks: toMetricCard(pendingTasksTotal, pendingTasksCurrent, pendingTasksPrevious),
            newLeads: toMetricCard(totalLeads, currentLeads, previousLeads)
        };

        const response = {
            success: true,
            data
        };

        dashboardContracts.dashboardMetricsResponseSchema.parse(response);
        cache.setCached(cacheKey, response, DASHBOARD_CACHE_TTL_MS);
        return res.status(200).json(response);

    } catch (e) {
        logger('DASHBOARD_METRICS').error(e);
        return dashboardError(res, 'Failed to fetch dashboard metrics');
    }
});

router.get('/performance', dashboard, async (req, res) => {
    try {
        const parsed = performanceQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return dashboardError(
                res,
                'Invalid query parameters',
                400,
                'VALIDATION_ERROR',
                parsed.error.issues.map((issue) => issue.message)
            );
        }

        const { period } = parsed.data;
        const cacheKey = cache.buildCacheKey('dashboard:performance', { period });
        const cached = cache.getCached(cacheKey);
        if (cached) return res.status(200).json(cached);

        const range = analytics.parsePeriod(period);
        const buckets = analytics.buildDateBuckets({
            from: range.currentStart,
            to: range.currentEnd,
            unit: range.unit
        });

        const [clients, recognizedRevenueProjects] = await Promise.all([
            db.getClientsCreatedBetween(range.currentStart, range.currentEnd),
            db.getRecognizedRevenueProjectsBetween(range.currentStart, range.currentEnd)
        ]);

        const revenueSeries = buckets.map((bucket) => {
            const revenue = recognizedRevenueProjects.reduce((sum, project) => {
                if (project.recognizedAt >= bucket.start && project.recognizedAt <= bucket.end) {
                    return sum + (Number(project.recognizedRevenue) || 0);
                }
                return sum;
            }, 0);
            return Number(revenue.toFixed(2));
        });

        const newClientSeries = buckets.map((bucket) => {
            return clients.reduce((sum, client) => (
                client.createdAt >= bucket.start && client.createdAt <= bucket.end ? sum + 1 : sum
            ), 0);
        });

        const response = {
            success: true,
            data: {
                period,
                labels: buckets.map((bucket) => bucket.label),
                revenueSeries,
                newClientSeries
            }
        };

        dashboardContracts.dashboardPerformanceResponseSchema.parse(response);
        cache.setCached(cacheKey, response, DASHBOARD_CACHE_TTL_MS);
        return res.status(200).json(response);
    } catch (e) {
        logger('DASHBOARD_PERFORMANCE').error(e);
        return dashboardError(res, 'Failed to fetch dashboard performance');
    }
});

router.get('/projects/in-progress', dashboard, async (req, res) => {
    try {
        const parsed = inProgressQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return dashboardError(
                res,
                'Invalid query parameters',
                400,
                'VALIDATION_ERROR',
                parsed.error.issues.map((issue) => issue.message)
            );
        }

        const { limit } = parsed.data;
        const cacheKey = cache.buildCacheKey('dashboard:in-progress', { limit });
        const cached = cache.getCached(cacheKey);
        if (cached) return res.status(200).json(cached);

        const [projects, totalActiveProjects, allClients] = await Promise.all([
            db.getInProgressProjects(limit),
            db.countProjectsByFilter({
                $or: [
                    { status: { $in: ACTIVE_PROJECT_STATUSES } },
                    { status: { $exists: false } }
                ]
            }),
            db.getClients()
        ]);

        const clientMap = new Map(
            allClients.map((client) => [client.id, client.companyName || client.name || 'Unknown Client'])
        );

        const formattedProjects = projects.map((project, index) => {
            const clientId = project.clientId || project.client || '';
            const progress = Number.isFinite(project.progress) ? project.progress : 0;
            return {
                id: project.id || `${project.name || 'project'}-${index + 1}`,
                name: project.name || 'Untitled Project',
                clientName: clientMap.get(clientId) || 'Unknown Client',
                statusLabel: toProjectStatusLabel(project),
                progress: Math.max(0, Math.min(100, Number(progress.toFixed(2))))
            };
        });

        const response = {
            success: true,
            data: {
                projects: formattedProjects,
                totalActiveProjects
            }
        };

        dashboardContracts.dashboardInProgressResponseSchema.parse(response);
        cache.setCached(cacheKey, response, DASHBOARD_CACHE_TTL_MS);
        return res.status(200).json(response);
    } catch (e) {
        logger('DASHBOARD_PROJECTS_IN_PROGRESS').error(e);
        return dashboardError(res, 'Failed to fetch in-progress projects');
    }
});

router.get('/activities', dashboard, async (req, res) => {
    try {
        const parsed = activitiesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return dashboardError(
                res,
                'Invalid query parameters',
                400,
                'VALIDATION_ERROR',
                parsed.error.issues.map((issue) => issue.message)
            );
        }

        const { page, limit } = parsed.data;
        const cacheKey = cache.buildCacheKey('dashboard:activities', { page, limit });
        const cached = cache.getCached(cacheKey);
        if (cached) return res.status(200).json(cached);

        const { rows, total } = await db.getActivityLogs({
            page,
            limit,
            projection: { _id: 0, id: 1, type: 1, actorId: 1, entityId: 1, message: 1, createdAt: 1 }
        });

        const actorIds = [...new Set(rows.map((row) => row.actorId).filter(Boolean))];
        const users = await db.getUsersByIds(actorIds);
        const userMap = new Map(users.map((user) => {
            const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
            return [user.userId, fullName || user.email || user.userId];
        }));

        const items = rows.map((row, index) => {
            const createdAt = row.createdAt || Date.now();
            return {
                id: row.id || row.entityId || `${row.type || 'activity'}-${page}-${index + 1}`,
                title: toActivityTitle(row.type),
                description: row.message || `Activity recorded: ${row.type || 'unknown'}`,
                actorName: row.actorId ? (userMap.get(row.actorId) || 'Unknown User') : 'System',
                createdAt,
                timeAgo: analytics.formatTimeAgo(createdAt)
            };
        });

        const response = {
            success: true,
            data: {
                items,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        };

        dashboardContracts.dashboardActivitiesResponseSchema.parse(response);
        cache.setCached(cacheKey, response, 15_000);
        return res.status(200).json(response);

    } catch (e) {
        logger('DASHBOARD_ACTIVITIES').error(e);
        return dashboardError(res, 'Failed to fetch recent activities');
    }
});

/** EXPORTS
 * Export Routes for use in routers
 */
module.exports = router;
