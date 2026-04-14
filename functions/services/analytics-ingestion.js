const db = require("../db");
const { analytics, logger } = require("../helpers");

function toSourceLabel(source) {
    if (!source) return "Direct";
    const normalized = String(source).trim().toLowerCase();
    if (!normalized) return "Direct";
    if (normalized === "google") return "Google";
    if (normalized === "social") return "Social";
    if (normalized === "direct") return "Direct";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function recordAnalyticsEvent({
    visitorsDelta = 0,
    pageViewsDelta = 0,
    trafficSource = "Direct",
    timestamp = Date.now()
} = {}) {
    try {
        const { start, end } = analytics.getUtcDayRange(timestamp);
        const snapshotId = `daily_${start}_${end}`;

        const existing = await db.upsertAnalyticsSnapshotByPeriod({
            id: snapshotId,
            periodStart: start,
            periodEnd: end,
            visitors: 0,
            pageViews: 0,
            trafficSources: [],
            trafficSourceCounts: {}
        });

        const nextVisitors = Math.max(0, (Number(existing.visitors) || 0) + visitorsDelta);
        const nextPageViews = Math.max(0, (Number(existing.pageViews) || 0) + pageViewsDelta);

        const counts = { ...(existing.trafficSourceCounts || {}) };
        const source = toSourceLabel(trafficSource);
        counts[source] = (Number(counts[source]) || 0) + 1;

        const totalCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
        const trafficSources = totalCount === 0
            ? []
            : Object.entries(counts)
                .map(([name, count]) => ({
                    source: name,
                    percentage: Number(((count / totalCount) * 100).toFixed(2))
                }))
                .sort((a, b) => b.percentage - a.percentage);

        await db.upsertAnalyticsSnapshotByPeriod({
            id: snapshotId,
            periodStart: start,
            periodEnd: end,
            visitors: nextVisitors,
            pageViews: nextPageViews,
            trafficSources,
            trafficSourceCounts: counts
        });
    } catch (error) {
        logger("ANALYTICS_INGESTION").error(error);
    }
}

module.exports = {
    recordAnalyticsEvent
};
