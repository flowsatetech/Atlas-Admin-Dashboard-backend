const { z } = require("zod");
const { TREND_DIRECTION_VALUES } = require("../constants/enums");

const analyticsErrorSchema = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: z.array(z.string()).default([])
    })
});

const trendMetricSchema = z.object({
    value: z.union([z.number(), z.string()]),
    changePct: z.number(),
    direction: z.enum(TREND_DIRECTION_VALUES)
});

const analyticsOverviewResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        websiteVisitors: trendMetricSchema,
        pageViews: trendMetricSchema,
        conversionRate: trendMetricSchema,
        topTrafficSource: z.object({
            name: z.string(),
            changePct: z.number(),
            direction: z.enum(TREND_DIRECTION_VALUES)
        })
    })
});

const analyticsTrafficResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        range: z.enum(["7d", "30d", "3months", "6months", "12months"]),
        labels: z.array(z.string()),
        visitsSeries: z.array(z.number()),
        pageViewsSeries: z.array(z.number()),
        conversionRateSeries: z.array(z.number())
    })
});

const analyticsSourcesResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        sources: z.array(z.object({
            source: z.string().min(1),
            percentage: z.number().min(0).max(100)
        }))
    })
});

const analyticsCampaignRowSchema = z.object({
    id: z.string().min(1),
    campaignName: z.string().min(1),
    impressions: z.number().int().nonnegative(),
    clicks: z.number().int().nonnegative(),
    conversions: z.number().int().nonnegative(),
    conversionRate: z.number().min(0).max(100)
});

const analyticsCampaignsResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        campaigns: z.array(analyticsCampaignRowSchema),
        pagination: z.object({
            page: z.number().int().min(1),
            limit: z.number().int().min(1),
            total: z.number().int().nonnegative(),
            totalPages: z.number().int().nonnegative()
        })
    })
});

const analyticsDistributionResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        distribution: z.array(z.object({
            label: z.string().min(1),
            value: z.number().nonnegative()
        }))
    })
});

const analyticsEmptyState = {
    overview: {
        websiteVisitors: { value: 0, changePct: 0, direction: "flat" },
        pageViews: { value: 0, changePct: 0, direction: "flat" },
        conversionRate: { value: 0, changePct: 0, direction: "flat" },
        topTrafficSource: { name: "N/A", changePct: 0, direction: "flat" }
    },
    traffic: {
        range: "7d",
        labels: [],
        visitsSeries: [],
        pageViewsSeries: [],
        conversionRateSeries: []
    },
    sources: {
        sources: []
    },
    campaigns: {
        campaigns: [],
        pagination: {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0
        }
    },
    distribution: {
        distribution: []
    }
};

function createAnalyticsError(message, code = "ANALYTICS_ERROR", details = []) {
    return {
        success: false,
        error: { code, message, details }
    };
}

module.exports = {
    analyticsErrorSchema,
    analyticsOverviewResponseSchema,
    analyticsTrafficResponseSchema,
    analyticsSourcesResponseSchema,
    analyticsCampaignsResponseSchema,
    analyticsDistributionResponseSchema,
    analyticsEmptyState,
    createAnalyticsError
};
