const express = require("express");
const { z } = require("zod");

const middlewares = require("../middlewares");
const { logger, analytics, cache } = require("../helpers");
const db = require("../db");
const { analytics: analyticsContracts } = require("../contracts");

const router = express.Router();
const { analytics: analyticsRateLimiter } = middlewares.rateLimiters;
const ANALYTICS_CACHE_TTL_MS = Number(process.env.ANALYTICS_CACHE_TTL_MS || 30_000);

const trafficQuerySchema = z.object({
    range: z.enum(["7d", "30d", "3months", "6months", "12months"]).default("7d")
});

const sourcesQuerySchema = z.object({
    range: z.enum(["7d", "30d", "3months", "6months", "12months"]).default("30d")
});

const campaignsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["createdAt", "campaignName", "impressions", "clicks", "conversions", "conversionRate"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc")
});

function error(res, message, status = 400, code = "ANALYTICS_ERROR", details = []) {
    return res.status(status).json(analyticsContracts.createAnalyticsError(message, code, details));
}

function sumSnapshots(rows, field) {
    return rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
}

function metricCard(value, current, previous) {
    const changePct = analytics.percentageChange(current, previous);
    return {
        value: Number(value.toFixed ? value.toFixed(2) : value),
        changePct: Number(changePct.toFixed(2)),
        direction: analytics.getTrendDirection(changePct)
    };
}

function aggregateTrafficSources(snapshotRows = []) {
    const sourceMap = new Map();

    for (const row of snapshotRows) {
        const sources = Array.isArray(row.trafficSources) ? row.trafficSources : [];
        for (const source of sources) {
            const key = source.source || "Unknown";
            const value = Number(source.percentage) || 0;
            sourceMap.set(key, (sourceMap.get(key) || 0) + value);
        }
    }

    const totals = [...sourceMap.entries()].map(([source, value]) => ({ source, value }));
    const grandTotal = totals.reduce((sum, item) => sum + item.value, 0);
    if (!grandTotal) return [];

    return totals
        .map((item) => ({
            source: item.source,
            percentage: Number(((item.value / grandTotal) * 100).toFixed(2))
        }))
        .sort((a, b) => b.percentage - a.percentage);
}

router.get("/overview", analyticsRateLimiter, async (req, res) => {
    try {
        const cacheKey = cache.buildCacheKey("analytics:overview", {});
        const cached = cache.getCached(cacheKey);
        if (cached) return res.status(200).json(cached);

        const range = analytics.parsePeriod("30d");

        const [currentSnapshots, previousSnapshots] = await Promise.all([
            db.getAnalyticsSnapshotsByDateRange({
                from: range.currentStart,
                to: range.currentEnd,
                limit: 1000,
                projection: { _id: 0, periodStart: 1, visitors: 1, pageViews: 1, conversions: 1, trafficSources: 1 }
            }),
            db.getAnalyticsSnapshotsByDateRange({
                from: range.previousStart,
                to: range.previousEnd,
                limit: 1000,
                projection: { _id: 0, periodStart: 1, visitors: 1, pageViews: 1, conversions: 1, trafficSources: 1 }
            })
        ]);

        const currentVisitors = sumSnapshots(currentSnapshots.rows, "visitors");
        const previousVisitors = sumSnapshots(previousSnapshots.rows, "visitors");
        const currentPageViews = sumSnapshots(currentSnapshots.rows, "pageViews");
        const previousPageViews = sumSnapshots(previousSnapshots.rows, "pageViews");

        const currentConversions = sumSnapshots(currentSnapshots.rows, "conversions");
        const previousConversions = sumSnapshots(previousSnapshots.rows, "conversions");

        const currentConversionRate = analytics.safeRate(currentConversions, currentPageViews);
        const previousConversionRate = analytics.safeRate(previousConversions, previousPageViews);

        const currentSources = aggregateTrafficSources(currentSnapshots.rows);
        const previousSources = aggregateTrafficSources(previousSnapshots.rows);
        const topCurrent = currentSources[0] || { source: "N/A", percentage: 0 };
        const matchingPrev = previousSources.find((item) => item.source === topCurrent.source) || { percentage: 0 };
        const topSourceChange = analytics.percentageChange(topCurrent.percentage, matchingPrev.percentage);

        const response = {
            success: true,
            data: {
                websiteVisitors: metricCard(currentVisitors, currentVisitors, previousVisitors),
                pageViews: metricCard(currentPageViews, currentPageViews, previousPageViews),
                conversionRate: metricCard(currentConversionRate, currentConversionRate, previousConversionRate),
                topTrafficSource: {
                    name: topCurrent.source,
                    changePct: Number(topSourceChange.toFixed(2)),
                    direction: analytics.getTrendDirection(topSourceChange)
                }
            }
        };

        analyticsContracts.analyticsOverviewResponseSchema.parse(response);
        cache.setCached(cacheKey, response, ANALYTICS_CACHE_TTL_MS);
        return res.status(200).json(response);
    } catch (e) {
        logger("ANALYTICS_OVERVIEW").error(e);
        return error(res, "Failed to fetch analytics overview");
    }
});

router.get("/traffic", analyticsRateLimiter, async (req, res) => {
    try {
        const parsed = trafficQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return error(res, "Invalid query parameters", 400, "VALIDATION_ERROR", parsed.error.issues.map((x) => x.message));
        }

        const { range } = parsed.data;
        const cacheKey = cache.buildCacheKey("analytics:traffic", { range });
        const cached = cache.getCached(cacheKey);
        if (cached) return res.status(200).json(cached);

        const period = analytics.parsePeriod(range);
        const buckets = analytics.buildDateBuckets({ from: period.currentStart, to: period.currentEnd, unit: period.unit });

        const snapshots = await db.getAnalyticsSnapshotsByDateRange({
            from: period.currentStart,
            to: period.currentEnd,
            limit: 3000,
            projection: { _id: 0, periodStart: 1, visitors: 1, pageViews: 1, conversions: 1 }
        });

        const visitsSeries = buckets.map((bucket) =>
            snapshots.rows.reduce((sum, row) => (
                row.periodStart >= bucket.start && row.periodStart <= bucket.end ? sum + (Number(row.visitors) || 0) : sum
            ), 0)
        );

        const pageViewsSeries = buckets.map((bucket) =>
            snapshots.rows.reduce((sum, row) => (
                row.periodStart >= bucket.start && row.periodStart <= bucket.end ? sum + (Number(row.pageViews) || 0) : sum
            ), 0)
        );

        const conversionRateSeries = buckets.map((bucket) => {
            const pageViews = snapshots.rows.reduce((sum, row) => (
                row.periodStart >= bucket.start && row.periodStart <= bucket.end ? sum + (Number(row.pageViews) || 0) : sum
            ), 0);
            const conversions = snapshots.rows.reduce((sum, row) => (
                row.periodStart >= bucket.start && row.periodStart <= bucket.end ? sum + (Number(row.conversions) || 0) : sum
            ), 0);
            return analytics.safeRate(conversions, pageViews);
        });

        const response = {
            success: true,
            data: {
                range,
                labels: buckets.map((bucket) => bucket.label),
                visitsSeries,
                pageViewsSeries,
                conversionRateSeries
            }
        };

        analyticsContracts.analyticsTrafficResponseSchema.parse(response);
        cache.setCached(cacheKey, response, ANALYTICS_CACHE_TTL_MS);
        return res.status(200).json(response);
    } catch (e) {
        logger("ANALYTICS_TRAFFIC").error(e);
        return error(res, "Failed to fetch analytics traffic");
    }
});

router.get("/sources", analyticsRateLimiter, async (req, res) => {
    try {
        const parsed = sourcesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return error(res, "Invalid query parameters", 400, "VALIDATION_ERROR", parsed.error.issues.map((x) => x.message));
        }

        const period = analytics.parsePeriod(parsed.data.range);
        const cacheKey = cache.buildCacheKey("analytics:sources", { range: parsed.data.range });
        const cached = cache.getCached(cacheKey);
        if (cached) return res.status(200).json(cached);

        const snapshots = await db.getAnalyticsSnapshotsByDateRange({
            from: period.currentStart,
            to: period.currentEnd,
            limit: 3000,
            projection: { _id: 0, trafficSources: 1 }
        });
        const sources = aggregateTrafficSources(snapshots.rows);

        const response = { success: true, data: { sources } };
        analyticsContracts.analyticsSourcesResponseSchema.parse(response);
        cache.setCached(cacheKey, response, ANALYTICS_CACHE_TTL_MS);
        return res.status(200).json(response);
    } catch (e) {
        logger("ANALYTICS_SOURCES").error(e);
        return error(res, "Failed to fetch traffic sources");
    }
});

router.get("/campaigns", analyticsRateLimiter, async (req, res) => {
    try {
        const parsed = campaignsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return error(res, "Invalid query parameters", 400, "VALIDATION_ERROR", parsed.error.issues.map((x) => x.message));
        }

        const { page, limit, sortBy, order } = parsed.data;
        const { rows, total } = await db.getCampaignStats({
            page,
            limit,
            sortBy,
            order,
            projection: { _id: 0, id: 1, campaignName: 1, impressions: 1, clicks: 1, conversions: 1, conversionRate: 1 }
        });

        const campaigns = rows.map((row, index) => {
            const clicks = Number(row.clicks) || 0;
            const conversions = Number(row.conversions) || 0;
            return {
                id: row.id || `${row.campaignName || "campaign"}-${page}-${index + 1}`,
                campaignName: row.campaignName || "Untitled Campaign",
                impressions: Number(row.impressions) || 0,
                clicks,
                conversions,
                conversionRate: Number((row.conversionRate ?? analytics.safeRate(conversions, clicks)).toFixed(2))
            };
        });

        const response = {
            success: true,
            data: {
                campaigns,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        };

        analyticsContracts.analyticsCampaignsResponseSchema.parse(response);
        return res.status(200).json(response);
    } catch (e) {
        logger("ANALYTICS_CAMPAIGNS").error(e);
        return error(res, "Failed to fetch campaign performance");
    }
});

router.get("/distribution", analyticsRateLimiter, async (req, res) => {
    try {
        const cacheKey = cache.buildCacheKey("analytics:distribution", {});
        const cached = cache.getCached(cacheKey);
        if (cached) return res.status(200).json(cached);

        const range = analytics.parsePeriod("30d");
        const [snapshots, leads, activeClients] = await Promise.all([
            db.getAnalyticsSnapshotsByDateRange({
                from: range.currentStart,
                to: range.currentEnd,
                limit: 1000,
                projection: { _id: 0, visitors: 1, pageViews: 1 }
            }),
            db.countClientsByFilter({ status: "Lead" }),
            db.countClientsByFilter({ status: "Active" })
        ]);

        const visitors = sumSnapshots(snapshots.rows, "visitors");
        const pageViews = sumSnapshots(snapshots.rows, "pageViews");

        const response = {
            success: true,
            data: {
                distribution: [
                    { label: "Page Views", value: pageViews },
                    { label: "Website Visitors", value: visitors },
                    { label: "Leads", value: leads },
                    { label: "Customers", value: activeClients }
                ]
            }
        };

        analyticsContracts.analyticsDistributionResponseSchema.parse(response);
        cache.setCached(cacheKey, response, ANALYTICS_CACHE_TTL_MS);
        return res.status(200).json(response);
    } catch (e) {
        logger("ANALYTICS_DISTRIBUTION").error(e);
        return error(res, "Failed to fetch analytics distribution");
    }
});

module.exports = router;
