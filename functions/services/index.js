const { logActivity } = require("./activity");
const { recordAnalyticsEvent } = require("./analytics-ingestion");

module.exports = {
    logActivity,
    recordAnalyticsEvent
};
