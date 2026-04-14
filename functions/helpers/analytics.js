const DAY_MS = 24 * 60 * 60 * 1000;
const { TREND_DIRECTION } = require("../constants/enums");

function toUtcDate(ts) {
    return new Date(ts);
}

function startOfUtcDay(ts) {
    const d = toUtcDate(ts);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function endOfUtcDay(ts) {
    return startOfUtcDay(ts) + DAY_MS - 1;
}

function getUtcDayRange(ts = Date.now()) {
    const start = startOfUtcDay(ts);
    return { start, end: endOfUtcDay(ts) };
}

function shiftMonthsUtc(ts, months) {
    const d = toUtcDate(ts);
    return Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth() + months,
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
        d.getUTCMilliseconds()
    );
}

function parsePeriod(period = "30d", nowTs = Date.now()) {
    const key = String(period).toLowerCase();
    const currentEnd = nowTs;

    if (key === "7d" || key === "30d") {
        const days = parseInt(key.replace("d", ""), 10);
        const currentStart = startOfUtcDay(nowTs - ((days - 1) * DAY_MS));
        const previousEnd = currentStart - 1;
        const previousStart = startOfUtcDay(previousEnd - ((days - 1) * DAY_MS));
        return { key, unit: "day", amount: days, currentStart, currentEnd, previousStart, previousEnd };
    }

    if (key === "3months" || key === "6months" || key === "12months") {
        const months = parseInt(key.replace("months", ""), 10);
        const d = toUtcDate(nowTs);
        const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
        const currentStart = shiftMonthsUtc(monthStart, -(months - 1));
        const previousEnd = currentStart - 1;
        const previousStart = shiftMonthsUtc(currentStart, -months);
        return { key, unit: "month", amount: months, currentStart, currentEnd, previousStart, previousEnd };
    }

    throw new Error("Invalid period. Supported values: 7d, 30d, 3months, 6months, 12months");
}

function getBucketStart(ts, unit = "day") {
    const d = toUtcDate(ts);
    if (unit === "month") {
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    return startOfUtcDay(ts);
}

function getNextBucketStart(ts, unit = "day") {
    const d = toUtcDate(ts);
    if (unit === "month") {
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
    return startOfUtcDay(ts) + DAY_MS;
}

function getBucketLabel(bucketStart, unit = "day") {
    const d = toUtcDate(bucketStart);
    if (unit === "month") {
        return d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
    }
    return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC"
    });
}

function buildDateBuckets({ from, to, unit = "day" }) {
    const buckets = [];
    let cursor = getBucketStart(from, unit);
    const end = to;

    while (cursor <= end) {
        const next = getNextBucketStart(cursor, unit);
        buckets.push({
            start: cursor,
            end: Math.min(next - 1, end),
            label: getBucketLabel(cursor, unit)
        });
        cursor = next;
    }

    return buckets;
}

function percentageChange(current, previous) {
    if (previous === 0) {
        if (current === 0) return 0;
        return 100;
    }
    return ((current - previous) / Math.abs(previous)) * 100;
}

function safeRate(numerator, denominator, decimals = 2) {
    if (!denominator) return 0;
    const rate = (numerator / denominator) * 100;
    return Number(rate.toFixed(decimals));
}

function getTrendDirection(change, epsilon = 0.0001) {
    if (change > epsilon) return TREND_DIRECTION.UP;
    if (change < -epsilon) return TREND_DIRECTION.DOWN;
    return TREND_DIRECTION.FLAT;
}

function formatTimeAgo(fromTs, nowTs = Date.now()) {
    const diff = Math.max(0, nowTs - fromTs);
    const minutes = Math.floor(diff / (60 * 1000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}

module.exports = {
    DAY_MS,
    parsePeriod,
    buildDateBuckets,
    percentageChange,
    safeRate,
    getTrendDirection,
    formatTimeAgo,
    getUtcDayRange
};
