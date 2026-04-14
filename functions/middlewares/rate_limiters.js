const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redisClient = require('./utils/redis_client');

const createStore = () => new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args)
});

const keyGenerator = (req) => {
    if (req.user && req.user.userId) {
        return `user_${req.user.userId}`;
    }
    return `ip_${ipKeyGenerator(req.ip)}`;
};

const signup = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5, 
    store: createStore(),
    message: { success: false, message: 'Too many accounts created from this IP. Please try again later.' }
});

const authLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    store: createStore(),
    keyGenerator: (req) => {
        const email = req.body?.email || ''; 
        return `login_${email}`;
    },
    message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

const authLoginIp = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    store: createStore(),
    keyGenerator: (req) => {
        return `login_${ipKeyGenerator(req.ip)}`;
    },
    message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

const profile = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 20,
    store: createStore(),
    keyGenerator,
    message: { success: false, message: 'Too many requests. Please slow down.' }
});

const dashboard = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 20,
    store: createStore(),
    keyGenerator,
    message: { success: false, message: 'Too many requests. Please slow down.' }
});

const projects = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 20,
    store: createStore(),
    keyGenerator,
    message: { success: false, message: 'Too many requests. Please slow down.' }
});

const clients = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 20,
    store: createStore(),
    keyGenerator,
    message: { success: false, message: 'Too many requests. Please slow down.' }
});

const members = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 20,
    store: createStore(),
    keyGenerator,
    message: { success: false, message: 'Too many requests. Please slow down.' }
});

const media = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 20,
    store: createStore(),
    keyGenerator,
    message: { success: false, message: 'Too many requests. Please slow down.' }
});

// Added: Tasks Rate Limiter
const tasks = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Higher limit for productivity
    store: createStore(),
    keyGenerator,
    message: { success: false, message: 'Too many task requests. Please slow down.' }
});

const logout = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    store: createStore(),
    keyGenerator,
    message: { success: false, message: 'Too many logout attempts.' }
});

const fourzerofour = rateLimit({
    windowMs: 5 * 60 * 60 * 1000,
    max: 3,
    message: { success: false, message: 'Too many failed requests.' }
});

const health = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many health checks.' }
});

module.exports = {
    signup,
    authLogin,
    authLoginIp,
    health,
    profile,
    logout,
    dashboard,
    projects,
    clients,
    members,
    media,
    tasks, // EXPORTED: This stops the crash!
    fourzerofour
};