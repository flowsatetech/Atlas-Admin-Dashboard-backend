const { z } = require("zod");
const { TREND_DIRECTION_VALUES } = require("../constants/enums");

const dashboardErrorSchema = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: z.array(z.string()).default([])
    })
});

const kpiCardSchema = z.object({
    value: z.number(),
    changePct: z.number(),
    direction: z.enum(TREND_DIRECTION_VALUES),
    compareLabel: z.string().default("Vs last month")
});

const dashboardMetricsDataSchema = z.object({
    totalClients: kpiCardSchema,
    activeProjects: kpiCardSchema,
    pendingTasks: kpiCardSchema,
    newLeads: kpiCardSchema
});

const dashboardMetricsResponseSchema = z.object({
    success: z.literal(true),
    data: dashboardMetricsDataSchema
});

const dashboardPerformanceDataSchema = z.object({
    period: z.enum(["3months", "6months", "12months"]),
    labels: z.array(z.string()),
    revenueSeries: z.array(z.number()),
    newClientSeries: z.array(z.number())
});

const dashboardPerformanceResponseSchema = z.object({
    success: z.literal(true),
    data: dashboardPerformanceDataSchema
});

const dashboardInProgressProjectSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    clientName: z.string().min(1),
    statusLabel: z.enum(["Finishing", "On Track", "At Risk"]),
    progress: z.number().min(0).max(100)
});

const dashboardInProgressDataSchema = z.object({
    projects: z.array(dashboardInProgressProjectSchema),
    totalActiveProjects: z.number().int().nonnegative()
});

const dashboardInProgressResponseSchema = z.object({
    success: z.literal(true),
    data: dashboardInProgressDataSchema
});

const dashboardActivityItemSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    actorName: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    timeAgo: z.string().min(1)
});

const dashboardActivitiesDataSchema = z.object({
    items: z.array(dashboardActivityItemSchema),
    pagination: z.object({
        page: z.number().int().min(1),
        limit: z.number().int().min(1),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative()
    })
});

const dashboardActivitiesResponseSchema = z.object({
    success: z.literal(true),
    data: dashboardActivitiesDataSchema
});

const dashboardEmptyState = {
    metrics: {
        totalClients: { value: 0, changePct: 0, direction: "flat", compareLabel: "Vs last month" },
        activeProjects: { value: 0, changePct: 0, direction: "flat", compareLabel: "Vs last month" },
        pendingTasks: { value: 0, changePct: 0, direction: "flat", compareLabel: "Vs last month" },
        newLeads: { value: 0, changePct: 0, direction: "flat", compareLabel: "Vs last month" }
    },
    performance: {
        period: "6months",
        labels: [],
        revenueSeries: [],
        newClientSeries: []
    },
    inProgress: {
        projects: [],
        totalActiveProjects: 0
    },
    activities: {
        items: [],
        pagination: {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0
        }
    }
};

function createDashboardError(message, code = "DASHBOARD_ERROR", details = []) {
    return {
        success: false,
        error: {
            code,
            message,
            details
        }
    };
}

module.exports = {
    dashboardErrorSchema,
    dashboardMetricsResponseSchema,
    dashboardPerformanceResponseSchema,
    dashboardInProgressResponseSchema,
    dashboardActivitiesResponseSchema,
    dashboardEmptyState,
    createDashboardError
};
