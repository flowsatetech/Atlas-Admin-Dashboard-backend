const { MongoClient } = require('mongodb');
const { logger } = require('../helpers');

let client;
let db;
let users;
let projects;
let clients;
let images;
let mediaStrings;

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

    /** Create indexes */
    await users.createIndex({ email: 1 }, { unique: true });
    await clients.createIndex({ id: 1 }, { unique: true });
    await clients.createIndex({ status: 1 });

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
    addProject,

    getClientById,
    getClients,
    getClientsPaginated,
    addClient,

    getImages,
    findImageById,
    addImage,
    updateImageById,

    getMediaStrings,
    getMediaStringById,
    storeMediaString,
    updateMediaString
};
