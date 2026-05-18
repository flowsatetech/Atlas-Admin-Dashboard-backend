const { MongoClient } = require("mongodb");
const { logger } = require("../helpers");

let client;
let db;
let users;
let projects;
let clients;
let images;
let mediaStrings;
let tasks;
let comments;
let activityLogs;
let analyticsSnapshots;
let campaignStats;
let blogPosts;
let leads;

async function initializeDB() {
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    logger("DB").info("MongoDB Memory Server started for staging");

    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db("atlas-db");

    users = db.collection("users");
    projects = db.collection("projects");
    clients = db.collection("clients");
    images = db.collection("images");
    mediaStrings = db.collection("mediaStrings");
    tasks = db.collection("tasks");
    comments = db.collection("comments");
    activityLogs = db.collection("activityLogs");
    analyticsSnapshots = db.collection("analyticsSnapshots");
    campaignStats = db.collection("campaignStats");
    blogPosts = db.collection("blogPosts");
    leads = db.collection("leads");

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
    await blogPosts.createIndex({ id: 1 }, { unique: true });
    await blogPosts.createIndex({ slug: 1 }, { unique: true });
    await blogPosts.createIndex({ status: 1 });
    await blogPosts.createIndex({ category: 1 });
    await blogPosts.createIndex({ createdAt: -1 });
    await leads.createIndex({ id: 1 }, { unique: true });
    await leads.createIndex({ email: 1 });
    await leads.createIndex({ status: 1 });
    await leads.createIndex({ createdAt: -1 });

    logger("DB").info("MongoDB initialized successfully");
  } catch (err) {
    logger("DB").error("Failed to initialize database");
    logger("DB").error(err);
    throw err;
  }
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

async function addMember(userData) {
  return addUser(userData);
}

async function getAllMembers({ page, limit, search } = {}) {
  try {
    const hasPagination = Number.isFinite(page) || Number.isFinite(limit) || typeof search === "string";
    if (!hasPagination) return await users.find({}).toArray();

    const safePage = Number.isFinite(page) ? Math.max(1, Number(page)) : 1;
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Number(limit)) : 10;
    const skip = (safePage - 1) * safeLimit;

    const query = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [membersList, total] = await Promise.all([
      users.find(query).skip(skip).limit(safeLimit).toArray(),
      users.countDocuments(query),
    ]);

    return {
      members: membersList,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
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
    return await users.findOne({ email });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getUserById(userId) {
  try {
    return await users.findOne({ userId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getUsersByIds(userIds = []) {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    return await users
      .find(
        { userId: { $in: userIds } },
        { projection: { _id: 0, userId: 1, firstName: 1, lastName: 1, email: 1 } },
      )
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updateUser(userId, updateData) {
  try {
    const result = await users.updateOne({ userId }, { $set: updateData });
    return { changes: result.modifiedCount };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getProjects() {
  try {
    return await projects.find({}).toArray();
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

async function addProject(projectData) {
  try {
    const result = await projects.insertOne(projectData);
    return { ...projectData, _id: result.insertedId, changes: result.modifiedCount };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updateProjectById(projectId, updateData) {
  try {
    const result = await projects.updateOne({ id: projectId }, { $set: updateData });
    return { changes: result.modifiedCount };
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

async function getProjectsCreatedBetween(from, to) {
  try {
    return await projects
      .find(
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
            dueTime: 1,
          },
        },
      )
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getRecognizedRevenueProjectsBetween(from, to) {
  try {
    return await projects
      .find(
        {
          status: "Completed",
          recognizedAt: { $gte: from, $lte: to },
          recognizedRevenue: { $type: "number", $gt: 0 },
        },
        {
          projection: {
            _id: 0,
            id: 1,
            name: 1,
            status: 1,
            recognizedAt: 1,
            recognizedRevenue: 1,
          },
        },
      )
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getInProgressProjects(limit = 4) {
  try {
    return await projects
      .find(
        {
          $or: [{ status: { $in: ["InProgress", "OnHold", "Planned"] } }, { status: { $exists: false } }],
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
            dueTime: 1,
          },
        },
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getClientById(clientId) {
  try {
    return await clients.findOne({ id: clientId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getClients() {
  try {
    return await clients.find({}).toArray();
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
      clients.countDocuments(query),
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

async function getClientsCreatedBetween(from, to) {
  try {
    return await clients
      .find({ createdAt: { $gte: from, $lte: to } }, { projection: { _id: 0, id: 1, createdAt: 1, status: 1 } })
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addClient(clientData) {
  try {
    const result = await clients.insertOne(clientData);
    return { ...clientData, _id: result.insertedId, changes: result.modifiedCount };
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

async function getTasks({ status, assigneeId, projectId, assignedTo, page = 1, limit = 20, projection } = {}) {
  try {
    const query = {};
    if (status) query.status = status;
    if (assigneeId) query.assigneeId = assigneeId;
    if (assignedTo) query.assigneeId = assignedTo;
    if (projectId) query.projectId = projectId;

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      tasks.find(query, projection ? { projection } : undefined).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      tasks.countDocuments(query),
    ]);
    return { rows, total };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updateTaskById(taskId, updateData) {
  try {
    const result = await tasks.updateOne({ id: taskId }, { $set: updateData });
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
      status: { $in: ["Todo", "InProgress", "Review", "Blocked"] },
    });
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

async function getTasksCreatedBetween(from, to) {
  try {
    return await tasks
      .find({ createdAt: { $gte: from, $lte: to } }, { projection: { _id: 0, id: 1, createdAt: 1, status: 1, dueDate: 1 } })
      .toArray();
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
      activityLogs.countDocuments(query),
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
          updatedAt: timestamp,
        },
        $setOnInsert: {
          id: id || `${periodStart}_${periodEnd}`,
          createdAt: timestamp,
        },
      },
      { upsert: true },
    );

    return await analyticsSnapshots.findOne(filter);
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

/** PROJECTS LOGIC */

async function getProjectsPaginated({ page = 1, limit = 10, status = "" } = {}) {
  try {
    const skip = (page - 1) * limit;
    const query = status
      ? { status }
      : {};

    const [docs, filteredTotal, total, inProgress, onHold, completed] = await Promise.all([
      projects.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }).toArray(),
      projects.countDocuments(query),
      projects.countDocuments({}),
      projects.countDocuments({ status: "InProgress" }),
      projects.countDocuments({ status: "OnHold" }),
      projects.countDocuments({ status: "Completed" }),
    ]);

    return {
      projects: docs,
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages: Math.ceil(filteredTotal / limit),
      },
      infoData: {
        totalProjects: total,
        totalInProgress: inProgress,
        totalInReview: onHold,
        totalCompleted: completed,
      },
    };
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
      analyticsSnapshots.countDocuments(query),
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

async function updateProject(projectId, updateData) {
  try {
    await projects.updateOne({ id: projectId }, { $set: updateData });
    return await projects.findOne({ id: projectId });
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
      campaignStats.countDocuments({}),
    ]);
    return { rows, total };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function deleteProject(projectId) {
  try {
    return await projects.deleteOne({ id: projectId });
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
      campaignStats.countDocuments(query),
    ]);
    return { rows, total };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

/** COMEMNTS LOGIC */

async function addComment(commentData) {
  try {
    const result = await comments.insertOne(commentData);
    return { ...commentData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getCommentsByProjectId(projectId) {
  try {
    return await comments.find({ projectId }).sort({ createdAt: -1 }).toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

/** MEDIA & IMAGES LOGIC */

async function getImages() {
  try {
    return await images.find({}).toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addImage(id, link) {
  try {
    await images.insertOne({ id, public_id: link.public_id, url: link.url });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updateImageById(id, link) {
  try {
    await images.updateOne({ id }, { $set: { public_id: link.public_id, url: link.url } });
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
    const url = `${process.env.SERVER_BASE_URL}/api/media/strings/${id}`;
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


async function getBlogPostsPaginated({ page = 1, limit = 10, status = "", category = "", search = "" } = {}) {
  try {
    const skip = (page - 1) * limit;
    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) query.title = { $regex: search, $options: "i" };

    const [docs, filteredTotal] = await Promise.all([
      blogPosts.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }).toArray(),
      blogPosts.countDocuments(query),
    ]);

    return {
      posts: docs,
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages: Math.ceil(filteredTotal / limit),
      },
    };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getBlogStats() {
  try {
    const [total, published, draft, scheduled, viewsAgg] = await Promise.all([
      blogPosts.countDocuments({}),
      blogPosts.countDocuments({ status: "published" }),
      blogPosts.countDocuments({ status: "draft" }),
      blogPosts.countDocuments({ status: "scheduled" }),
      blogPosts.aggregate([{ $group: { _id: null, totalViews: { $sum: "$views" } } }]).toArray(),
    ]);
    return {
      total,
      published,
      draft,
      scheduled,
      totalViews: viewsAgg[0]?.totalViews ?? 0,
    };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getBlogPostById(postId) {
  try {
    return await blogPosts.findOne({ id: postId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getBlogPostBySlug(slug) {
  try {
    return await blogPosts.findOne({ slug });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addBlogPost(postData) {
  try {
    const result = await blogPosts.insertOne(postData);
    return { ...postData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updateBlogPost(postId, updateData) {
  try {
    await blogPosts.updateOne({ id: postId }, { $set: updateData });
    return await blogPosts.findOne({ id: postId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function deleteBlogPost(postId) {
  try {
    const result = await blogPosts.deleteOne({ id: postId });
    return result.deletedCount > 0;
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function incrementBlogPostViews(slug) {
  try {
    await blogPosts.updateOne({ slug }, { $inc: { views: 1 } });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addLead(leadData) {
  try {
    const result = await leads.insertOne(leadData);
    return { ...leadData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getAllLeads({ page = 1, limit = 10, search = "", status = "" } = {}) {
  try {
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.max(1, Number(limit));
    const skip = (safePage - 1) * safeLimit;

    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
      ];
    }

    const [docs, total] = await Promise.all([
      leads.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).toArray(),
      leads.countDocuments(query),
    ]);

    return {
      leads: docs,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

/** ADDED CLIENTS & LEADS UTILITIES FROM PRD ROADMAP */

async function getClientStats() {
  try {
    const [total, active, inactive, lead] = await Promise.all([
      clients.countDocuments({}),
      clients.countDocuments({ status: "Active" }),
      clients.countDocuments({ status: "Inactive" }),
      clients.countDocuments({ status: "Lead" }),
    ]);
    return {
      totalClients: total,
      activeClients: active,
      inactiveClients: inactive,
      leadClients: lead,
    };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updateClient(clientId, updateData) {
  try {
    return await clients.updateOne({ id: clientId }, { $set: updateData });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function deleteClient(clientId) {
  try {
    return await clients.deleteOne({ id: clientId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getLeadById(leadId) {
  try {
    return await leads.findOne({ id: leadId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updateLead(leadId, updateData) {
  try {
    return await leads.updateOne({ id: leadId }, { $set: updateData });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function deleteLead(leadId) {
  try {
    return await leads.deleteOne({ id: leadId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function deleteUserById(userId) {
  try {
    return await users.deleteOne({ userId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

module.exports = {
  initializeDB,

  getAllMembers,
  addMember,
  getUsersCount,
  addUser,
  getUserByEmail,
  getUserById,
  getUsersByIds,
  updateUser,
  deleteUserById,
  getProjectsPaginated,
  getProjectById,
  addProject,
  updateProject,
  deleteProject,

  getProjects,
  updateProjectById,
  countProjectsByFilter,
  getProjectsCreatedBetween,
  getRecognizedRevenueProjectsBetween,
  getInProgressProjects,
  getClientById,
  getClients,
  getClientsPaginated,
  countClientsByFilter,
  getClientsCreatedBetween,
  addClient,
  getClientStats,
  updateClient,
  deleteClient,

  addTask,
  getTaskById,
  getTasks,
  updateTaskById,
  countPendingTasks,
  countOverdueTasks,
  countTasksByFilter,
  getTasksCreatedBetween,

  addActivityLog,
  getActivityLogs,

  upsertAnalyticsSnapshotByPeriod,
  getAnalyticsSnapshotsByDateRange,

  addCampaignStat,
  getCampaignStats,
  getCampaignStatsByDateRange,

  getImages,
  findImageById,
  addImage,
  updateImageById,

  getMediaStrings,
  getMediaStringById,
  storeMediaString,
  updateMediaString,
  addComment,
  getCommentsByProjectId,

  getBlogPostsPaginated,
  getBlogPostById,
  getBlogPostBySlug,
  addBlogPost,
  updateBlogPost,
  deleteBlogPost,
  incrementBlogPostViews,
  getBlogStats,

  getAllLeads,
  addLead,
  getLeadById,
  updateLead,
  deleteLead,
};
