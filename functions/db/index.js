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
    
    // Ensure this line is exactly correct:
    clients = db.collection("clients"); 
    
    // ... rest of your collections
    logger("DB").info("MongoDB initialized successfully");
}

/** * CLIENTS LOGIC (Developer 3) 
 * Refactored for pagination and specific ID-based rules [cite: 37, 114]
 */

async function getClients({ page = 1, limit = 10 } = {}) {
    try {
        const skip = (page - 1) * limit;
        
        // Fetch data and total count in parallel 
        const [docs, total] = await Promise.all([
            clients.find({}).skip(skip).limit(limit).toArray(),
            clients.countDocuments({})
        ]);

        return {
            clients: docs,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function getClientById(clientId) {
    try {
        const doc = await clients.findOne({ id: clientId }); // Identification by ID [cite: 4]
        return doc;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function addClient(clientData) {
    try {
        const result = await clients.insertOne(clientData);
        // We return the full object as requested by the plan [cite: 40]
        return { ...clientData, _id: result.insertedId };
    } catch (err) {
        logger("DB").error(err);
        throw err; // This throw is what triggers the "Unknown error" in your route
    }
}

/** * STAFF / USERS LOGIC (Developer 3) 
 * Manages team members and staff CRUD [cite: 41, 114]
 */

async function getAllMembers({ search = "" } = {}) {
    try {
        const query = search ? { fullName: { $regex: search, $options: 'i' } } : {};
        const doc = await users.find(query).toArray(); // Search filter support 
        return doc;
    } catch (err) {
        logger("DB").error(err);
        throw err;
    }
}

async function addUser(userData) {
    try {
        const result = await users.insertOne(userData);
        return { ...userData, _id: result.insertedId }; // Return new staff object 
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

/** MEDIA & IMAGES LOGIC (Developer 3) [cite: 112] */

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

module.exports = {
    initializeDB,
    getAllMembers,
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
    updateMediaString
};