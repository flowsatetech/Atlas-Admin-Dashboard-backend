const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { logger } = require("../helpers");

const shouldUseRedisStore =
  process.env.RATE_LIMIT_STORE === "redis" || process.env.NODE_ENV === "production";

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const commonOptions = {
  // CORS preflight requests can otherwise burn through limits quickly.
  skip: (req) => req.method === "OPTIONS",
  standardHeaders: true,
  legacyHeaders: false,
};

const createStore = () => {
  if (!shouldUseRedisStore) return undefined;

  try {
    const redisClient = require("./utils/redis_client");
    return new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  } catch (error) {
    logger("RATE_LIMIT").warn("Redis store unavailable, falling back to in-memory store.");
    return undefined;
  }
};

const keyGenerator = (req) => {
  if (req.user && req.user.userId) return `user_${req.user.userId}`;
  return `ip_${ipKeyGenerator(req.ip)}`;
};

const createMember = rateLimit({
  windowMs: envNumber("RATE_LIMIT_CREATE_MEMBER_WINDOW_MS", 60 * 60 * 1000),
  max: envNumber("RATE_LIMIT_CREATE_MEMBER_MAX", 10),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many accounts created. Please try again later." },
});

const authLogin = rateLimit({
  windowMs: envNumber("RATE_LIMIT_AUTH_LOGIN_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_AUTH_LOGIN_MAX", 10),
  store: createStore(),
  keyGenerator: (req) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    return email ? `login_email_${email}` : `login_fallback_${ipKeyGenerator(req.ip)}`;
  },
  skipSuccessfulRequests: true,
  ...commonOptions,
  message: { success: false, message: "Too many login attempts. Please try again later." },
});

const authLoginIp = rateLimit({
  windowMs: envNumber("RATE_LIMIT_AUTH_LOGIN_IP_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_AUTH_LOGIN_IP_MAX", 25),
  store: createStore(),
  keyGenerator: (req) => `login_ip_${ipKeyGenerator(req.ip)}`,
  skipSuccessfulRequests: true,
  ...commonOptions,
  message: { success: false, message: "Too many login attempts. Please try again later." },
});

const profile = rateLimit({
  windowMs: envNumber("RATE_LIMIT_PROFILE_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_PROFILE_MAX", 100),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many requests. Please slow down." },
});

const dashboard = rateLimit({
  windowMs: envNumber("RATE_LIMIT_DASHBOARD_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_DASHBOARD_MAX", 120),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many requests. Please slow down." },
});

const projects = rateLimit({
  windowMs: envNumber("RATE_LIMIT_PROJECTS_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_PROJECTS_MAX", 120),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many requests. Please slow down." },
});

const clients = rateLimit({
  windowMs: envNumber("RATE_LIMIT_CLIENTS_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_CLIENTS_MAX", 120),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many requests. Please slow down." },
});

const members = rateLimit({
  windowMs: envNumber("RATE_LIMIT_MEMBERS_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_MEMBERS_MAX", 120),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many requests. Please slow down." },
});

// Added Leads Rate Limiter
const leads = rateLimit({
  windowMs: envNumber("RATE_LIMIT_LEADS_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_LEADS_MAX", 180),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many lead requests. Please slow down." },
});

const media = rateLimit({
  windowMs: envNumber("RATE_LIMIT_MEDIA_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_MEDIA_MAX", 120),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many requests. Please slow down." },
});

const analytics = rateLimit({
  windowMs: envNumber("RATE_LIMIT_ANALYTICS_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_ANALYTICS_MAX", 180),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many analytics requests. Please slow down." },
});

const payments = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 30,
  store: createStore(),
  keyGenerator,
  message: { success: false, message: "Too many payment requests. Please slow down." },
});

const tasks = rateLimit({
  windowMs: envNumber("RATE_LIMIT_TASKS_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_TASKS_MAX", 240),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many task requests. Please slow down." },
});

const logout = rateLimit({
  windowMs: envNumber("RATE_LIMIT_LOGOUT_WINDOW_MS", 60 * 60 * 1000),
  max: envNumber("RATE_LIMIT_LOGOUT_MAX", 40),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many logout attempts." },
});

const fourzerofour = rateLimit({
  windowMs: envNumber("RATE_LIMIT_404_WINDOW_MS", 5 * 60 * 60 * 1000),
  max: envNumber("RATE_LIMIT_404_MAX", 10),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many failed requests." },
});

const health = rateLimit({
  windowMs: envNumber("RATE_LIMIT_HEALTH_WINDOW_MS", 60 * 1000),
  max: envNumber("RATE_LIMIT_HEALTH_MAX", 60),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many health checks." },
});

const blog = rateLimit({
  windowMs: envNumber("RATE_LIMIT_BLOG_WINDOW_MS", 15 * 60 * 1000),
  max: envNumber("RATE_LIMIT_BLOG_MAX", 120),
  store: createStore(),
  keyGenerator,
  ...commonOptions,
  message: { success: false, message: "Too many requests. Please slow down." },
});

const blogEmbedTrack = rateLimit({
  windowMs: envNumber("RATE_LIMIT_BLOG_EMBED_TRACK_WINDOW_MS", 60 * 1000),
  max: envNumber("RATE_LIMIT_BLOG_EMBED_TRACK_MAX", 30),
  store: createStore(),
  keyGenerator: (req) => `embed_track_${ipKeyGenerator(req.ip)}_${req.params?.slug || ""}`,
  ...commonOptions,
  message: { success: false, message: "Too many view track requests." },
});

const blogEmbedTrackHourly = rateLimit({
  windowMs: envNumber("RATE_LIMIT_BLOG_EMBED_TRACK_HOURLY_WINDOW_MS", 60 * 60 * 1000),
  max: envNumber("RATE_LIMIT_BLOG_EMBED_TRACK_HOURLY_MAX", 600),
  store: createStore(),
  keyGenerator: (req) => `embed_track_hour_${ipKeyGenerator(req.ip)}_${req.params?.slug || ""}`,
  ...commonOptions,
  message: { success: false, message: "Too many view track requests." },
});

const blogEmbedPage = rateLimit({
  windowMs: envNumber("RATE_LIMIT_BLOG_EMBED_PAGE_WINDOW_MS", 60 * 1000),
  max: envNumber("RATE_LIMIT_BLOG_EMBED_PAGE_MAX", 60),
  store: createStore(),
  keyGenerator: (req) => `embed_page_${ipKeyGenerator(req.ip)}_${req.params?.slug || ""}`,
  ...commonOptions,
  message: { success: false, message: "Too many embed page requests." },
});

module.exports = {
  createMember,
  authLogin,
  authLoginIp,
  health,
  profile,
  logout,
  dashboard,
  projects,
  clients,
  members,
  leads,
  media,
  analytics,
  payments,
  tasks,
  fourzerofour,
  blog,
  blogEmbedPage,
  blogEmbedTrack,
  blogEmbedTrackHourly,
};
