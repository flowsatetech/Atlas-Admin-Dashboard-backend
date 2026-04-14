const db = require("../db");
const { analytics, cache, logger } = require("../helpers");

function toSourceLabel(source) {
    if (!source) return "Direct";
    const normalized = String(source).trim().toLowerCase();
    if (!normalized) return "Direct";
    if (["google", "search"].includes(normalized)) return "Google";
    if (["social", "facebook", "instagram", "twitter", "x", "linkedin", "tiktok"].includes(normalized)) return "Social";
    if (["direct", "none", "(none)"].includes(normalized)) return "Direct";
    if (["email", "newsletter"].includes(normalized)) return "Email";
    if (["referral", "partner"].includes(normalized)) return "Referral";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function detectSourceFromReferrer(referrer) {
    if (!referrer || typeof referrer !== "string") return "Direct";

    try {
        const hostname = new URL(referrer).hostname.toLowerCase();
        if (!hostname) return "Direct";

        if (
            hostname.includes("google.") ||
            hostname.includes("bing.") ||
            hostname.includes("yahoo.") ||
            hostname.includes("duckduckgo.")
        ) {
            return "Google";
        }

        if (
            hostname.includes("facebook.") ||
            hostname.includes("instagram.") ||
            hostname.includes("twitter.") ||
            hostname.includes("x.com") ||
            hostname.includes("linkedin.") ||
            hostname.includes("tiktok.")
        ) {
            return "Social";
        }

        return "Referral";
    } catch {
        return "Direct";
    }
}

async function recordAnalyticsEvent({
    visitorId,
    visitorsDelta = 0,
    pageViewsDelta = 0,
    conversionsDelta = 0,
    trafficSource = "Direct",
    referrer = "",
    timestamp = Date.now()
} = {}) {
    try {
        const source = toSourceLabel(trafficSource || detectSourceFromReferrer(referrer));
        const isNewVisitor = await db.registerAnalyticsDailyVisitor({ visitorId, timestamp });

        const snapshot = await db.incrementAnalyticsSnapshotCounters({
            timestamp,
            visitorsDelta: isNewVisitor ? 1 : visitorsDelta,
            pageViewsDelta,
            conversionsDelta,
            trafficSource: source
        });
        cache.clearByPrefix("analytics:");

        return {
            source,
            isNewVisitor,
            snapshotId: snapshot?.id || null,
            visitors: Number(snapshot?.visitors) || 0,
            pageViews: Number(snapshot?.pageViews) || 0,
            conversions: Number(snapshot?.conversions) || 0
        };
    } catch (error) {
        logger("ANALYTICS_INGESTION").error(error);
        throw error;
    }
}

module.exports = {
    recordAnalyticsEvent,
    detectSourceFromReferrer
};
