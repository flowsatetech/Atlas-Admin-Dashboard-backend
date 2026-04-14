const { MongoClient } = require('mongodb');
const { logger } = require('../helpers');

let client;
let db;
let users;
let projects;
let clients;
let images;
let mediaStrings;
let tasks;
let activityLogs;
let analyticsSnapshots;
let campaignStats;

async function initializeDB() {
    client = new MongoClient(
        process.env.NODE_ENV === 'production' ? process.env.MONGO_URI_PROD : process.env.MONGO_URI
    );
    await client.connect();
    db = client.db("atlas-db");
    users = db.collection("users");
    projects = db.collection("projects");
    clients = db.collection("clients");
    images = db.collection("images");
    mediaStrings = db.collection("mediaStrings");
    tasks = db.collection("tasks");
    activityLogs = db.collection("activityLogs");
    analyticsSnapshots = db.collection("analyticsSnapshots");
    campaignStats = db.collection("campaignStats");

    /** Create indexes */
    await users.createIndex({ email: 1 }, { unique: true });
    await clients.createIndex({ id: 1 }, { unique: true });
    await clients.createIndex({ status: 1 });
    await tasks.createIndex({ id: 1 }, { unique: true });
    await tasks.createIndex({ status: 1 });
    await tasks.createIndex({ dueDate: 1 });
    await tasks.createIndex({ assigneeId: 1 });
    await tasks.createIndex({ projectId: 1 });
    await activityLogs.createIndex({ createdAt: -1 });
    await activityLogs.createIndex({ type: 1 });
    await activityLogs.createIndex({ actorId: 1 });
    await analyticsSnapshots.createIndex({ id: 1 }, { unique: true });
    await analyticsSnapshots.createIndex({ periodStart: 1 });
    await analyticsSnapshots.createIndex({ periodEnd: 1 });
    await campaignStats.createIndex({ id: 1 }, { unique: true });
    await campaignStats.createIndex({ campaignName: 1 });
    await campaignStats.createIndex({ createdAt: -1 });

    logger("DB").info("MongoDB initialized successfully");
}

async function addUser(userData) {
    try {
        const result = await users.insertOne(userData);
        return { ...userData, _id: result.insertedId };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getAllMembers() {
    try {
        const doc = await users.find({}).toArray();
        return doc;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getUsersCount() {
    try {
        return await users.countDocuments({});
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getUserByEmail(email) {
    try {
        const doc = await users.findOne({ email });
        return doc;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getUserById(userId) {
    try {
        const doc = await users.findOne({ userId });
        return doc;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function updateUser(userId, updateData) {
    try {
        const result = await users.updateOne(
            { userId },
            { $set: updateData }
        );
        return { changes: result.modifiedCount };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getProjects() {
    try {
        const doc = await projects.find({}).toArray();
        return doc;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getClientById(clientId) {
    try {
        const doc = await clients.findOne({ id: clientId });
        return doc;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getClients() {
    try {
        const doc = await clients.find({}).toArray();
        return doc;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getProjectById(projectId) {
    try {
        return await projects.findOne({ id: projectId });
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getClientsPaginated({ status, page = 1, limit = 10 }) {
    try {
        const query = status ? { status } : {};
        const skip = (page - 1) * limit;

        const [rows, total] = await Promise.all([
            clients.find(query).skip(skip).limit(limit).toArray(),
            clients.countDocuments(query)
        ]);

        return { rows, total };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function countClientsByFilter(filter = {}) {
    try {
        return await clients.countDocuments(filter);
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function countProjectsByFilter(filter = {}) {
    try {
        return await projects.countDocuments(filter);
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function countTasksByFilter(filter = {}) {
    try {
        return await tasks.countDocuments(filter);
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getClientsCreatedBetween(from, to) {
    try {
        return await clients.find(
            { createdAt: { $gte: from, $lte: to } },
            { projection: { _id: 0, id: 1, createdAt: 1, status: 1 } }
        ).toArray();
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getProjectsCreatedBetween(from, to) {
    try {
        return await projects.find(
            { createdAt: { $gte: from, $lte: to } },
            {
                projection: {
                    _id: 0,
                    id: 1,
                    name: 1,
                    createdAt: 1,
                    client: 1,
                    clientId: 1,
                    budget: 1,
                    progress: 1,
                    status: 1,
                    deadline: 1,
                    dueTime: 1
                }
            }
        ).toArray();
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getRecognizedRevenueProjectsBetween(from, to) {
    try {
        return await projects.find(
            {
                status: "Completed",
                recognizedAt: { $gte: from, $lte: to },
                recognizedRevenue: { $type: "number", $gt: 0 }
            },
            {
                projection: {
                    _id: 0,
                    id: 1,
                    name: 1,
                    status: 1,
                    recognizedAt: 1,
                    recognizedRevenue: 1
                }
            }
        ).toArray();
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getTasksCreatedBetween(from, to) {
    try {
        return await tasks.find(
            { createdAt: { $gte: from, $lte: to } },
            { projection: { _id: 0, id: 1, createdAt: 1, status: 1, dueDate: 1 } }
        ).toArray();
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getInProgressProjects(limit = 4) {
    try {
        return await projects.find(
            {
                $or: [
                    { status: { $in: ["InProgress", "OnHold", "Planned"] } },
                    { status: { $exists: false } }
                ]
            },
            {
                projection: {
                    _id: 0,
                    id: 1,
                    name: 1,
                    status: 1,
                    progress: 1,
                    client: 1,
                    clientId: 1,
                    deadline: 1,
                    dueTime: 1
                }
            }
        ).sort({ updatedAt: -1, createdAt: -1 }).limit(limit).toArray();
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function addProject(projectData) {
    try {
        const result = await projects.insertOne(projectData);
        return { changes: result.modifiedCount };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function addClient(clientData) {
    try {
        const result = await clients.insertOne(clientData);
        return { changes: result.modifiedCount };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function updateProjectById(projectId, updateData) {
    try {
        const result = await projects.updateOne(
            { id: projectId },
            { $set: updateData }
        );
        return { changes: result.modifiedCount };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function addTask(taskData) {
    try {
        const result = await tasks.insertOne(taskData);
        return { ...taskData, _id: result.insertedId };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getTaskById(taskId) {
    try {
        return await tasks.findOne({ id: taskId });
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getTasks({ status, assigneeId, projectId, page = 1, limit = 20, projection } = {}) {
    try {
        const query = {};

        if (status) query.status = status;
        if (assigneeId) query.assigneeId = assigneeId;
        if (projectId) query.projectId = projectId;

        const skip = (page - 1) * limit;
        const [rows, total] = await Promise.all([
            tasks.find(query, projection ? { projection } : undefined).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            tasks.countDocuments(query)
        ]);

        return { rows, total };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function updateTaskById(taskId, updateData) {
    try {
        const result = await tasks.updateOne(
            { id: taskId },
            { $set: updateData }
        );
        return { changes: result.modifiedCount };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function countPendingTasks() {
    try {
        return await tasks.countDocuments({ status: { $in: ["Todo", "InProgress", "Review", "Blocked"] } });
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function countOverdueTasks(nowTs = Date.now()) {
    try {
        return await tasks.countDocuments({
            dueDate: { $lt: nowTs },
            status: { $in: ["Todo", "InProgress", "Review", "Blocked"] }
        });
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function addActivityLog(activityData) {
    try {
        const result = await activityLogs.insertOne(activityData);
        return { ...activityData, _id: result.insertedId };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getActivityLogs({ page = 1, limit = 20, type, actorId, projection } = {}) {
    try {
        const query = {};

        if (type) query.type = type;
        if (actorId) query.actorId = actorId;

        const skip = (page - 1) * limit;
        const [rows, total] = await Promise.all([
            activityLogs.find(query, projection ? { projection } : undefined).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            activityLogs.countDocuments(query)
        ]);

        return { rows, total };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function upsertAnalyticsSnapshotByPeriod({ id, periodStart, periodEnd, ...rest }) {
    try {
        const timestamp = Date.now();
        const filter = id ? { id } : { periodStart, periodEnd };

        await analyticsSnapshots.updateOne(
            filter,
            {
                $set: {
                    ...rest,
                    periodStart,
                    periodEnd,
                    updatedAt: timestamp
                },
                $setOnInsert: {
                    id: id || `${periodStart}_${periodEnd}`,
                    createdAt: timestamp
                }
            },
            { upsert: true }
        );

        return await analyticsSnapshots.findOne(filter);
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getAnalyticsSnapshotsByDateRange({ from, to, page = 1, limit = 100, projection } = {}) {
    try {
        const query = {};

        if (from || to) {
            query.periodStart = {};
            if (from) query.periodStart.$gte = from;
            if (to) query.periodStart.$lte = to;
        }

        const skip = (page - 1) * limit;
        const [rows, total] = await Promise.all([
            analyticsSnapshots.find(query, projection ? { projection } : undefined).sort({ periodStart: 1 }).skip(skip).limit(limit).toArray(),
            analyticsSnapshots.countDocuments(query)
        ]);

        return { rows, total };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function addCampaignStat(campaignData) {
    try {
        const result = await campaignStats.insertOne(campaignData);
        return { ...campaignData, _id: result.insertedId };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getCampaignStats({ page = 1, limit = 20, sortBy = "createdAt", order = "desc", projection } = {}) {
    try {
        const skip = (page - 1) * limit;
        const direction = order === "asc" ? 1 : -1;

        const [rows, total] = await Promise.all([
            campaignStats.find({}, projection ? { projection } : undefined).sort({ [sortBy]: direction }).skip(skip).limit(limit).toArray(),
            campaignStats.countDocuments({})
        ]);

        return { rows, total };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getCampaignStatsByDateRange({ from, to, page = 1, limit = 100, projection } = {}) {
    try {
        const query = {};

        if (from || to) {
            query.createdAt = {};
            if (from) query.createdAt.$gte = from;
            if (to) query.createdAt.$lte = to;
        }

        const skip = (page - 1) * limit;
        const [rows, total] = await Promise.all([
            campaignStats.find(query, projection ? { projection } : undefined).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            campaignStats.countDocuments(query)
        ]);

        return { rows, total };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getUsersByIds(userIds = []) {
    try {
        if (!Array.isArray(userIds) || userIds.length === 0) return [];
        return await users.find(
            { userId: { $in: userIds } },
            { projection: { _id: 0, userId: 1, firstName: 1, lastName: 1, email: 1 } }
        ).toArray();
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getImages() {
    try {
        const result = await images.find({}).toArray();
        return result;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function addImage(id, link) {
    try {
        await images.insertOne({ id, public_id: link.public_id, url: link.url });
        return;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function updateImageById(id, link) {
    try {
        await images.updateOne({ id }, { $set: { public_id: link.public_id, url: link.url } });
        return;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function findImageById(imageId) {
    try {
        return await images.findOne({ id: imageId });
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getMediaStrings() {
    try {
        return await mediaStrings.find({}).toArray();
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getMediaStringById(stringId) {
    try {
        return await mediaStrings.findOne({ id: stringId });
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function storeMediaString(id, string) {
    try {
        const url = `${process.env.SERVER_BASE_URL}/api/media/strings/${id}`
        return await mediaStrings.insertOne({ id, url, string });
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function updateMediaString(stringId, string) {
    try {
        return await mediaStrings.updateOne({ id: stringId }, { $set: { string } });
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

module.exports = {
    initializeDB,

    getAllMembers,
    getUsersCount,
    addUser,
    getUserByEmail,
    getUserById,
    updateUser,

    getProjects,
    getProjectById,
    updateProjectById,
    addProject,

    getClientById,
    getClients,
    getClientsPaginated,
    countClientsByFilter,
    getClientsCreatedBetween,
    addClient,

    countProjectsByFilter,
    getProjectsCreatedBetween,
    getRecognizedRevenueProjectsBetween,

    addTask,
    getTaskById,
    getTasks,
    updateTaskById,
    countPendingTasks,
    countOverdueTasks,
    countTasksByFilter,
    getTasksCreatedBetween,
    getInProgressProjects,

    addActivityLog,
    getActivityLogs,

    upsertAnalyticsSnapshotByPeriod,
    getAnalyticsSnapshotsByDateRange,

    addCampaignStat,
    getCampaignStats,
    getCampaignStatsByDateRange,
    getUsersByIds,

    getImages,
    findImageById,
    addImage,
    updateImageById,

    getMediaStrings,
    getMediaStringById,
    storeMediaString,
    updateMediaString
};
