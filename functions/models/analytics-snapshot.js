const { z, baseEntityFields } = require("./common");

const analyticsSnapshotSchema = z.object({
    ...baseEntityFields,
    periodStart: z.number().int().nonnegative(),
    periodEnd: z.number().int().nonnegative(),
    visitors: z.number().int().nonnegative().default(0),
    pageViews: z.number().int().nonnegative().default(0),
    conversions: z.number().int().nonnegative().default(0),
    trafficSourceCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
    trafficSources: z.array(z.object({
        source: z.string().min(1),
        percentage: z.number().min(0).max(100)
    })).default([])
});

const createAnalyticsSnapshotSchema = analyticsSnapshotSchema.omit({
    createdAt: true,
    updatedAt: true
});

module.exports = {
    analyticsSnapshotSchema,
    createAnalyticsSnapshotSchema
};
