const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { logger } = require("../helpers");

const shouldUseRedisStore =
  process.env.RATE_LIMIT_STORE === "redis" || process.env.NODE_ENV === "production";

const RATE_LIMIT_DEFAULTS = {
  RATE_LIMIT_AUTH_LOGIN_WINDOW_MS: 900000,
  RATE_LIMIT_AUTH_LOGIN_MAX: 10,
  RATE_LIMIT_AUTH_LOGIN_IP_WINDOW_MS: 900000,
  RATE_LIMIT_AUTH_LOGIN_IP_MAX: 30,
  RATE_LIMIT_LOGOUT_WINDOW_MS: 3600000,
  RATE_LIMIT_LOGOUT_MAX: 60,
  RATE_LIMIT_CREATE_MEMBER_WINDOW_MS: 3600000,
  RATE_LIMIT_CREATE_MEMBER_MAX: 12,
  RATE_LIMIT_404_WINDOW_MS: 3600000,
  RATE_LIMIT_404_MAX: 120,
  RATE_LIMIT_HEALTH_WINDOW_MS: 60000,
  RATE_LIMIT_HEALTH_MAX: 120,
  RATE_LIMIT_PROFILE_WINDOW_MS: 900000,
  RATE_LIMIT_PROFILE_MAX: 300,
  RATE_LIMIT_DASHBOARD_READ_WINDOW_MS: 900000,
  RATE_LIMIT_DASHBOARD_READ_MAX: 600,
  RATE_LIMIT_ANALYTICS_READ_WINDOW_MS: 900000,
  RATE_LIMIT_ANALYTICS_READ_MAX: 450,
  RATE_LIMIT_PROJECTS_READ_WINDOW_MS: 900000,
  RATE_LIMIT_PROJECTS_READ_MAX: 600,
  RATE_LIMIT_PROJECTS_WRITE_WINDOW_MS: 900000,
  RATE_LIMIT_PROJECTS_WRITE_MAX: 180,
  RATE_LIMIT_CLIENTS_READ_WINDOW_MS: 900000,
  RATE_LIMIT_CLIENTS_READ_MAX: 600,
  RATE_LIMIT_CLIENTS_WRITE_WINDOW_MS: 900000,
  RATE_LIMIT_CLIENTS_WRITE_MAX: 180,
  RATE_LIMIT_MEMBERS_READ_WINDOW_MS: 900000,
  RATE_LIMIT_MEMBERS_READ_MAX: 450,
  RATE_LIMIT_MEMBERS_WRITE_WINDOW_MS: 900000,
  RATE_LIMIT_MEMBERS_WRITE_MAX: 120,
  RATE_LIMIT_LEADS_READ_WINDOW_MS: 900000,
  RATE_LIMIT_LEADS_READ_MAX: 600,
  RATE_LIMIT_LEADS_WRITE_WINDOW_MS: 900000,
  RATE_LIMIT_LEADS_WRITE_MAX: 240,
  RATE_LIMIT_MEDIA_READ_WINDOW_MS: 900000,
  RATE_LIMIT_MEDIA_READ_MAX: 600,
  RATE_LIMIT_MEDIA_WRITE_WINDOW_MS: 900000,
  RATE_LIMIT_MEDIA_WRITE_MAX: 120,
  RATE_LIMIT_TASKS_READ_WINDOW_MS: 900000,
  RATE_LIMIT_TASKS_READ_MAX: 600,
  RATE_LIMIT_TASKS_WRITE_WINDOW_MS: 900000,
  RATE_LIMIT_TASKS_WRITE_MAX: 240,
  RATE_LIMIT_PAYMENTS_READ_WINDOW_MS: 900000,
  RATE_LIMIT_PAYMENTS_READ_MAX: 450,
  RATE_LIMIT_PAYMENTS_WRITE_WINDOW_MS: 900000,
  RATE_LIMIT_PAYMENTS_WRITE_MAX: 120,
  RATE_LIMIT_NOTIFICATIONS_READ_WINDOW_MS: 900000,
  RATE_LIMIT_NOTIFICATIONS_READ_MAX: 600,
  RATE_LIMIT_NOTIFICATIONS_WRITE_WINDOW_MS: 900000,
  RATE_LIMIT_NOTIFICATIONS_WRITE_MAX: 240,
  RATE_LIMIT_BLOG_WINDOW_MS: 900000,
  RATE_LIMIT_BLOG_MAX: 300,
  RATE_LIMIT_BLOG_EMBED_PAGE_WINDOW_MS: 60000,
  RATE_LIMIT_BLOG_EMBED_PAGE_MAX: 120,
  RATE_LIMIT_BLOG_EMBED_TRACK_WINDOW_MS: 60000,
  RATE_LIMIT_BLOG_EMBED_TRACK_MAX: 60,
  RATE_LIMIT_BLOG_EMBED_TRACK_HOURLY_WINDOW_MS: 3600000,
  RATE_LIMIT_BLOG_EMBED_TRACK_HOURLY_MAX: 1200,
  RATE_LIMIT_WEBHOOK_WINDOW_MS: 60000,
  RATE_LIMIT_WEBHOOK_MAX: 120,
};

const envNumber = (name) => {
  const rawValue = process.env[name];
  const fallback = RATE_LIMIT_DEFAULTS[name];
  const value = rawValue === undefined || rawValue === "" ? fallback : Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Missing or invalid rate limit environment variable ${name}. Expected a positive number.`);
  }

  return value;
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

const createLimiter = ({ windowEnv, maxEnv, message, keyGenerator: limiterKeyGenerator = keyGenerator, ...options }) => rateLimit({
  windowMs: envNumber(windowEnv),
  max: envNumber(maxEnv),
  store: createStore(),
  keyGenerator: limiterKeyGenerator,
  ...commonOptions,
  ...options,
  message,
});

const authenticatedLimiter = (resource, action, message = "Too many requests. Please slow down.") => createLimiter({
  windowEnv: `RATE_LIMIT_${resource}_${action}_WINDOW_MS`,
  maxEnv: `RATE_LIMIT_${resource}_${action}_MAX`,
  message: { success: false, message },
});

const createMember = createLimiter({
  windowEnv: "RATE_LIMIT_CREATE_MEMBER_WINDOW_MS",
  maxEnv: "RATE_LIMIT_CREATE_MEMBER_MAX",
  message: { success: false, message: "Too many accounts created. Please try again later." },
});

const authLogin = createLimiter({
  windowEnv: "RATE_LIMIT_AUTH_LOGIN_WINDOW_MS",
  maxEnv: "RATE_LIMIT_AUTH_LOGIN_MAX",
  keyGenerator: (req) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    return email ? `login_email_${email}` : `login_fallback_${ipKeyGenerator(req.ip)}`;
  },
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many login attempts. Please try again later." },
});

const authLoginIp = createLimiter({
  windowEnv: "RATE_LIMIT_AUTH_LOGIN_IP_WINDOW_MS",
  maxEnv: "RATE_LIMIT_AUTH_LOGIN_IP_MAX",
  keyGenerator: (req) => `login_ip_${ipKeyGenerator(req.ip)}`,
  skipSuccessfulRequests: true,
  message: { success: false, message: "Too many login attempts. Please try again later." },
});

const profile = createLimiter({
  windowEnv: "RATE_LIMIT_PROFILE_WINDOW_MS",
  maxEnv: "RATE_LIMIT_PROFILE_MAX",
  message: { success: false, message: "Too many requests. Please slow down." },
});

const dashboardRead = authenticatedLimiter("DASHBOARD", "READ");

const projectsRead = authenticatedLimiter("PROJECTS", "READ");
const projectsWrite = authenticatedLimiter("PROJECTS", "WRITE");

const clientsRead = authenticatedLimiter("CLIENTS", "READ");
const clientsWrite = authenticatedLimiter("CLIENTS", "WRITE");

const membersRead = authenticatedLimiter("MEMBERS", "READ");
const membersWrite = authenticatedLimiter("MEMBERS", "WRITE");

const leadsRead = authenticatedLimiter("LEADS", "READ", "Too many lead requests. Please slow down.");
const leadsWrite = authenticatedLimiter("LEADS", "WRITE", "Too many lead requests. Please slow down.");

const mediaRead = authenticatedLimiter("MEDIA", "READ");
const mediaWrite = authenticatedLimiter("MEDIA", "WRITE");

const analyticsRead = authenticatedLimiter("ANALYTICS", "READ", "Too many analytics requests. Please slow down.");

const paymentsRead = authenticatedLimiter("PAYMENTS", "READ", "Too many payment requests. Please slow down.");
const paymentsWrite = authenticatedLimiter("PAYMENTS", "WRITE", "Too many payment requests. Please slow down.");

const tasksRead = authenticatedLimiter("TASKS", "READ", "Too many task requests. Please slow down.");
const tasksWrite = authenticatedLimiter("TASKS", "WRITE", "Too many task requests. Please slow down.");

const notificationsRead = authenticatedLimiter("NOTIFICATIONS", "READ", "Too many notification requests. Please slow down.");
const notificationsWrite = authenticatedLimiter("NOTIFICATIONS", "WRITE", "Too many notification requests. Please slow down.");

const logout = createLimiter({
  windowEnv: "RATE_LIMIT_LOGOUT_WINDOW_MS",
  maxEnv: "RATE_LIMIT_LOGOUT_MAX",
  message: { success: false, message: "Too many logout attempts." },
});

const fourzerofour = createLimiter({
  windowEnv: "RATE_LIMIT_404_WINDOW_MS",
  maxEnv: "RATE_LIMIT_404_MAX",
  message: { success: false, message: "Too many failed requests." },
});

const health = createLimiter({
  windowEnv: "RATE_LIMIT_HEALTH_WINDOW_MS",
  maxEnv: "RATE_LIMIT_HEALTH_MAX",
  message: { success: false, message: "Too many health checks." },
});

const blog = createLimiter({
  windowEnv: "RATE_LIMIT_BLOG_WINDOW_MS",
  maxEnv: "RATE_LIMIT_BLOG_MAX",
  message: { success: false, message: "Too many requests. Please slow down." },
});

const blogEmbedTrack = createLimiter({
  windowEnv: "RATE_LIMIT_BLOG_EMBED_TRACK_WINDOW_MS",
  maxEnv: "RATE_LIMIT_BLOG_EMBED_TRACK_MAX",
  keyGenerator: (req) => `embed_track_${ipKeyGenerator(req.ip)}_${req.params?.slug || ""}`,
  message: { success: false, message: "Too many view track requests." },
});

const blogEmbedTrackHourly = createLimiter({
  windowEnv: "RATE_LIMIT_BLOG_EMBED_TRACK_HOURLY_WINDOW_MS",
  maxEnv: "RATE_LIMIT_BLOG_EMBED_TRACK_HOURLY_MAX",
  keyGenerator: (req) => `embed_track_hour_${ipKeyGenerator(req.ip)}_${req.params?.slug || ""}`,
  message: { success: false, message: "Too many view track requests." },
});

const blogEmbedPage = createLimiter({
  windowEnv: "RATE_LIMIT_BLOG_EMBED_PAGE_WINDOW_MS",
  maxEnv: "RATE_LIMIT_BLOG_EMBED_PAGE_MAX",
  keyGenerator: (req) => `embed_page_${ipKeyGenerator(req.ip)}_${req.params?.slug || ""}`,
  message: { success: false, message: "Too many embed page requests." },
});

const webhook = createLimiter({
  windowEnv: "RATE_LIMIT_WEBHOOK_WINDOW_MS",
  maxEnv: "RATE_LIMIT_WEBHOOK_MAX",
  keyGenerator: (req) => `webhook_${ipKeyGenerator(req.ip)}`,
  message: { success: false, message: "Too many webhook requests." },
});

module.exports = {
  createMember,
  authLogin,
  authLoginIp,
  health,
  profile,
  logout,
  dashboardRead,
  projectsRead,
  projectsWrite,
  clientsRead,
  clientsWrite,
  membersRead,
  membersWrite,
  leadsRead,
  leadsWrite,
  mediaRead,
  mediaWrite,
  analyticsRead,
  paymentsRead,
  paymentsWrite,
  tasksRead,
  tasksWrite,
  notificationsRead,
  notificationsWrite,
  fourzerofour,
  blog,
  blogEmbedPage,
  blogEmbedTrack,
  blogEmbedTrackHourly,
  webhook,
};
