const { MongoClient } = require("mongodb");
const { logger } = require("../helpers");

let client;
let db;
let users;
let projects;
let clients;
let images;
let mediaFiles;
let tasks;
let comments;
let activityLogs;
let analyticsSnapshots;
let campaignStats;
let blogPosts;
let leads;
let payments;
let notifications;
let systemSettings;

const NOTIFICATION_PREFERENCES_SETTING_KEY = "notification_preferences";

async function initializeDB() {
  try {
    let mongoUri;
    if (process.env.NODE_ENV === 'staging') {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      mongoUri = mongod.getUri();
      logger("DB").info("MongoDB Memory Server started");
    } else {
      mongoUri = process.env.NODE_ENV === 'production'
        ? process.env.MONGO_URI_PROD
        : process.env.MONGO_URI;
    }

    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db("atlas-db");

    users = db.collection("users");
    projects = db.collection("projects");
    clients = db.collection("clients");
    images = db.collection("images");
    mediaFiles = db.collection("mediaFiles");
    tasks = db.collection("tasks");
    comments = db.collection("comments");
    activityLogs = db.collection("activityLogs");
    analyticsSnapshots = db.collection("analyticsSnapshots");
    campaignStats = db.collection("campaignStats");
    blogPosts = db.collection("blogPosts");
    leads = db.collection("leads");
    payments = db.collection("payments");
    notifications = db.collection("notifications");
    systemSettings = db.collection("system_settings");

    await users.createIndex({ email: 1 }, { unique: true });
    await images.createIndex({ id: 1 }, { unique: true });
    await mediaFiles.createIndex({ id: 1 }, { unique: true });
    await mediaFiles.createIndex({ uploadedBy: 1 });
    await mediaFiles.createIndex({ type: 1 });
    await mediaFiles.createIndex({ createdAt: -1 });
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
    await payments.createIndex({ id: 1 }, { unique: true });
    await payments.createIndex({ clientId: 1 });
    await payments.createIndex({ projectId: 1 });
    await payments.createIndex({ status: 1 });
    await payments.createIndex({ date: -1 });
    await payments.createIndex({ source: 1 });
    await payments.dropIndex("clientName_text_projectName_text_source_text_notes_text").catch((err) => {
      if (err.codeName !== "IndexNotFound" && err.code !== 27) throw err;
    });
    await notifications.createIndex({ id: 1 }, { unique: true });
    await notifications.createIndex({ recipientId: 1, createdAt: -1 });
    await notifications.createIndex({ recipientId: 1, isRead: 1 });
    await systemSettings.createIndex({ key: 1 }, { unique: true });

    logger("DB").info("MongoDB initialized successfully");

    if (process.env.NODE_ENV === 'staging') {
      const { seedDB } = require('./seed');
      await seedDB();
      logger("DB").info("Database seeded successfully");
    }
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
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(1, Number(limit)), 100) : 10;
    const skip = (safePage - 1) * safeLimit;

    const safeSearch = search ? escapeRegex(search) : "";
    const query = safeSearch
      ? {
          $or: [
            { firstName: { $regex: safeSearch, $options: "i" } },
            { lastName: { $regex: safeSearch, $options: "i" } },
            { email: { $regex: safeSearch, $options: "i" } },
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

async function getUsersByRoles(roles = []) {
  try {
    if (!Array.isArray(roles) || roles.length === 0) return [];
    const uniqueRoles = [...new Set(roles.filter(Boolean))];
    if (uniqueRoles.length === 0) return [];

    return await users
      .find(
        { role: { $in: uniqueRoles } },
        { projection: { _id: 0, userId: 1, firstName: 1, lastName: 1, email: 1, role: 1 } },
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
    const [result] = await projects
      .aggregate([
        ...projectTaskProgressLookupStages,
        { $match: filter },
        { $count: "count" },
      ])
      .toArray();

    return result?.count || 0;
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getProjectsCreatedBetween(from, to) {
  try {
    return await projects
      .aggregate([
        ...projectTaskProgressLookupStages,
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
          $project: {
            _id: 0,
            id: 1,
            name: 1,
            createdAt: 1,
            client: 1,
            clientId: 1,
            budget: 1,
            totalTasks: 1,
            completedTasks: 1,
            progress: 1,
            status: 1,
            deadline: 1,
            dueTime: 1,
          },
        },
      ])
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getInProgressProjects(limit = 4) {
  try {
    return await projects
      .aggregate([
        ...projectTaskProgressLookupStages,
        {
          $match: {
            $or: [{ status: { $in: ["InProgress", "OnHold", "Planned"] } }, { status: { $exists: false } }],
          },
        },
        { $sort: { updatedAt: -1, createdAt: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            id: 1,
            name: 1,
            status: 1,
            totalTasks: 1,
            completedTasks: 1,
            progress: 1,
            client: 1,
            clientId: 1,
            deadline: 1,
            dueTime: 1,
          },
        },
      ])
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

async function getDashboardMetricsCounts({
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  activeProjectStatuses = [],
  pendingTaskStatuses = [],
} = {}) {
  try {
    const currentRange = { createdAt: { $gte: currentStart, $lte: currentEnd } };
    const previousRange = { createdAt: { $gte: previousStart, $lte: previousEnd } };

    const [clientMetrics = {}, projectMetrics = {}, taskMetrics = {}] = await Promise.all([
      clients
        .aggregate([
          {
            $facet: {
              totalClients: [{ $count: "count" }],
              currentClients: [{ $match: currentRange }, { $count: "count" }],
              previousClients: [{ $match: previousRange }, { $count: "count" }],
              totalLeads: [{ $match: { status: "Lead" } }, { $count: "count" }],
              currentLeads: [{ $match: { ...currentRange, status: "Lead" } }, { $count: "count" }],
              previousLeads: [{ $match: { ...previousRange, status: "Lead" } }, { $count: "count" }],
            },
          },
        ])
        .next(),
      projects
        .aggregate([
          ...projectTaskProgressLookupStages,
          {
            $facet: {
              totalProjects: [{ $count: "count" }],
              currentProjects: [{ $match: currentRange }, { $count: "count" }],
              previousProjects: [{ $match: previousRange }, { $count: "count" }],
              activeProjectsTotal: [{ $match: { status: { $in: activeProjectStatuses } } }, { $count: "count" }],
              activeProjectsCurrent: [{ $match: { ...currentRange, status: { $in: activeProjectStatuses } } }, { $count: "count" }],
              activeProjectsPrevious: [{ $match: { ...previousRange, status: { $in: activeProjectStatuses } } }, { $count: "count" }],
            },
          },
        ])
        .next(),
      tasks
        .aggregate([
          {
            $facet: {
              pendingTasksTotal: [{ $match: { status: { $in: pendingTaskStatuses } } }, { $count: "count" }],
              pendingTasksCurrent: [{ $match: { ...currentRange, status: { $in: pendingTaskStatuses } } }, { $count: "count" }],
              pendingTasksPrevious: [{ $match: { ...previousRange, status: { $in: pendingTaskStatuses } } }, { $count: "count" }],
            },
          },
        ])
        .next(),
    ]);

    return {
      totalClients: getFacetCount(clientMetrics, "totalClients"),
      currentClients: getFacetCount(clientMetrics, "currentClients"),
      previousClients: getFacetCount(clientMetrics, "previousClients"),
      totalProjects: getFacetCount(projectMetrics, "totalProjects"),
      currentProjects: getFacetCount(projectMetrics, "currentProjects"),
      previousProjects: getFacetCount(projectMetrics, "previousProjects"),
      activeProjectsTotal: getFacetCount(projectMetrics, "activeProjectsTotal"),
      activeProjectsCurrent: getFacetCount(projectMetrics, "activeProjectsCurrent"),
      activeProjectsPrevious: getFacetCount(projectMetrics, "activeProjectsPrevious"),
      pendingTasksTotal: getFacetCount(taskMetrics, "pendingTasksTotal"),
      pendingTasksCurrent: getFacetCount(taskMetrics, "pendingTasksCurrent"),
      pendingTasksPrevious: getFacetCount(taskMetrics, "pendingTasksPrevious"),
      totalLeads: getFacetCount(clientMetrics, "totalLeads"),
      currentLeads: getFacetCount(clientMetrics, "currentLeads"),
      previousLeads: getFacetCount(clientMetrics, "previousLeads"),
    };
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

const taskDetailLookupStages = [
  {
    $lookup: {
      from: "users",
      let: { taskAssigneeId: "$assigneeId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$userId", "$$taskAssigneeId"] } } },
        {
          $project: {
            _id: 0,
            userId: 1,
            firstName: 1,
            lastName: 1,
            fullName: 1,
            email: 1,
            role: 1,
            job: 1,
            status: 1,
          },
        },
      ],
      as: "assignee",
    },
  },
  {
    $set: {
      assignee: { $ifNull: [{ $arrayElemAt: ["$assignee", 0] }, null] },
    },
  },
  {
    $lookup: {
      from: "projects",
      let: { taskProjectId: "$projectId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$id", "$$taskProjectId"] } } },
        ...buildProjectTaskProgressLookupStages(),
        {
          $project: {
            _id: 0,
            id: 1,
            name: 1,
            clientId: 1,
            description: 1,
            deadline: 1,
            budget: 1,
            priority: 1,
            status: 1,
            totalTasks: 1,
            completedTasks: 1,
            progress: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
      as: "project",
    },
  },
  {
    $set: {
      project: { $ifNull: [{ $arrayElemAt: ["$project", 0] }, null] },
    },
  },
];

async function getTaskDetailById(taskId) {
  try {
    const [task] = await tasks
      .aggregate([
        { $match: { id: taskId } },
        { $limit: 1 },
        ...taskDetailLookupStages,
        { $unset: "_id" },
      ])
      .toArray();

    return task || null;
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

async function deleteTaskById(taskId) {
  try {
    return await tasks.deleteOne({ id: taskId });
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

function buildProjectTaskProgressLookupStages({ projectIdExpression = "$id" } = {}) {
  return [
    {
      $lookup: {
        from: "tasks",
        let: { projectId: projectIdExpression },
        pipeline: [
          { $match: { $expr: { $eq: ["$projectId", "$$projectId"] } } },
          {
            $group: {
              _id: "$projectId",
              totalTasks: { $sum: 1 },
              completedTasks: {
                $sum: {
                  $cond: [{ $eq: ["$status", "Done"] }, 1, 0],
                },
              },
            },
          },
        ],
        as: "taskProgressStats",
      },
    },
    {
      $set: {
        taskProgressStats: {
          $ifNull: [
            { $arrayElemAt: ["$taskProgressStats", 0] },
            { totalTasks: 0, completedTasks: 0 },
          ],
        },
      },
    },
    {
      $set: {
        totalTasks: "$taskProgressStats.totalTasks",
        completedTasks: "$taskProgressStats.completedTasks",
      },
    },
    {
      $set: {
        progress: {
          $cond: [
            { $eq: ["$totalTasks", 0] },
            0,
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$completedTasks", "$totalTasks"] },
                    100,
                  ],
                },
                0,
              ],
            },
          ],
        },
      },
    },
    {
      $set: {
        status: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [
                    { $gt: ["$totalTasks", 0] },
                    { $gte: ["$completedTasks", "$totalTasks"] },
                  ],
                },
                then: "Completed",
              },
              {
                case: { $in: ["$status", ["OnHold", "Cancelled"]] },
                then: "$status",
              },
              {
                case: { $gt: ["$completedTasks", 0] },
                then: "InProgress",
              },
            ],
            default: "Planned",
          },
        },
      },
    },
    { $unset: "taskProgressStats" },
  ];
}

const projectTaskProgressLookupStages = buildProjectTaskProgressLookupStages();

const projectClientLookupStages = [
  {
    $lookup: {
      from: "clients",
      let: { projectClientId: "$clientId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$id", "$$projectClientId"] } } },
        {
          $project: {
            _id: 0,
            id: 1,
            fullName: 1,
            companyName: 1,
            email: 1,
            phone: 1,
            status: 1,
            tags: 1,
            assignedStaffId: 1,
            leadSource: 1,
            notes: 1,
            projectsCount: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
      as: "client",
    },
  },
  {
    $set: {
      client: { $ifNull: [{ $arrayElemAt: ["$client", 0] }, null] },
    },
  },
];

const projectCommentsLookupStage = {
  $lookup: {
    from: "comments",
    let: { projectId: "$id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$projectId", "$$projectId"] } } },
      { $sort: { createdAt: -1 } },
    ],
    as: "comments",
  },
};

function getFacetCount(aggregationResult, facetName) {
  return aggregationResult?.[facetName]?.[0]?.count || 0;
}

async function getProjectsPaginated({ page = 1, limit = 10, status = "" } = {}) {
  try {
    const skip = (page - 1) * limit;
    const query = status
      ? { status }
      : {};

    const [aggregationResult = {}] = await projects
      .aggregate([
        {
          $facet: {
            docs: [
              ...projectTaskProgressLookupStages,
              { $match: query },
              { $sort: { createdAt: -1 } },
              { $skip: skip },
              { $limit: limit },
              ...projectClientLookupStages,
            ],
            filteredTotal: [
              ...projectTaskProgressLookupStages,
              { $match: query },
              { $count: "count" },
            ],
            total: [{ $count: "count" }],
            inProgress: [
              ...projectTaskProgressLookupStages,
              { $match: { status: "InProgress" } },
              { $count: "count" },
            ],
            onHold: [
              ...projectTaskProgressLookupStages,
              { $match: { status: "OnHold" } },
              { $count: "count" },
            ],
            completed: [
              ...projectTaskProgressLookupStages,
              { $match: { status: "Completed" } },
              { $count: "count" },
            ],
          },
        },
      ])
      .toArray();

    const filteredTotal = getFacetCount(aggregationResult, "filteredTotal");

    return {
      projects: aggregationResult.docs || [],
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages: Math.ceil(filteredTotal / limit),
      },
      infoData: {
        totalProjects: getFacetCount(aggregationResult, "total"),
        totalInProgress: getFacetCount(aggregationResult, "inProgress"),
        totalInReview: getFacetCount(aggregationResult, "onHold"),
        totalCompleted: getFacetCount(aggregationResult, "completed"),
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

async function getProjectDetailById(projectId) {
  try {
    const [project] = await projects
      .aggregate([
        { $match: { id: projectId } },
        { $limit: 1 },
        ...projectTaskProgressLookupStages,
        ...projectClientLookupStages,
        projectCommentsLookupStage,
      ])
      .toArray();

    return project || null;
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
    return await getProjectDetailById(projectId);
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
    await Promise.all([
      tasks.deleteMany({ projectId }),
      comments.deleteMany({ projectId }),
    ]);

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

async function getMediaFiles({ page = 1, limit = 100, type = "", uploadedBy = "" } = {}) {
  try {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 100);
    const query = {};

    if (type) query.type = type;
    if (uploadedBy) query.uploadedBy = uploadedBy;

    const skip = (safePage - 1) * safeLimit;
    const [files, total] = await Promise.all([
      mediaFiles.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).toArray(),
      mediaFiles.countDocuments(query),
    ]);

    return {
      files,
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

async function getMediaFileById(fileId) {
  try {
    return await mediaFiles.findOne({ id: fileId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addMediaFile(fileData) {
  try {
    const result = await mediaFiles.insertOne(fileData);
    return { ...fileData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function deleteMediaFileById(fileId) {
  try {
    const result = await mediaFiles.deleteOne({ id: fileId });
    return result.deletedCount > 0;
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getBlogPostsPaginated({ page = 1, limit = 10, status = "", category = "", search = "" } = {}) {
  try {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 100);
    const skip = (safePage - 1) * safeLimit;
    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) query.title = { $regex: escapeRegex(search), $options: "i" };

    const [docs, filteredTotal] = await Promise.all([
      blogPosts.find(query).skip(skip).limit(safeLimit).sort({ createdAt: -1 }).toArray(),
      blogPosts.countDocuments(query),
    ]);

    return {
      posts: docs,
      pagination: {
        total: filteredTotal,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(filteredTotal / safeLimit),
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
    const safeLimit = Math.min(Math.max(1, Number(limit)), 100);
    const skip = (safePage - 1) * safeLimit;

    const query = {};
    if (status) query.status = status;
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { firstName: { $regex: safeSearch, $options: "i" } },
        { lastName: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { company: { $regex: safeSearch, $options: "i" } },
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

async function getProjectStats() {
  try {
    const [stats = {}] = await projects
      .aggregate([
        ...projectTaskProgressLookupStages,
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            planned: { $sum: { $cond: [{ $eq: ["$status", "Planned"] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ["$status", "InProgress"] }, 1, 0] } },
            onHold: { $sum: { $cond: [{ $eq: ["$status", "OnHold"] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] } },
          },
        },
      ])
      .toArray();

    return {
      total: stats.total || 0,
      planned: stats.planned || 0,
      inProgress: stats.inProgress || 0,
      onHold: stats.onHold || 0,
      completed: stats.completed || 0,
      cancelled: stats.cancelled || 0,
    };
  } catch (err) {
    logger('DB').error(err);
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getPayments({ page = 1, limit = 8, search = "", status = "", from, to } = {}) {
  try {
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.max(1, Number(limit));
    const skip = (safePage - 1) * safeLimit;
    const query = {};

    if (status) query.status = status;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: "i" };
      query.$or = [
        { id: regex },
        { clientId: regex },
        { projectId: regex },
        { source: regex },
        { notes: regex },
      ];
    }

    const [rows, total] = await Promise.all([
      payments.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(safeLimit).toArray(),
      payments.countDocuments(query),
    ]);

    return { rows, total };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getPaymentById(paymentId) {
  try {
    return await payments.findOne({ id: paymentId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

function sanitizePaymentData(paymentData = {}) {
  const { clientName, projectName, project, ...safePaymentData } = paymentData;
  return safePaymentData;
}

async function addPayment(paymentData) {
  try {
    const safePaymentData = sanitizePaymentData(paymentData);
    const result = await payments.insertOne(safePaymentData);
    return { ...safePaymentData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updatePayment(paymentId, updateData) {
  try {
    const safeUpdateData = sanitizePaymentData(updateData);
    await payments.updateOne(
      { id: paymentId },
      {
        $set: safeUpdateData,
        $unset: { clientName: "", projectName: "", project: "" },
      },
    );
    return await payments.findOne({ id: paymentId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function deletePayment(paymentId) {
  try {
    return await payments.deleteOne({ id: paymentId });
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getPaidPaymentsBetween(from, to) {
  try {
    return await payments
      .find(
        { status: "Paid", date: { $gte: from, $lte: to } },
        { projection: { _id: 0, id: 1, amount: 1, date: 1, clientId: 1, projectId: 1, source: 1 } },
      )
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getPendingPaymentsBetween(from, to) {
  try {
    return await payments
      .find(
        { status: "Pending", date: { $gte: from, $lte: to } },
        { projection: { _id: 0, id: 1, amount: 1, date: 1, clientId: 1, projectId: 1, source: 1 } },
      )
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addNotification(notificationData) {
  try {
    const result = await notifications.insertOne(notificationData);
    return { ...notificationData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addNotifications(notificationItems = []) {
  try {
    if (!Array.isArray(notificationItems) || notificationItems.length === 0) return [];

    const result = await notifications.insertMany(notificationItems, { ordered: false });
    return notificationItems.map((notificationItem, index) => ({
      ...notificationItem,
      _id: result.insertedIds[index],
    }));
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getNotificationsByRecipient(recipientId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  try {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (safePage - 1) * safeLimit;
    const query = { recipientId };
    if (unreadOnly === true || unreadOnly === "true") query.isRead = false;

    const [rows, totalCount, unreadCount] = await Promise.all([
      notifications
        .find(query, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .toArray(),
      notifications.countDocuments(query),
      notifications.countDocuments({ recipientId, isRead: false }),
    ]);

    return {
      notifications: rows,
      totalCount,
      unreadCount,
      currentPage: safePage,
      totalPages: Math.ceil(totalCount / safeLimit),
    };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function markNotificationAsRead(notificationId, recipientId) {
  try {
    const now = Date.now();
    const result = await notifications.findOneAndUpdate(
      { id: notificationId, recipientId },
      { $set: { isRead: true, updatedAt: now } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    return result || null;
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function markAllNotificationsAsRead(recipientId) {
  try {
    const result = await notifications.updateMany(
      { recipientId, isRead: false },
      { $set: { isRead: true, updatedAt: Date.now() } },
    );
    return result.modifiedCount;
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getUsersByMentionTokens(tokens = []) {
  try {
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    if (uniqueTokens.length === 0) return [];

    return await users
      .find(
        { userId: { $in: uniqueTokens } },
        { projection: { _id: 0, userId: 1, firstName: 1, lastName: 1, fullName: 1, email: 1 } },
      )
      .toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getGlobalNotificationPreferences() {
  try {
    const setting = await systemSettings.findOne(
      { key: NOTIFICATION_PREFERENCES_SETTING_KEY },
      { projection: { _id: 0, key: 1, notificationPreferences: 1 } },
    );
    return setting?.notificationPreferences || null;
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function updateGlobalNotificationPreferences(notificationPreferences) {
  try {
    const now = Date.now();
    const result = await systemSettings.findOneAndUpdate(
      { key: NOTIFICATION_PREFERENCES_SETTING_KEY },
      {
        $set: { notificationPreferences, updatedAt: now },
        $setOnInsert: { key: NOTIFICATION_PREFERENCES_SETTING_KEY, createdAt: now },
      },
      { upsert: true, returnDocument: "after", projection: { _id: 0, key: 1, notificationPreferences: 1 } },
    );
    return result || null;
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
  getUsersByRoles,
  updateUser,
  deleteUserById,
  getProjectsPaginated,
  getProjectById,
  getProjectDetailById,
  addProject,
  updateProject,
  deleteProject,

  getProjects,
  updateProjectById,
  countProjectsByFilter,
  getProjectsCreatedBetween,
  getInProgressProjects,
  getClientById,
  getClients,
  getClientsPaginated,
  countClientsByFilter,
  getDashboardMetricsCounts,
  getClientsCreatedBetween,
  addClient,
  getClientStats,
  getProjectStats,
  updateClient,
  deleteClient,

  addTask,
  getTaskById,
  getTaskDetailById,
  getTasks,
  updateTaskById,
  deleteTaskById,
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

  getMediaFiles,
  getMediaFileById,
  addMediaFile,
  deleteMediaFileById,
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
  getPayments,
  getPaymentById,
  addPayment,
  updatePayment,
  deletePayment,
  getPaidPaymentsBetween,
  getPendingPaymentsBetween,

  addNotification,
  addNotifications,
  getNotificationsByRecipient,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUsersByMentionTokens,
  getGlobalNotificationPreferences,
  updateGlobalNotificationPreferences,
};
