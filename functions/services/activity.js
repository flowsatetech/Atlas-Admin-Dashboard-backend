const db = require("../db");
const { generateToken, logger } = require("../helpers");

async function logActivity({
    type,
    actorId = null,
    entityId = null,
    entityType = null,
    message = "Activity recorded",
    meta = {}
}) {
    try {
        const now = Date.now();
        await db.addActivityLog({
            id: generateToken(),
            type,
            actorId,
            entityId,
            entityType,
            message,
            meta,
            createdAt: now,
            updatedAt: now
        });
    } catch (error) {
        logger("ACTIVITY_LOG").error(error);
    }
}

module.exports = {
    logActivity
};
