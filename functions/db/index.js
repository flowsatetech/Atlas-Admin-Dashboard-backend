const { MongoClient } = require("mongodb");
const { logger } = require("../helpers");

let client;
let db;
let users;
let projects;
let clients;
let images;
let mediaStrings;
let tasks; // New Task collection variable

async function initializeDB() {
  try {
    client = new MongoClient(
      process.env.NODE_ENV === "production"
        ? process.env.MONGO_URI_PROD
        : process.env.MONGO_URI,
    );
    await client.connect();
    db = client.db("atlas-db");

    // Ensure all collections are assigned correctly
    users = db.collection("users");
    clients = db.collection("clients");
    projects = db.collection("projects");
    images = db.collection("images");
    mediaStrings = db.collection("mediaStrings");
    tasks = db.collection("tasks"); // Initializing tasks collection

    logger("DB").info("MongoDB initialized successfully");
  } catch (err) {
    logger("DB").error("Failed to initialize database", err);
    throw err;
  }
}

/** * CLIENTS LOGIC (Developer 3) */

async function getClients({ page = 1, limit = 10 } = {}) {
  try {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      clients.find({}).skip(skip).limit(limit).toArray(),
      clients.countDocuments({}),
    ]);

    return {
      clients: docs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
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

async function addClient(clientData) {
  try {
    const result = await clients.insertOne(clientData);
    return { ...clientData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

/** * STAFF / USERS LOGIC (Developer 3) */

async function getAllMembers({ page = 1, limit = 10, search = "" } = {}) {
  try {
    const skip = (page - 1) * limit;
    const query = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [docs, total] = await Promise.all([
      users.find(query).skip(skip).limit(limit).toArray(),
      users.countDocuments(query),
    ]);

    return {
      members: docs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addMember(userData) {
  try {
    const result = await users.insertOne(userData);
    return { ...userData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addUser(userData) {
  return await addMember(userData);
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

async function updateUser(userId, updateData) {
  try {
    const result = await users.updateOne({ userId }, { $set: updateData });
    return { changes: result.modifiedCount };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

/** * TASKS LOGIC (Developer 3)
 * Added for linking Staff IDs to work items
 */

async function addTask(taskData) {
  try {
    const result = await tasks.insertOne(taskData);
    return { ...taskData, _id: result.insertedId };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function getTasks({ page = 1, limit = 10, assignedTo = null } = {}) {
  try {
    const skip = (page - 1) * limit;
    const query = assignedTo ? { assignedTo } : {};

    const [docs, total] = await Promise.all([
      tasks
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray(),
      tasks.countDocuments(query),
    ]);

    return {
      tasks: docs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

/** PROJECTS LOGIC */

async function getProjects() {
  try {
    return await projects.find({}).toArray();
  } catch (err) {
    logger("DB").error(err);
    throw err;
  }
}

async function addProject(projectData) {
  try {
    const result = await projects.insertOne(projectData);
    return { ...projectData, _id: result.insertedId };
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
    await images.updateOne(
      { id },
      { $set: { public_id: link.public_id, url: link.url } },
    );
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

module.exports = {
  initializeDB,
  getAllMembers,
  addMember,
  addUser,
  getUserByEmail,
  getUserById,
  updateUser,
  getProjects,
  addProject,
  getClientById,
  getClients,
  addClient,
  getImages,
  findImageById,
  addImage,
  updateImageById,
  getMediaStrings,
  getMediaStringById,
  storeMediaString,
  updateMediaString,
  addTask, // Exporting new task function
  getTasks, // Exporting new task function
};
