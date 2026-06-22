'use strict';

/**
 * Full workflow audit for Atlas Admin Dashboard backend.
 *
 * Usage:
 *   node scripts/workflow-audit.js
 *
 * Safety:
 *   - Loads .env.staging by default.
 *   - Refuses to run when NODE_ENV=production.
 *   - Refuses non-local/non-staging URLs unless explicitly allowed.
 *   - Does not print cookies, bearer tokens, or environment secrets.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_FILE = process.env.WORKFLOW_AUDIT_ENV_FILE || process.env.SMOKE_TEST_ENV_FILE || '.env.staging';
const envPath = path.resolve(process.cwd(), ENV_FILE);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const BASE_URL = (process.env.WORKFLOW_AUDIT_BASE_URL || process.env.SMOKE_TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/+$/, '');
const REPORT_PATH = process.env.WORKFLOW_AUDIT_REPORT_PATH || 'WORKFLOW_AUDIT_REPORT.md';
const ADMIN_EMAIL = (process.env.SMOKE_EMAIL || 'onasogaemmanuel02@gmail.com').trim();
const ADMIN_PASSWORD = (process.env.SMOKE_PASSWORD || 'nimda@salta').trim();
const WEBHOOK_TOKEN = (process.env.WEBHOOK_BEARER_TOKEN || '').trim();
const ENABLE_CLOUDINARY_UPLOADS = /^true$/i.test(process.env.WORKFLOW_AUDIT_ENABLE_CLOUDINARY_UPLOADS || '');
const HAS_CLOUDINARY_CONFIG = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
  .every((key) => Boolean((process.env[key] || '').trim()));
const SHOULD_RUN_CLOUDINARY_UPLOADS = ENABLE_CLOUDINARY_UPLOADS && HAS_CLOUDINARY_CONFIG;
const STARTED_AT = new Date();
const SUFFIX = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const PROJECT_ROOT = process.cwd();

const state = {
  adminCookie: '',
  adminUserId: '',
  staffCookie: '',
  staffId: '',
  created: {
    members: new Set(),
    clients: new Set(),
    projects: new Set(),
    tasks: new Set(),
    leads: new Set(),
    mediaFiles: new Set(),
    payments: new Set(),
    blogPosts: new Set(),
  },
  results: [],
  findings: [],
};

function abortIfUnsafeTarget() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Refusing to run workflow audit with NODE_ENV=production. Use staging/local only.');
  }

  let parsed;
  try {
    parsed = new URL(BASE_URL);
  } catch (error) {
    throw new Error(`Invalid WORKFLOW_AUDIT_BASE_URL: ${BASE_URL}`);
  }

  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const looksStaging = /staging|stage|127\.0\.0\.1|localhost/i.test(BASE_URL);
  const allowRemoteStaging = /^true$/i.test(process.env.WORKFLOW_AUDIT_ALLOW_REMOTE_STAGING || '');

  if (!localHosts.has(host) && !looksStaging && !allowRemoteStaging) {
    throw new Error('Refusing to run against a non-local/non-staging URL. Set WORKFLOW_AUDIT_ALLOW_REMOTE_STAGING=true only for a verified staging URL.');
  }
}

function redact(value) {
  return String(value ?? '')
    .replace(/auth_token=[^;\s]+/gi, 'auth_token=<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer <redacted>')
    .replace(new RegExp(escapeRegExp(ADMIN_PASSWORD), 'g'), '<redacted-password>')
    .slice(0, 600);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Minimal valid PNG (1x1 pixel, red)
const tinyPngBuffer = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

// Minimal valid JPEG
const tinyJpegBuffer = () => Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM', 'base64');

// Generic binary buffer for non-image file uploads
const tinyBinaryBuffer = () => Buffer.from('Hello, this is a test file for upload.', 'utf-8');

function isUsableHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch (_) {
    return false;
  }
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.resolve(PROJECT_ROOT, relativePath));
}

function urlHost(value) {
  try {
    return new URL(String(value || '')).hostname;
  } catch (_) {
    return '<invalid-url>';
  }
}

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addResult(status, area, label, detail = {}) {
  const record = {
    status,
    area,
    label,
    method: detail.method || '',
    endpoint: detail.endpoint || '',
    httpStatus: detail.httpStatus ?? '',
    expected: detail.expected || '',
    actual: detail.actual || '',
    note: detail.note || '',
    durationMs: detail.durationMs ?? '',
  };
  state.results.push(record);

  const glyph = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'WARN' ? '!' : '-';
  const color = status === 'PASS' ? '\x1b[32m' : status === 'FAIL' ? '\x1b[31m' : status === 'WARN' ? '\x1b[33m' : '\x1b[36m';
  const suffix = record.httpStatus !== '' ? ` [${record.httpStatus}]` : '';
  const note = record.note ? ` — ${record.note}` : '';
  console.log(`  ${color}${glyph}\x1b[0m ${label}${suffix}${note}`);
}

function addFinding({ severity = 'Medium', area, title, endpoint = '', expected = '', actual = '', reproduction = [], smokeGap = true }) {
  const key = `${severity}|${area}|${title}|${endpoint}`;
  if (state.findings.some((finding) => finding.key === key)) return;
  state.findings.push({
    key,
    severity,
    area,
    title,
    endpoint,
    expected,
    actual: redact(actual),
    reproduction,
    smokeGap,
  });
}

function warnFinding(area, label, finding) {
  addResult('WARN', area, label, {
    endpoint: finding.endpoint,
    actual: finding.actual,
    note: finding.actual || finding.title,
  });
  addFinding({ area, ...finding });
}

async function http(method, endpoint, options = {}) {
  const started = nowMs();
  const headers = { ...(options.headers || {}) };
  const requestOptions = { method, headers, redirect: options.redirect || 'manual' };
  const effectiveCookie = Object.prototype.hasOwnProperty.call(options, 'cookie') ? options.cookie : state.adminCookie;

  if (effectiveCookie) headers.Cookie = effectiveCookie;

  if (Object.prototype.hasOwnProperty.call(options, 'body')) {
    headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify(options.body);
  }

  if (options.multipart) {
    const form = new FormData();
    for (const [name, value] of Object.entries(options.multipart.fields || {})) {
      if (value !== undefined && value !== null) form.append(name, String(value));
    }
    for (const file of options.multipart.files || []) {
      const blob = new Blob([file.content], { type: file.contentType || 'application/octet-stream' });
      form.append(file.name, blob, file.filename || 'file.bin');
    }
    delete headers['Content-Type'];
    requestOptions.body = form;
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, requestOptions);
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (_) {
        json = null;
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
      headers: response.headers,
      durationMs: nowMs() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: '',
      headers: new Headers(),
      durationMs: nowMs() - started,
      error,
    };
  }
}

async function expectStatus(area, label, method, endpoint, options = {}, expectedStatuses = [200], findingOptions = {}) {
  const response = await http(method, endpoint, options);
  const expected = expectedStatuses.join('/');
  const passed = expectedStatuses.includes(response.status);
  const note = response.error
    ? `connection error: ${response.error.message}`
    : (!passed && response.json?.message ? response.json.message : '');

  addResult(passed ? 'PASS' : 'FAIL', area, label, {
    method,
    endpoint,
    httpStatus: response.status,
    expected,
    actual: response.json?.message || response.text || response.error?.message || '',
    note,
    durationMs: response.durationMs,
  });

  if (!passed) {
    addFinding({
      severity: findingOptions.severity || (response.status >= 500 || response.status === 0 ? 'High' : 'Medium'),
      area,
      title: findingOptions.title || `${label} returned unexpected status`,
      endpoint: `${method} ${endpoint}`,
      expected: findingOptions.expected || `HTTP ${expected}`,
      actual: `HTTP ${response.status}${response.json?.message ? `: ${response.json.message}` : ''}`,
      reproduction: findingOptions.reproduction || [`${method} ${endpoint}`],
      smokeGap: findingOptions.smokeGap !== false,
    });
  }

  return response;
}

function assertCheck(area, label, condition, options = {}) {
  addResult(condition ? 'PASS' : 'FAIL', area, label, {
    endpoint: options.endpoint || '',
    expected: options.expected || '',
    actual: options.actual || '',
    note: condition ? '' : (options.actual || options.note || ''),
  });

  if (!condition) {
    addFinding({
      severity: options.severity || 'Medium',
      area,
      title: options.title || label,
      endpoint: options.endpoint || '',
      expected: options.expected || 'Assertion should pass',
      actual: options.actual || options.note || 'Assertion failed',
      reproduction: options.reproduction || [],
      smokeGap: options.smokeGap !== false,
    });
  }
}

function skip(area, label, note = '') {
  addResult('SKIP', area, label, { note });
}

function assertDashboardTotalLeadTaskMetrics(area, label, metrics, endpoint = 'GET /api/dashboard/metrics') {
  const issues = [];
  const hasNewLeads = Object.prototype.hasOwnProperty.call(metrics || {}, 'newLeads');
  const hasPendingTasks = Object.prototype.hasOwnProperty.call(metrics || {}, 'pendingTasks');

  if (typeof metrics?.totalLeads?.value !== 'number') issues.push('totalLeads.value is not numeric');
  if (typeof metrics?.totalTasks?.value !== 'number') issues.push('totalTasks.value is not numeric');
  if (hasNewLeads) issues.push('obsolete newLeads metric is present');
  if (hasPendingTasks) issues.push('obsolete pendingTasks metric is present');

  assertCheck(area, label, issues.length === 0, {
    endpoint,
    expected: 'totalLeads.value and totalTasks.value are numeric, with no obsolete newLeads/pendingTasks keys',
    actual: issues.length ? issues.join('; ') : JSON.stringify({
      totalLeads: metrics?.totalLeads?.value,
      totalTasks: metrics?.totalTasks?.value,
      hasNewLeads,
      hasPendingTasks,
    }),
    severity: 'High',
    smokeGap: false,
  });
}

function assertClientDetailInsights(area, label, client, expected = {}) {
  const issues = [];

  if (!client || typeof client !== 'object' || Array.isArray(client)) issues.push('client detail is not an object');
  if (!Object.prototype.hasOwnProperty.call(client || {}, 'lastActivity')) issues.push('lastActivity key is missing');
  if (!Array.isArray(client?.projects)) issues.push('projects is not an array');
  if (!Array.isArray(client?.notesHistory)) issues.push('notesHistory is not an array');
  if (!client?.quickInsights || typeof client.quickInsights !== 'object' || Array.isArray(client.quickInsights)) issues.push('quickInsights is not an object');
  if (typeof client?.projectsCount !== 'number') issues.push('projectsCount is not numeric');
  if (typeof client?.quickInsights?.totalProjects !== 'number') issues.push('quickInsights.totalProjects is not numeric');
  if (typeof client?.quickInsights?.activeProjects !== 'number') issues.push('quickInsights.activeProjects is not numeric');
  if (client?.projectsCount !== client?.quickInsights?.totalProjects) issues.push('projectsCount does not match quickInsights.totalProjects');

  if (expected.projectId && !client?.projects?.some((project) => project?.id === expected.projectId)) {
    issues.push(`associated project ${expected.projectId} is missing from projects array`);
  }
  if (expected.totalProjects !== undefined && client?.projectsCount !== expected.totalProjects) {
    issues.push(`projectsCount expected ${expected.totalProjects}, received ${client?.projectsCount}`);
  }
  if (expected.activeProjects !== undefined && client?.quickInsights?.activeProjects !== expected.activeProjects) {
    issues.push(`quickInsights.activeProjects expected ${expected.activeProjects}, received ${client?.quickInsights?.activeProjects}`);
  }
  if (expected.noteSubstring && !String(client?.notes || '').includes(expected.noteSubstring)) {
    issues.push(`notes does not include ${expected.noteSubstring}`);
  }
  if (expected.noteSubstring && !client?.notesHistory?.some((entry) => String(entry?.note || '').includes(expected.noteSubstring))) {
    issues.push(`notesHistory does not include ${expected.noteSubstring}`);
  }
  if (expected.requireLastActivity && !client?.lastActivity?.createdAt) {
    issues.push('lastActivity is missing or does not include createdAt');
  }

  assertCheck(area, label, issues.length === 0, {
    endpoint: expected.endpoint || 'GET /api/clients/:id',
    expected: 'client detail includes lastActivity, projects, notesHistory, dynamic project counts, and quickInsights totals',
    actual: issues.length ? issues.join('; ') : JSON.stringify({
      id: client?.id,
      projectsCount: client?.projectsCount,
      quickInsights: client?.quickInsights,
      projectIds: Array.isArray(client?.projects) ? client.projects.map((project) => project?.id).filter(Boolean) : [],
      notesHistoryCount: Array.isArray(client?.notesHistory) ? client.notesHistory.length : null,
      lastActivityType: client?.lastActivity?.type || null,
    }),
    severity: 'High',
    smokeGap: false,
  });
}

function remember(kind, id) {
  if (id && state.created[kind]) state.created[kind].add(id);
  return id;
}

function forget(kind, id) {
  if (id && state.created[kind]) state.created[kind].delete(id);
}

async function loginAs(area, label, email, password, cookie = '') {
  const response = await http('POST', '/api/auth/login', {
    cookie,
    body: { email, password },
  });
  const rawCookie = response.headers.get('set-cookie') || '';
  const match = rawCookie.match(/auth_token=([^;]+)/);
  const authCookie = match ? `auth_token=${match[1]}` : '';
  const passed = response.status === 200 && Boolean(authCookie);

  addResult(passed ? 'PASS' : 'FAIL', area, label, {
    method: 'POST',
    endpoint: '/api/auth/login',
    httpStatus: response.status,
    expected: '200 with auth cookie',
    actual: response.json?.message || '',
    note: passed ? '' : (response.json?.message || 'auth cookie missing'),
    durationMs: response.durationMs,
  });

  if (!passed) {
    addFinding({
      severity: response.status === 0 || response.status >= 500 ? 'High' : 'Critical',
      area,
      title: `${label} failed`,
      endpoint: 'POST /api/auth/login',
      expected: 'Admin/staging user can authenticate against local staging',
      actual: `HTTP ${response.status}${response.json?.message ? `: ${response.json.message}` : ''}`,
      reproduction: ['Start the server with NODE_ENV=staging', 'POST /api/auth/login with configured staging credentials'],
      smokeGap: false,
    });
  }

  return { response, cookie: authCookie, user: response.json?.data?.user || null };
}

function runNotificationWiringAudit() {
  console.log('\n[NOTIFICATION WIRING / STATIC INVARIANTS]');
  const area = 'Notification system wiring';
  const serverSource = readProjectFile('server.js');
  const notificationRoutePath = 'functions/routes/notifications.js';
  const notificationServicePath = 'functions/services/notification.js';
  const dbPath = 'functions/db/index.js';
  const swaggerPath = 'functions/docs/swagger.js';
  const projectRoutePath = 'functions/routes/projects.js';
  const clientRoutePath = 'functions/routes/clients.js';
  const leadRoutePath = 'functions/routes/leads.js';
  const memberRoutePath = 'functions/routes/members.js';
  const notificationModelPath = 'functions/models/notification.js';
  const mediaFileModelPath = 'functions/models/media-file.js';
  const notificationRouteSource = fileExists(notificationRoutePath) ? readProjectFile(notificationRoutePath) : '';
  const mediaFileModelSource = fileExists(mediaFileModelPath) ? readProjectFile(mediaFileModelPath) : '';
  const notificationServiceSource = fileExists(notificationServicePath) ? readProjectFile(notificationServicePath) : '';
  const dbSource = readProjectFile(dbPath);
  const swaggerSource = readProjectFile(swaggerPath);
  const projectRouteSource = readProjectFile(projectRoutePath);
  const clientRouteSource = readProjectFile(clientRoutePath);
  const leadRouteSource = readProjectFile(leadRoutePath);
  const memberRouteSource = readProjectFile(memberRoutePath);
  const notificationModelSource = readProjectFile(notificationModelPath);
  const javascriptFiles = [
    'server.js',
    ...fs.readdirSync(path.resolve(PROJECT_ROOT, 'functions/routes')).map((name) => `functions/routes/${name}`).filter((name) => name.endsWith('.js')),
    ...fs.readdirSync(path.resolve(PROJECT_ROOT, 'functions/services')).map((name) => `functions/services/${name}`).filter((name) => name.endsWith('.js')),
    'functions/db/index.js',
  ];

  assertCheck(area, 'Notification route is imported in server.js', /require\(['"]\.\/functions\/routes\/notifications['"]\)/.test(serverSource), {
    endpoint: 'server.js',
    expected: 'server.js requires ./functions/routes/notifications',
    actual: 'notification route import missing',
    severity: 'Critical',
    smokeGap: false,
  });
  assertCheck(area, 'Notification route is mounted behind auth middleware', /app\.use\(['"]\/api\/notifications['"],\s*middlewares\.authMiddleware,\s*notificationsApi\)/.test(serverSource), {
    endpoint: 'server.js',
    expected: 'app.use("/api/notifications", middlewares.authMiddleware, notificationsApi)',
    actual: 'authenticated notification mount missing',
    severity: 'Critical',
    smokeGap: false,
  });
  assertCheck(area, 'Notification route file exists', fileExists(notificationRoutePath), {
    endpoint: notificationRoutePath,
    expected: 'Route file exists',
    actual: 'Route file missing',
    severity: 'Critical',
    smokeGap: false,
  });
  assertCheck(area, 'Notification route exposes list and read endpoints', /router\.get\(['"]\/['"]/.test(notificationRouteSource) && /router\.put\(['"]\/read-all['"]/.test(notificationRouteSource) && /router\.put\(['"]\/:id\/read['"]/.test(notificationRouteSource), {
    endpoint: notificationRoutePath,
    expected: 'GET /, PUT /read-all, PUT /:id/read handlers exist',
    actual: 'One or more notification route handlers are missing',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'Notification service exists and exports bulk dispatch support', fileExists(notificationServicePath) && /class\s+NotificationService/.test(notificationServiceSource) && /static\s+dispatchMany\s*\(/.test(notificationServiceSource), {
    endpoint: notificationServicePath,
    expected: 'NotificationService with static dispatchMany()',
    actual: 'NotificationService.dispatchMany missing',
    severity: 'Critical',
    smokeGap: false,
  });
  assertCheck(area, 'Notification service bulk dispatch persists through DB bulk helper', /createNotifications\s*\([^)]*\)[\s\S]*db\.addNotifications/.test(notificationServiceSource), {
    endpoint: notificationServicePath,
    expected: 'createNotifications() delegates to db.addNotifications()',
    actual: 'Bulk service path does not use DB bulk insert helper',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'Notification DB helpers include bulk insert support', /async\s+function\s+addNotification\s*\(/.test(dbSource) && /async\s+function\s+addNotifications\s*\(/.test(dbSource) && /insertMany\s*\(/.test(dbSource), {
    endpoint: dbPath,
    expected: 'addNotification(), addNotifications(), and insertMany()',
    actual: 'Notification DB helper or insertMany support missing',
    severity: 'Critical',
    smokeGap: false,
  });
  assertCheck(area, 'Notification DB helpers include read-state operations', /getNotificationsByRecipient/.test(dbSource) && /markNotificationAsRead/.test(dbSource) && /markAllNotificationsAsRead/.test(dbSource), {
    endpoint: dbPath,
    expected: 'List, mark-one-read, and mark-all-read helpers exist',
    actual: 'One or more read-state helpers missing',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'Notification route exposes per-user preference endpoints', /router\.get\(['"]\/preferences['"],\s*async\s*\(/.test(notificationRouteSource) && /router\.put\(['"]\/preferences['"],\s*async\s*\(/.test(notificationRouteSource), {
    endpoint: notificationRoutePath,
    expected: 'GET /preferences and PUT /preferences handlers exist behind the authenticated /api/notifications mount',
    actual: 'Per-user notification preference route handlers are missing',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'Notification model defines preference schemas and defaults', /notificationPreferencesSchema/.test(notificationModelSource) && /updateNotificationPreferencesSchema/.test(notificationModelSource) && /defaultNotificationPreferences/.test(notificationModelSource) && /normalizeNotificationPreferences/.test(notificationModelSource), {
    endpoint: notificationModelPath,
    expected: 'Preference schema, partial update schema, default map, and normalizer are exported',
    actual: 'One or more notification preference model exports are missing',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'Notification service resolves per-user preferences before insert', /getUserNotificationPreferencesMap/.test(notificationServiceSource) && /normalizedPrefMap/.test(notificationServiceSource) && /db\.addNotifications\(/.test(notificationServiceSource), {
    endpoint: notificationServicePath,
    expected: 'createNotifications() loads per-user preferences, normalizes them, and filters by inApp/email channels before insert',
    actual: 'Per-user preference resolution is missing from service bulk path',
    severity: 'Critical',
    smokeGap: false,
  });
  assertCheck(area, 'Swagger documents per-user notification preference endpoints', /NotificationPreferences/.test(swaggerSource) && /UpdateNotificationPreferencesRequest/.test(swaggerSource) && /\/api\/notifications\/preferences/.test(swaggerSource), {
    endpoint: swaggerPath,
    expected: 'Preference schemas plus /api/notifications/preferences path are documented',
    actual: 'Swagger preference endpoint or schemas missing',
    severity: 'Medium',
    smokeGap: false,
  });

  const requiredNotificationTypes = [
    'TASK_ASSIGNMENT',
    'PROJECT_ASSIGNMENT',
    'CLIENT_ASSIGNMENT',
    'LEAD_ASSIGNMENT',
    'COMMENT_MENTION',
    'ROLE_CHANGE',
    'SYSTEM_ALERT',
    'CLIENT_CREATED',
    'PROJECT_STATUS_CHANGE',
    'LEAD_STATUS_CHANGE',
    'PROJECT_COMMENT',
    'PASSWORD_UPDATED',
  ];
  const missingNotificationTypes = requiredNotificationTypes.filter((type) => !notificationModelSource.includes(`'${type}'`) && !notificationModelSource.includes(`"${type}"`));
  assertCheck(area, 'Notification model includes required workflow event types', missingNotificationTypes.length === 0, {
    endpoint: notificationModelPath,
    expected: `Notification enum includes ${requiredNotificationTypes.join(', ')}`,
    actual: missingNotificationTypes.length ? `Missing: ${missingNotificationTypes.join(', ')}` : 'All required notification types are present',
    severity: 'Critical',
    smokeGap: false,
  });

  assertCheck(area, 'Notification DB helpers include role recipient lookup', /async\s+function\s+getUsersByRoles\s*\(/.test(dbSource) && /getUsersByRoles/.test(dbSource), {
    endpoint: dbPath,
    expected: 'getUsersByRoles() helper is implemented and exported',
    actual: 'Role recipient lookup helper missing or not exported',
    severity: 'High',
    smokeGap: false,
  });

  assertCheck(area, 'New client notifications are wired for admin fan-out', /CLIENT_CREATED/.test(clientRouteSource) && /getUsersByRoles\s*\(/.test(clientRouteSource) && /NotificationService\.dispatchMany\s*\(/.test(clientRouteSource), {
    endpoint: clientRoutePath,
    expected: 'POST /api/clients emits CLIENT_CREATED through dispatchMany to role recipients',
    actual: 'CLIENT_CREATED dispatchMany wiring missing from clients route',
    severity: 'High',
    smokeGap: false,
  });

  assertCheck(area, 'Project status and comment notifications are wired for fan-out', /PROJECT_STATUS_CHANGE/.test(projectRouteSource) && /PROJECT_COMMENT/.test(projectRouteSource) && /COMMENT_MENTION/.test(projectRouteSource), {
    endpoint: projectRoutePath,
    expected: 'Projects route wires PROJECT_STATUS_CHANGE, PROJECT_COMMENT, and COMMENT_MENTION notifications',
    actual: 'One or more project notification triggers are missing',
    severity: 'High',
    smokeGap: false,
  });

  assertCheck(area, 'Lead status notifications are wired with duplicate-safe fan-out', /LEAD_STATUS_CHANGE/.test(leadRouteSource) && /new\s+Set\s*\(/.test(leadRouteSource) && /NotificationService\.dispatchMany\s*\(/.test(leadRouteSource), {
    endpoint: leadRoutePath,
    expected: 'PATCH /api/leads/:leadId emits LEAD_STATUS_CHANGE through duplicate-safe dispatchMany',
    actual: 'LEAD_STATUS_CHANGE dispatchMany wiring missing from leads route',
    severity: 'High',
    smokeGap: false,
  });

  assertCheck(area, 'Password update notifications are wired', /PASSWORD_UPDATED/.test(memberRouteSource) && /NotificationService\.dispatch\s*\(/.test(memberRouteSource), {
    endpoint: memberRoutePath,
    expected: 'PUT /api/members/:id/password emits PASSWORD_UPDATED to the member',
    actual: 'PASSWORD_UPDATED dispatch wiring missing from members route',
    severity: 'High',
    smokeGap: false,
  });

  const projectNotificationBlocks = [...projectRouteSource.matchAll(/NotificationService\.(dispatchMany|dispatch)\s*\(/g)].map((match) => match[1]);
  assertCheck(area, 'Project fan-out notifications use dispatchMany', projectNotificationBlocks.includes('dispatchMany') && !projectNotificationBlocks.includes('dispatch'), {
    endpoint: projectRoutePath,
    expected: 'Project assignment/comment fan-out uses NotificationService.dispatchMany and no per-recipient dispatch calls',
    actual: `NotificationService calls in projects route: ${projectNotificationBlocks.join(', ') || '<none>'}`,
    severity: 'High',
    smokeGap: false,
  });

  // Project file endpoints
  assertCheck(area, 'Project file upload route is wired in projects route', /router\.post\(['"]\/:projectId\/files['"],\s*projectFileUploadMiddleware/.test(projectRouteSource), {
    endpoint: projectRoutePath,
    expected: 'POST /:projectId/files route handler with projectFileUploadMiddleware behind the authenticated /api/projects mount',
    actual: 'Project file upload POST route is missing',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'Project file list route is wired in projects route', /router\.get\(['"]\/:projectId\/files['"],\s*async\s*\(/.test(projectRouteSource), {
    endpoint: projectRoutePath,
    expected: 'GET /:projectId/files route handler behind the authenticated /api/projects mount',
    actual: 'Project file list GET route is missing',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'Project file delete route is wired in projects route', /router\.delete\(['"]\/:projectId\/files\/:fileId['"],\s*async\s*\(/.test(projectRouteSource), {
    endpoint: projectRoutePath,
    expected: 'DELETE /:projectId/files/:fileId route handler behind the authenticated /api/projects mount',
    actual: 'Project file delete DELETE route is missing',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'Media file model includes projectId field', /projectId:\s*z\.string\(\)\.min\(1\)\.nullable\(\)\.default\(null\)/.test(mediaFileModelSource), {
    endpoint: 'functions/models/media-file.js',
    expected: 'mediaFileSchema.projectId as nullable string default null',
    actual: 'projectId field missing from media-file model',
    severity: 'High',
    smokeGap: false,
  });

  const invalidResUsages = [];
  const mongooseReferences = [];
  for (const relativePath of javascriptFiles) {
    const source = readProjectFile(relativePath);
    if (/\bmongoose\b/.test(source)) mongooseReferences.push(relativePath);
    const invalidMatches = [...source.matchAll(/res\.(success|error)\s*\(/g)]
      .filter(() => relativePath !== 'server.js')
      .map((match) => `${relativePath}:${match[0]}`);
    invalidResUsages.push(...invalidMatches);
  }
  assertCheck(area, 'No mongoose references remain in runtime JavaScript files', mongooseReferences.length === 0, {
    endpoint: 'runtime JavaScript files',
    expected: 'No mongoose references; backend uses mongodb driver helpers',
    actual: mongooseReferences.join(', ') || 'No mongoose references found',
    severity: 'High',
    smokeGap: false,
  });
  assertCheck(area, 'No route/service code uses invalid res.success or res.error helpers', invalidResUsages.length === 0, {
    endpoint: 'functions/routes and functions/services',
    expected: 'No res.success()/res.error() calls outside server response normalizer definition',
    actual: invalidResUsages.join(', ') || 'No invalid res.success/res.error calls found',
    severity: 'High',
    smokeGap: false,
  });
}

async function runPreflight() {
  console.log('\n[HEALTH / DOCS / 404 / CORS / UNAUTHORIZED]');
  await expectStatus('Health/Docs/404/CORS', 'GET /api/health returns healthy response', 'GET', '/api/health', { cookie: '' }, [200]);
  await expectStatus('Health/Docs/404/CORS', 'GET /api/docs.json returns OpenAPI JSON', 'GET', '/api/docs.json', { cookie: '' }, [200]);
  await expectStatus('Health/Docs/404/CORS', 'GET /api/docs serves documentation', 'GET', '/api/docs', { cookie: '' }, [200, 301, 302]);
  await expectStatus('Health/Docs/404/CORS', 'GET unknown route returns 404', 'GET', '/api/not-a-real-route', { cookie: '' }, [404]);
  await expectStatus('Health/Docs/404/CORS', 'OPTIONS /api/health does not crash', 'OPTIONS', '/api/health', { cookie: '' }, [200, 204, 404]);

  const cors = await http('GET', '/api/health', {
    cookie: '',
    headers: { Origin: 'https://definitely-not-allowed.audit.invalid' },
  });
  const exposedOrigin = cors.headers.get('access-control-allow-origin') || '';
  assertCheck(
    'Health/Docs/404/CORS',
    'Disallowed Origin is not granted CORS access',
    cors.status !== 200 && exposedOrigin === '',
    {
      endpoint: 'GET /api/health with disallowed Origin',
      expected: 'No Access-Control-Allow-Origin for untrusted origin',
      actual: `HTTP ${cors.status}, Access-Control-Allow-Origin=${exposedOrigin || '<none>'}`,
      severity: 'Medium',
    },
  );
  if (cors.status >= 500) {
    warnFinding('Health/Docs/404/CORS', 'CORS rejection is surfaced as a 5xx response', {
      severity: 'Low',
      title: 'Disallowed CORS origin is reported as a server error',
      endpoint: 'GET /api/health with untrusted Origin header',
      expected: 'CORS rejection should avoid exposing a generic 500 where feasible',
      actual: `HTTP ${cors.status}`,
      reproduction: ['GET /api/health with Origin=https://definitely-not-allowed.audit.invalid'],
      smokeGap: true,
    });
  }

  const protectedRoutes = [
    ['GET', '/api/user/profile'],
    ['GET', '/api/dashboard/metrics'],
    ['GET', '/api/projects'],
    ['GET', '/api/clients'],
    ['GET', '/api/members'],
    ['GET', '/api/media/files'],
    ['GET', '/api/leads'],
    ['GET', '/api/payments'],
    ['GET', '/api/blog'],
    ['POST', '/api/health/redis/flush'],
    ['GET', '/api/notifications'],
    ['PUT', '/api/notifications/read-all'],
  ];

  for (const [method, endpoint] of protectedRoutes) {
    await expectStatus('Auth/session lifecycle', `${method} ${endpoint} rejects missing cookie`, method, endpoint, { cookie: '' }, [401]);
  }

  await expectStatus('Auth/session lifecycle', 'POST /api/auth/login rejects empty body', 'POST', '/api/auth/login', { cookie: '', body: {} }, [400]);
  await expectStatus('Auth/session lifecycle', 'POST /api/auth/login rejects invalid credentials', 'POST', '/api/auth/login', {
    cookie: '',
    body: { email: ADMIN_EMAIL, password: `wrong-${SUFFIX}` },
  }, [401]);
  await expectStatus('Auth/session lifecycle', 'GET /api/user/profile rejects malformed cookie', 'GET', '/api/user/profile', {
    cookie: 'auth_token=not-a-valid-jwt',
  }, [401]);
}

async function runAuthMembersAndRoleFlow() {
  console.log('\n[AUTH / SESSION / MEMBERS / ROLE ACCESS]');
  const adminLogin = await loginAs('Auth/session lifecycle', 'Admin login succeeds', ADMIN_EMAIL, ADMIN_PASSWORD, '');
  if (!adminLogin.cookie) return false;
  state.adminCookie = adminLogin.cookie;

  const alreadyAuthed = await expectStatus('Auth/session lifecycle', 'POST /api/auth/login with active cookie reports existing session', 'POST', '/api/auth/login', {
    cookie: state.adminCookie,
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  }, [200]);
  assertCheck('Auth/session lifecycle', 'Already-auth login does not expose a replacement cookie', !(alreadyAuthed.headers.get('set-cookie') || '').includes('auth_token='), {
    endpoint: 'POST /api/auth/login',
    expected: 'No replacement cookie when userAlreadyAuth short-circuits',
    actual: alreadyAuthed.headers.get('set-cookie') ? 'Set-Cookie returned' : 'No Set-Cookie returned',
    severity: 'Low',
  });

  const profile = await expectStatus('User profile/profile picture', 'GET /api/user/profile returns current admin profile', 'GET', '/api/user/profile', {}, [200]);
  state.adminUserId = profile.json?.data?.profile?.userId || adminLogin.user?.userId || '';
  assertCheck('User profile/profile picture', 'Profile response includes userId and role', Boolean(state.adminUserId && profile.json?.data?.profile?.role), {
    endpoint: 'GET /api/user/profile',
    expected: 'profile.userId and profile.role present',
    actual: JSON.stringify(profile.json?.data?.profile || {}),
    severity: 'High',
    smokeGap: false,
  });

  const staffEmail = `workflow-audit-staff-${SUFFIX}@test.local`;
  const staffOriginalPassword = `AuditOriginal123!${SUFFIX}`;
  const staffChangedPassword = `AuditChanged123!${SUFFIX}`;

  const invalidRole = await expectStatus('Members', 'POST /api/members rejects unsupported role', 'POST', '/api/members', {
    body: { firstName: 'Invalid', lastName: 'Role', email: `invalid-role-${SUFFIX}@test.local`, password: staffOriginalPassword, role: 'viewer' },
  }, [400]);
  assertCheck('Members', 'Unsupported member role does not create a user', invalidRole.status === 400, {
    endpoint: 'POST /api/members',
    expected: 'HTTP 400',
    actual: `HTTP ${invalidRole.status}`,
    severity: 'High',
  });

  const created = await expectStatus('Members', 'POST /api/members creates staff fixture', 'POST', '/api/members', {
    body: { firstName: 'Workflow', lastName: 'Audit', email: staffEmail, phone: '+2348000000300', password: staffOriginalPassword, role: 'staff', job: 'Audit Fixture' },
  }, [201]);
  state.staffId = remember('members', created.json?.data?.user?.userId || '');
  assertCheck('Members', 'Created member response includes userId', Boolean(state.staffId), {
    endpoint: 'POST /api/members',
    expected: 'data.user.userId present',
    actual: JSON.stringify(created.json?.data || {}),
    severity: 'High',
  });

  await expectStatus('Members', 'POST /api/members rejects duplicate email', 'POST', '/api/members', {
    body: { firstName: 'Workflow', lastName: 'Audit', email: staffEmail, phone: '+2348000000300', password: staffOriginalPassword, role: 'staff' },
  }, [409]);
  await expectStatus('Members', 'PATCH /api/members/:id updates staff metadata', 'PATCH', `/api/members/${state.staffId}`, {
    body: { job: `Audit Fixture ${SUFFIX}`, status: 'active' },
  }, [200]);

  const staffLogin = await loginAs('Auth/session lifecycle', 'Staff login succeeds before password reset', staffEmail, staffOriginalPassword, '');
  state.staffCookie = staffLogin.cookie;
  await expectStatus('Auth/session lifecycle', 'Staff cookie can read own profile', 'GET', '/api/user/profile', { cookie: state.staffCookie }, [200]);

  await expectStatus('Members', 'PUT /api/members/:id/password changes staff password', 'PUT', `/api/members/${state.staffId}/password`, {
    body: { password: staffChangedPassword },
  }, [200]);
  await expectStatus('Auth/session lifecycle', 'Old staff cookie is invalidated after password reset', 'GET', '/api/user/profile', {
    cookie: state.staffCookie,
  }, [401]);
  await expectStatus('Auth/session lifecycle', 'Old staff password no longer authenticates', 'POST', '/api/auth/login', {
    cookie: '',
    body: { email: staffEmail, password: staffOriginalPassword },
  }, [401]);

  const changedStaffLogin = await loginAs('Auth/session lifecycle', 'New staff password authenticates', staffEmail, staffChangedPassword, '');
  state.staffCookie = changedStaffLogin.cookie;

  const adminOnlyChecks = [
    ['GET', '/api/members', null],
    ['POST', '/api/members', { firstName: 'No', lastName: 'Access', email: `no-access-${SUFFIX}@test.local`, phone: '+2348000000399', password: staffOriginalPassword, role: 'staff' }],
    ['POST', '/api/payments', { clientId: 'no-access-client', projectId: 'no-access-project', amount: 1, date: Date.now() }],
    ['POST', '/api/blog', { title: 'No Access', excerpt: 'No Access', content: 'No Access', category: 'Other', authorId: state.staffId }],
    ['POST', '/api/clients', { fullName: 'No Access', companyName: 'No Access LLC', email: `no-client-${SUFFIX}@test.local`, phone: '+2348000009999' }],
    ['POST', '/api/projects', { name: 'No Access', clientId: 'no-client', deadline: Date.now(), budget: 1 }],
    ['POST', '/api/tasks', { title: 'No Access', assigneeId: state.staffId }],
    ['GET', '/api/leads', null],
    ['GET', '/api/leads/stats', null],
    ['POST', '/api/leads', { firstName: 'No', lastName: 'Access', email: `no-lead-${SUFFIX}@test.local` }],
    ['POST', '/api/health/redis/flush', null],
  ];
  for (const [method, endpoint, body] of adminOnlyChecks) {
    await expectStatus('Auth/session lifecycle', `${method} ${endpoint} rejects staff role`, method, endpoint, {
      cookie: state.staffCookie,
      ...(body ? { body } : {}),
    }, [403]);
  }

  const leadForRole = await expectStatus('Leads/webhooks', 'POST /api/leads creates role-access probe lead', 'POST', '/api/leads', {
    body: { firstName: 'Role', lastName: 'Probe', email: `role-probe-${SUFFIX}@test.local` },
  }, [201]);
  const roleLeadId = remember('leads', leadForRole.json?.data?.lead?.id || '');
  if (roleLeadId && state.staffCookie) {
    await expectStatus('Auth/session lifecycle', 'GET /api/leads/:id rejects staff role', 'GET', `/api/leads/${roleLeadId}`, {
      cookie: state.staffCookie,
    }, [403]);

    const staffPatch = await http('PATCH', `/api/leads/${roleLeadId}`, {
      cookie: state.staffCookie,
      body: { status: 'contacted' },
    });
    if (staffPatch.status === 403) {
      addResult('PASS', 'Auth/session lifecycle', 'PATCH /api/leads/:id rejects staff role', {
        method: 'PATCH',
        endpoint: `/api/leads/${roleLeadId}`,
        httpStatus: staffPatch.status,
        expected: '403',
      });
    } else if (staffPatch.status === 200) {
      warnFinding('Auth/session lifecycle', 'Staff role can update leads', {
        severity: 'High',
        title: 'Lead mutation endpoints are available to staff users',
        endpoint: 'PATCH /api/leads/:leadId',
        expected: 'Lead updates should be admin-only because lead pipeline mutations affect prospect data',
        actual: 'HTTP 200 for staff cookie',
        reproduction: ['Create a staff member', 'Login as staff', 'PATCH /api/leads/:leadId for an existing lead'],
        smokeGap: true,
      });
    } else {
      addResult('FAIL', 'Auth/session lifecycle', 'PATCH /api/leads/:id staff role returned unexpected status', {
        method: 'PATCH',
        endpoint: `/api/leads/${roleLeadId}`,
        httpStatus: staffPatch.status,
        expected: '403',
        actual: staffPatch.json?.message || staffPatch.text,
      });
    }

    const staffDelete = await http('DELETE', `/api/leads/${roleLeadId}`, { cookie: state.staffCookie });
    if (staffDelete.status === 403) {
      addResult('PASS', 'Auth/session lifecycle', 'DELETE /api/leads/:id rejects staff role', {
        method: 'DELETE',
        endpoint: `/api/leads/${roleLeadId}`,
        httpStatus: staffDelete.status,
        expected: '403',
      });
    } else if (staffDelete.status === 200) {
      forget('leads', roleLeadId);
      warnFinding('Auth/session lifecycle', 'Staff role can delete leads', {
        severity: 'High',
        title: 'Lead mutation endpoints are available to staff users',
        endpoint: 'DELETE /api/leads/:leadId',
        expected: 'Lead deletion should be admin-only or explicitly documented as staff-allowed because it destroys prospect data',
        actual: 'HTTP 200 for staff cookie',
        reproduction: ['Create a staff member', 'Login as staff', 'DELETE /api/leads/:leadId for an existing lead'],
        smokeGap: true,
      });
    } else {
      addResult('FAIL', 'Auth/session lifecycle', 'DELETE /api/leads/:id staff role returned unexpected status', {
        method: 'DELETE',
        endpoint: `/api/leads/${roleLeadId}`,
        httpStatus: staffDelete.status,
        expected: '403',
        actual: staffDelete.json?.message || staffDelete.text,
      });
    }
  }

  await cleanupMemberFixture(staffChangedPassword, staffEmail);
  return true;
}

async function cleanupMemberFixture(staffChangedPassword, staffEmail) {
  if (!state.staffId) return;
  await expectStatus('Members', 'DELETE /api/members/:id deletes staff fixture', 'DELETE', `/api/members/${state.staffId}`, {}, [200, 404]);
  forget('members', state.staffId);
  await expectStatus('Members', 'Deleted staff member can no longer login', 'POST', '/api/auth/login', {
    cookie: '',
    body: { email: staffEmail, password: staffChangedPassword },
  }, [401]);
  state.staffId = '';
  state.staffCookie = '';
}

async function runProfilePictureFlow() {
  console.log('\n[USER PROFILE / PROFILE PICTURE]');
  await expectStatus('User profile/profile picture', 'PUT /api/user/profile/picture rejects missing file', 'PUT', '/api/user/profile/picture', {
    multipart: {},
  }, [400]);
  await expectStatus('User profile/profile picture', 'PUT /api/user/profile/picture rejects SVG MIME', 'PUT', '/api/user/profile/picture', {
    multipart: { files: [{ name: 'picture', filename: 'avatar.svg', contentType: 'image/svg+xml', content: Buffer.from('<svg></svg>') }] },
  }, [400]);
  await expectStatus('User profile/profile picture', 'PUT /api/user/profile/picture rejects spoofed JPEG bytes', 'PUT', '/api/user/profile/picture', {
    multipart: { files: [{ name: 'picture', filename: 'avatar.jpg', contentType: 'image/jpeg', content: Buffer.from('not a real jpeg') }] },
  }, [400]);
  await expectStatus('User profile/profile picture', 'PUT /api/user/profile/picture rejects spoofed PNG bytes', 'PUT', '/api/user/profile/picture', {
    multipart: { files: [{ name: 'picture', filename: 'avatar.png', contentType: 'image/png', content: Buffer.from('not a real png') }] },
  }, [400]);

  if (!SHOULD_RUN_CLOUDINARY_UPLOADS) {
    skip('User profile/profile picture', 'Valid profile picture upload skipped', 'Cloudinary uploads require WORKFLOW_AUDIT_ENABLE_CLOUDINARY_UPLOADS=true and configured Cloudinary credentials');
    return;
  }

  const uploaded = await expectStatus('User profile/profile picture', 'PUT /api/user/profile/picture accepts valid PNG upload', 'PUT', '/api/user/profile/picture', {
    multipart: { files: [{ name: 'picture', filename: 'avatar.png', contentType: 'image/png', content: tinyPngBuffer() }] },
  }, [200]);
  const uploadedAvatarUrl = uploaded.json?.data?.profile?.avatarUrl || '';
  assertCheck('User profile/profile picture', 'Profile picture upload returns usable HTTPS avatarUrl', isUsableHttpsUrl(uploadedAvatarUrl), {
    endpoint: 'PUT /api/user/profile/picture',
    expected: 'data.profile.avatarUrl is a usable HTTPS URL',
    actual: uploadedAvatarUrl ? `avatarUrl host=${urlHost(uploadedAvatarUrl)}` : 'avatarUrl missing',
    severity: 'Medium',
  });

  const persisted = await expectStatus('User profile/profile picture', 'GET /api/user/profile persists uploaded avatarUrl', 'GET', '/api/user/profile', {}, [200]);
  const persistedAvatarUrl = persisted.json?.data?.profile?.avatarUrl || '';
  assertCheck('User profile/profile picture', 'DB profile field stores uploaded avatarUrl', persistedAvatarUrl === uploadedAvatarUrl && isUsableHttpsUrl(persistedAvatarUrl), {
    endpoint: 'GET /api/user/profile',
    expected: 'profile.avatarUrl equals upload response avatarUrl and is HTTPS',
    actual: persistedAvatarUrl ? `avatarUrl host=${urlHost(persistedAvatarUrl)}, matchesUpload=${persistedAvatarUrl === uploadedAvatarUrl}` : 'avatarUrl missing',
    severity: 'High',
    smokeGap: false,
  });

  const removed = await expectStatus('User profile/profile picture', 'DELETE /api/user/profile/picture removes uploaded picture without provider error', 'DELETE', '/api/user/profile/picture', {}, [200]);
  const removedAvatarUrl = removed.json?.data?.profile?.avatarUrl;
  assertCheck('User profile/profile picture', 'Profile picture delete response clears avatarUrl', removedAvatarUrl === null, {
    endpoint: 'DELETE /api/user/profile/picture',
    expected: 'data.profile.avatarUrl is null',
    actual: `avatarUrl=${removedAvatarUrl === null ? '<null>' : typeof removedAvatarUrl}`,
    severity: 'High',
    smokeGap: false,
  });

  const afterDelete = await expectStatus('User profile/profile picture', 'GET /api/user/profile after picture delete returns cleared avatarUrl', 'GET', '/api/user/profile', {}, [200]);
  const afterDeleteAvatarUrl = afterDelete.json?.data?.profile?.avatarUrl;
  assertCheck('User profile/profile picture', 'DB profile field clears after picture delete', afterDeleteAvatarUrl === null, {
    endpoint: 'GET /api/user/profile',
    expected: 'profile.avatarUrl is null after DELETE',
    actual: `avatarUrl=${afterDeleteAvatarUrl === null ? '<null>' : typeof afterDeleteAvatarUrl}`,
    severity: 'High',
    smokeGap: false,
  });
}

async function runMediaImagesFlow() {
  console.log('\n[MEDIA IMAGES]');
  await expectStatus('Media images', 'GET /api/media/images/all lists images', 'GET', '/api/media/images/all', {}, [200]);

  if (!SHOULD_RUN_CLOUDINARY_UPLOADS) {
    skip('Media images', 'Valid binary image upload skipped', 'Cloudinary uploads require WORKFLOW_AUDIT_ENABLE_CLOUDINARY_UPLOADS=true and configured Cloudinary credentials');
    return;
  }

  const pngContent = tinyPngBuffer();
  const uploaded = await expectStatus('Media images', 'POST /api/media/images/new accepts valid PNG upload', 'POST', '/api/media/images/new', {
    multipart: { files: [{ name: 'image', filename: `workflow-audit-${SUFFIX}.png`, contentType: 'image/png', content: pngContent }] },
  }, [201]);

  const uploadedImageId = uploaded.json?.data?.id || '';
  if (uploadedImageId) {
    await expectStatus('Media images', 'GET /api/media/images/:imageId returns image redirect', 'GET', `/api/media/images/${uploadedImageId}`, { redirect: 'manual' }, [302]);
    await expectStatus('Media images', 'PUT /api/media/images/:imageId/replace replaces image', 'PUT', `/api/media/images/${uploadedImageId}/replace`, {
      multipart: { files: [{ name: 'image', filename: `workflow-audit-replace-${SUFFIX}.png`, contentType: 'image/png', content: pngContent }] },
    }, [200]);
  }
}

async function runMediaFlow() {
  console.log('\n[MEDIA FILES]');
  await expectStatus('Media files', 'GET /api/media/files lists files', 'GET', '/api/media/files?limit=10', {}, [200]);
  await expectStatus('Media files', 'GET /api/media/files rejects missing auth', 'GET', '/api/media/files', { cookie: '' }, [401]);
  await expectStatus('Media files', 'POST /api/media/files/url rejects missing auth', 'POST', '/api/media/files/url', {
    cookie: '',
    body: { url: 'https://cdn.example.com/file.pdf' },
  }, [401]);
  await expectStatus('Media files', 'POST /api/media/files/url rejects non-HTTPS URL', 'POST', '/api/media/files/url', {
    body: { url: 'http://cdn.example.com/file.pdf', fileName: 'file.pdf' },
  }, [400]);
  await expectStatus('Media files', 'POST /api/media/files/url rejects malformed URL', 'POST', '/api/media/files/url', {
    body: { url: 'not-a-url', fileName: 'file.pdf' },
  }, [400]);
  await expectStatus('Media files', 'GET /api/media/files rejects invalid type filter', 'GET', '/api/media/files?type=unknown', {}, [400]);
  await expectStatus('Media files', 'POST /api/media/files rejects missing upload file', 'POST', '/api/media/files', {
    multipart: {},
  }, [400]);

  const registered = await expectStatus('Media files', 'POST /api/media/files/url registers HTTPS URL', 'POST', '/api/media/files/url', {
    body: {
      url: `https://cdn.example.com/workflow-audit/${SUFFIX}/company-presentation.pdf`,
      fileName: `workflow-audit-${SUFFIX}.pdf`,
      type: 'document',
      mimeType: 'application/pdf',
      sizeBytes: 42,
    },
  }, [201]);
  const fileId = remember('mediaFiles', registered.json?.data?.file?.id || '');
  assertCheck('Media files', 'Registered media response includes id and HTTPS URL', Boolean(fileId && /^https:\/\//.test(registered.json?.data?.url || '')), {
    endpoint: 'POST /api/media/files/url',
    expected: 'data.file.id and HTTPS data.url',
    actual: JSON.stringify(registered.json?.data || {}),
    severity: 'Medium',
  });

  if (fileId) {
    const listed = await expectStatus('Media files', 'GET /api/media/files includes registered file', 'GET', '/api/media/files?type=document&limit=100', {}, [200]);
    assertCheck('Media files', 'Registered media file appears in filtered list', Array.isArray(listed.json?.data?.files) && listed.json.data.files.some((file) => file.id === fileId), {
      endpoint: 'GET /api/media/files?type=document&limit=100',
      expected: `file id ${fileId} in list`,
      actual: JSON.stringify(listed.json?.data?.files || []),
      severity: 'Medium',
    });
    await expectStatus('Media files', 'GET /api/media/files/:id returns registered file', 'GET', `/api/media/files/${fileId}`, {}, [200]);
    await expectStatus('Media files', 'DELETE /api/media/files/:id deletes registered file', 'DELETE', `/api/media/files/${fileId}`, {}, [200]);
    forget('mediaFiles', fileId);
    await expectStatus('Media files', 'GET /api/media/files/:id after delete returns 404', 'GET', `/api/media/files/${fileId}`, {}, [404]);
  }

  if (!SHOULD_RUN_CLOUDINARY_UPLOADS) {
    skip('Media files', 'Valid binary media upload skipped', 'Cloudinary uploads require WORKFLOW_AUDIT_ENABLE_CLOUDINARY_UPLOADS=true and configured Cloudinary credentials');
    return;
  }

  const binaryContent = tinyBinaryBuffer();
  const uploaded = await expectStatus('Media files', 'POST /api/media/files accepts valid binary file upload', 'POST', '/api/media/files', {
    multipart: { files: [{ name: 'file', filename: `workflow-audit-${SUFFIX}.bin`, contentType: 'application/octet-stream', content: binaryContent }] },
  }, [201]);
  const uploadedFile = uploaded.json?.data?.file || {};
  const uploadedFileId = remember('mediaFiles', uploadedFile.id || '');
  const uploadedUrl = uploaded.json?.data?.url || uploadedFile.url || '';
  assertCheck('Media files', 'Binary media upload returns usable HTTPS URL and Cloudinary metadata', Boolean(
    uploadedFileId &&
    isUsableHttpsUrl(uploadedUrl) &&
    uploadedFile.storageProvider === 'cloudinary' &&
    uploadedFile.publicId &&
    uploadedFile.resourceType === 'raw' &&
    uploadedFile.mimeType === 'application/octet-stream' &&
    uploadedFile.type === 'other' &&
    Number(uploadedFile.sizeBytes) === binaryContent.length
  ), {
    endpoint: 'POST /api/media/files',
    expected: 'id, HTTPS URL, cloudinary storage, publicId, raw resourceType, other/application-octet-stream metadata, matching size',
    actual: JSON.stringify({
      idPresent: Boolean(uploadedFileId),
      urlHost: urlHost(uploadedUrl),
      storageProvider: uploadedFile.storageProvider,
      publicIdPresent: Boolean(uploadedFile.publicId),
      resourceType: uploadedFile.resourceType,
      type: uploadedFile.type,
      mimeType: uploadedFile.mimeType,
      sizeBytes: uploadedFile.sizeBytes,
      expectedSizeBytes: binaryContent.length,
      uploadedByPresent: Boolean(uploadedFile.uploadedBy),
    }),
    severity: 'High',
    smokeGap: false,
  });

  if (uploadedFileId) {
    const fetched = await expectStatus('Media files', 'GET /api/media/files/:id returns uploaded binary metadata', 'GET', `/api/media/files/${uploadedFileId}`, {}, [200]);
    const fetchedFile = fetched.json?.data?.file || {};
    const fetchedUrl = fetched.json?.data?.url || fetchedFile.url || '';
    assertCheck('Media files', 'Uploaded binary media metadata is persisted', fetchedFile.id === uploadedFileId && fetchedFile.publicId === uploadedFile.publicId && fetchedFile.resourceType === uploadedFile.resourceType && isUsableHttpsUrl(fetchedUrl), {
      endpoint: `GET /api/media/files/${uploadedFileId}`,
      expected: 'Stored metadata matches upload response and URL remains HTTPS',
      actual: JSON.stringify({
        idMatches: fetchedFile.id === uploadedFileId,
        urlHost: urlHost(fetchedUrl),
        publicIdMatches: fetchedFile.publicId === uploadedFile.publicId,
        resourceType: fetchedFile.resourceType,
        type: fetchedFile.type,
        mimeType: fetchedFile.mimeType,
        storageProvider: fetchedFile.storageProvider,
      }),
      severity: 'High',
      smokeGap: false,
    });

    await expectStatus('Media files', 'DELETE /api/media/files/:id deletes uploaded binary Cloudinary file without provider error', 'DELETE', `/api/media/files/${uploadedFileId}`, {}, [200]);
    forget('mediaFiles', uploadedFileId);
    await expectStatus('Media files', 'GET /api/media/files/:id after binary delete returns 404', 'GET', `/api/media/files/${uploadedFileId}`, {}, [404]);
  }
}

async function runClientProjectTaskFlow() {
  console.log('\n[CLIENTS / PROJECTS / TASKS]');
  await expectStatus('Clients/projects/tasks', 'POST /api/clients rejects empty body', 'POST', '/api/clients', { body: {} }, [400]);
  await expectStatus('Clients/projects/tasks', 'POST /api/clients rejects unknown status enum', 'POST', '/api/clients', {
    body: { fullName: 'Bad Status', companyName: 'Bad Status LLC', email: `bad-status-${SUFFIX}@test.local`, phone: '+2348000000000', status: 'Unknown' },
  }, [400]);
  await expectStatus('Clients/projects/tasks', 'POST /api/clients rejects invalid assigned staff reference', 'POST', '/api/clients', {
    body: { fullName: 'Bad Staff', companyName: 'Bad Staff LLC', email: `bad-staff-${SUFFIX}@test.local`, phone: '+2348000000000', assignedStaffId: `missing-${SUFFIX}` },
  }, [404]);

  const client = await expectStatus('Clients/projects/tasks', 'POST /api/clients creates workflow client', 'POST', '/api/clients', {
    body: {
      fullName: 'Workflow Audit Client',
      companyName: `Workflow Audit Co ${SUFFIX}`,
      email: `workflow-client-${SUFFIX}@test.local`,
      phone: '+2348000000000',
      status: 'Active',
      tags: ['workflow-audit'],
      notes: 'Created by workflow audit',
    },
  }, [201]);
  const clientId = remember('clients', client.json?.data?.client?.id || '');
  assertCheck('Clients/projects/tasks', 'Created client response includes id', Boolean(clientId), {
    endpoint: 'POST /api/clients',
    expected: 'data.client.id present',
    actual: JSON.stringify(client.json?.data || {}),
    severity: 'High',
  });
  if (clientId) {
    const initialClientDetail = await expectStatus('Clients/projects/tasks', 'GET /api/clients/:id returns workflow client detail insights', 'GET', `/api/clients/${clientId}`, {}, [200]);
    assertClientDetailInsights('Clients/projects/tasks', 'Client detail exposes initial activity, notes history, project counts, and quick insights', initialClientDetail.json?.data?.client, {
      endpoint: `GET /api/clients/${clientId}`,
      totalProjects: 0,
      activeProjects: 0,
      noteSubstring: 'Created by workflow audit',
      requireLastActivity: true,
    });
    await expectStatus('Clients/projects/tasks', 'PATCH /api/clients/:id rejects invalid status', 'PATCH', `/api/clients/${clientId}`, { body: { status: 'Unknown' } }, [400]);
  }

  await expectStatus('Clients/projects/tasks', 'GET /api/clients rejects invalid pagination limit', 'GET', '/api/clients?limit=101', {}, [400]);
  await expectStatus('Clients/projects/tasks', 'GET /api/projects rejects invalid pagination limit', 'GET', '/api/projects?limit=0', {}, [400]);
  await expectStatus('Clients/projects/tasks', 'GET /api/tasks rejects invalid pagination limit', 'GET', '/api/tasks?limit=101', {}, [400]);

  await expectStatus('Clients/projects/tasks', 'POST /api/projects rejects invalid client reference', 'POST', '/api/projects', {
    body: { name: 'Bad Client Project', clientId: `missing-client-${SUFFIX}`, deadline: Date.now() + 86400000, budget: 1 },
  }, [404]);
  await expectStatus('Clients/projects/tasks', 'POST /api/projects rejects manual progress', 'POST', '/api/projects', {
    body: { name: 'Manual Progress Project', clientId, deadline: Date.now() + 86400000, budget: 1, progress: 50 },
  }, [400]);
  await expectStatus('Clients/projects/tasks', 'POST /api/projects rejects invalid priority enum', 'POST', '/api/projects', {
    body: { name: 'Bad Priority Project', clientId, deadline: Date.now() + 86400000, budget: 1, priority: 'Mega' },
  }, [400]);
  await expectStatus('Clients/projects/tasks', 'POST /api/projects rejects invalid team member reference', 'POST', '/api/projects', {
    body: { name: 'Bad Team Project', clientId, deadline: Date.now() + 86400000, budget: 1, teamIds: [`missing-user-${SUFFIX}`] },
  }, [404]);

  const project = await expectStatus('Clients/projects/tasks', 'POST /api/projects creates workflow project', 'POST', '/api/projects', {
    body: {
      name: `Workflow Audit Project ${SUFFIX}`,
      clientId,
      description: 'Created by workflow audit',
      deadline: Date.now() + 7 * 86400000,
      budget: 2500,
      priority: 'Medium',
      status: 'Planned',
      teamIds: [],
    },
  }, [201]);
  const projectId = remember('projects', project.json?.data?.project?.id || '');
  assertCheck('Clients/projects/tasks', 'Created project response includes id', Boolean(projectId), {
    endpoint: 'POST /api/projects',
    expected: 'data.project.id present',
    actual: JSON.stringify(project.json?.data || {}),
    severity: 'High',
  });

  if (clientId && projectId) {
    const clientWithProject = await expectStatus('Clients/projects/tasks', 'GET /api/clients/:id includes associated project and dynamic counts', 'GET', `/api/clients/${clientId}`, {}, [200]);
    assertClientDetailInsights('Clients/projects/tasks', 'Client detail exposes associated projects and active/total quick insights', clientWithProject.json?.data?.client, {
      endpoint: `GET /api/clients/${clientId}`,
      projectId,
      totalProjects: 1,
      activeProjects: 1,
      requireLastActivity: true,
    });
  }

  if (clientId) {
    const appendedNote = `Appended workflow audit note ${SUFFIX}`;
    await expectStatus('Clients/projects/tasks', 'PATCH /api/clients/:id appends note history entry', 'PATCH', `/api/clients/${clientId}`, { body: { appendNote: appendedNote } }, [200]);
    const appendedClientDetail = await expectStatus('Clients/projects/tasks', 'GET /api/clients/:id returns appended notes history', 'GET', `/api/clients/${clientId}`, {}, [200]);
    assertClientDetailInsights('Clients/projects/tasks', 'Client detail exposes appended notes history and latest activity', appendedClientDetail.json?.data?.client, {
      endpoint: `GET /api/clients/${clientId}`,
      ...(projectId ? { projectId, totalProjects: 1, activeProjects: 1 } : {}),
      noteSubstring: appendedNote,
      requireLastActivity: true,
    });
  }

  if (projectId) {
    await expectStatus('Clients/projects/tasks', 'POST /api/projects/:id/comments rejects empty comment', 'POST', `/api/projects/${projectId}/comments`, { body: {} }, [400]);
    await expectStatus('Clients/projects/tasks', 'POST /api/projects/:id/comments creates comment', 'POST', `/api/projects/${projectId}/comments`, { body: { comment: 'Workflow audit comment' } }, [204]);
    await expectStatus('Clients/projects/tasks', 'GET /api/projects/:id/comments returns comments', 'GET', `/api/projects/${projectId}/comments`, {}, [200]);
  }

  await expectStatus('Clients/projects/tasks', 'POST /api/tasks rejects empty body', 'POST', '/api/tasks', { body: {} }, [400]);
  await expectStatus('Clients/projects/tasks', 'POST /api/tasks rejects unknown status enum', 'POST', '/api/tasks', {
    body: { title: 'Bad Status Task', assigneeId: state.adminUserId, status: 'Unknown' },
  }, [400]);
  await expectStatus('Clients/projects/tasks', 'POST /api/tasks rejects invalid assignee reference', 'POST', '/api/tasks', {
    body: { title: 'Bad Assignee Task', assigneeId: `missing-user-${SUFFIX}` },
  }, [404]);
  await expectStatus('Clients/projects/tasks', 'POST /api/tasks rejects invalid project reference', 'POST', '/api/tasks', {
    body: { title: 'Bad Project Task', assigneeId: state.adminUserId, projectId: `missing-project-${SUFFIX}` },
  }, [404]);

  const firstTask = await expectStatus('Clients/projects/tasks', 'POST /api/tasks creates linked Todo task', 'POST', '/api/tasks', {
    body: { title: `Workflow audit todo ${SUFFIX}`, assigneeId: state.adminUserId, projectId, dueDate: Date.now() + 86400000, status: 'Todo', priority: 'medium' },
  }, [201]);
  const firstTaskId = remember('tasks', firstTask.json?.data?.task?.id || '');
  const secondTask = await expectStatus('Clients/projects/tasks', 'POST /api/tasks creates linked Done task', 'POST', '/api/tasks', {
    body: { title: `Workflow audit done ${SUFFIX}`, assigneeId: state.adminUserId, projectId, dueDate: Date.now() + 2 * 86400000, status: 'Done', priority: 'medium' },
  }, [201]);
  const secondTaskId = remember('tasks', secondTask.json?.data?.task?.id || '');

  if (projectId && firstTaskId && secondTaskId) {
    const half = await expectStatus('Clients/projects/tasks', 'GET /api/projects/:id shows task-derived half progress', 'GET', `/api/projects/${projectId}`, {}, [200]);
    const halfProject = half.json?.data?.project || {};
    assertCheck('Clients/projects/tasks', 'Project progress derives 1/2 Done tasks as 50% InProgress', halfProject.totalTasks === 2 && halfProject.completedTasks === 1 && Number(halfProject.progress) === 50 && halfProject.status === 'InProgress', {
      endpoint: `GET /api/projects/${projectId}`,
      expected: 'totalTasks=2 completedTasks=1 progress=50 status=InProgress',
      actual: JSON.stringify({ totalTasks: halfProject.totalTasks, completedTasks: halfProject.completedTasks, progress: halfProject.progress, status: halfProject.status }),
      severity: 'High',
      smokeGap: false,
    });
    await expectStatus('Clients/projects/tasks', 'PATCH /api/projects/:id rejects manual progress', 'PATCH', `/api/projects/${projectId}`, { body: { progress: 10 } }, [400]);
    await expectStatus('Clients/projects/tasks', 'PATCH /api/tasks/:id completes remaining task', 'PATCH', `/api/tasks/${firstTaskId}`, { body: { status: 'Done' } }, [200]);
    const full = await expectStatus('Clients/projects/tasks', 'GET /api/projects/:id shows 100% Completed', 'GET', `/api/projects/${projectId}`, {}, [200]);
    const fullProject = full.json?.data?.project || {};
    assertCheck('Clients/projects/tasks', 'Project status auto-completes when all linked tasks are Done', fullProject.totalTasks === 2 && fullProject.completedTasks === 2 && Number(fullProject.progress) === 100 && fullProject.status === 'Completed', {
      endpoint: `GET /api/projects/${projectId}`,
      expected: 'totalTasks=2 completedTasks=2 progress=100 status=Completed',
      actual: JSON.stringify({ totalTasks: fullProject.totalTasks, completedTasks: fullProject.completedTasks, progress: fullProject.progress, status: fullProject.status }),
      severity: 'High',
      smokeGap: false,
    });

    if (SHOULD_RUN_CLOUDINARY_UPLOADS) {
      const fileUploaded = await expectStatus('Clients/projects/tasks', 'POST /api/projects/:projectId/files uploads valid binary', 'POST', `/api/projects/${projectId}/files`, {
        multipart: { files: [{ name: 'file', filename: `project-audit-${SUFFIX}.bin`, contentType: 'application/octet-stream', content: tinyBinaryBuffer() }] },
      }, [201]);
      const projFileId = fileUploaded.json?.data?.file?.id || '';
      
      if (projFileId) {
        const filesList = await expectStatus('Clients/projects/tasks', 'GET /api/projects/:projectId/files lists project files', 'GET', `/api/projects/${projectId}/files`, {}, [200]);
        assertCheck('Clients/projects/tasks', 'Uploaded file appears in project files list', Array.isArray(filesList.json?.data?.files) && filesList.json.data.files.some(f => f.id === projFileId), {
          endpoint: `GET /api/projects/${projectId}/files`,
          expected: `file with id ${projFileId}`,
          actual: JSON.stringify(filesList.json?.data?.files || []),
          severity: 'Medium',
          smokeGap: false,
        });

        await expectStatus('Clients/projects/tasks', 'DELETE /api/projects/:projectId/files/:fileId cleans up project file', 'DELETE', `/api/projects/${projectId}/files/${projFileId}`, {}, [200]);
        
        const filesListAfter = await expectStatus('Clients/projects/tasks', 'GET /api/projects/:projectId/files verifies cleanup', 'GET', `/api/projects/${projectId}/files`, {}, [200]);
        assertCheck('Clients/projects/tasks', 'Deleted file is no longer in project files list', Array.isArray(filesListAfter.json?.data?.files) && !filesListAfter.json.data.files.some(f => f.id === projFileId), {
          endpoint: `GET /api/projects/${projectId}/files after delete`,
          expected: `file id ${projFileId} not present`,
          actual: 'file was still found',
          severity: 'High',
          smokeGap: false,
        });
      }
    } else {
      skip('Clients/projects/tasks', 'Project file upload cycle skipped', 'Cloudinary uploads disabled');
    }

    await expectStatus('Clients/projects/tasks', 'DELETE /api/projects/:id deletes workflow project', 'DELETE', `/api/projects/${projectId}`, {}, [204]);
    forget('projects', projectId);
    await expectStatus('Clients/projects/tasks', 'GET /api/projects/:id after delete returns 404', 'GET', `/api/projects/${projectId}`, {}, [404]);
    const linkedTaskIds = [firstTaskId, secondTaskId].filter(Boolean);
    const linkedTaskLookups = await Promise.all(linkedTaskIds.map((taskId) => http('GET', `/api/tasks/${taskId}`)));
    const statusSummary = linkedTaskLookups.map((response, index) => `${linkedTaskIds[index]}:${response.status}`).join(', ');
    const accessibleTasks = linkedTaskLookups.filter((response) => response.status === 200);

    if (accessibleTasks.length > 0) {
      warnFinding('Clients/projects/tasks', 'Project deletion leaves linked tasks behind', {
        severity: 'High',
        title: 'Deleting a project does not clean up linked tasks',
        endpoint: `DELETE /api/projects/:projectId then GET /api/tasks/:taskId`,
        expected: 'The backend should cascade delete linked tasks with the project so no orphan tasks remain accessible',
        actual: `Linked task lookup statuses: ${statusSummary}`,
        reproduction: ['Create a project', 'Create one or more tasks with projectId set', 'DELETE /api/projects/:projectId', 'GET /api/tasks/:taskId'],
        smokeGap: true,
      });
    } else if (linkedTaskLookups.every((response) => response.status === 404)) {
      addResult('PASS', 'Clients/projects/tasks', 'Project deletion cascades linked task fixtures', { method: 'GET', endpoint: '/api/tasks/:taskId after project delete', httpStatus: '404', expected: 'all 404', actual: statusSummary });
      linkedTaskIds.forEach((taskId) => forget('tasks', taskId));
    } else {
      addResult('FAIL', 'Clients/projects/tasks', 'Task lookup after project deletion returned unexpected status', { method: 'GET', endpoint: '/api/tasks/:taskId after project delete', httpStatus: statusSummary, expected: 'all 404', actual: statusSummary });
    }
  }

  for (const taskId of [firstTaskId, secondTaskId].filter(Boolean)) {
    await expectStatus('Clients/projects/tasks', 'DELETE /api/tasks/:id cleanup', 'DELETE', `/api/tasks/${taskId}`, {}, [200, 404]);
    forget('tasks', taskId);
  }
  if (clientId) {
    await expectStatus('Clients/projects/tasks', 'DELETE /api/clients/:id deletes workflow client', 'DELETE', `/api/clients/${clientId}`, {}, [200]);
    forget('clients', clientId);
    await expectStatus('Clients/projects/tasks', 'GET /api/clients/:id after delete returns 404', 'GET', `/api/clients/${clientId}`, {}, [404]);
  }
}

async function runNotificationApiFlow() {
  console.log('\n[NOTIFICATIONS]');
  const initial = await expectStatus('Notifications', 'GET /api/notifications lists current user notifications', 'GET', '/api/notifications?limit=20', {}, [200]);
  assertCheck('Notifications', 'Notification list response includes collection metadata', Array.isArray(initial.json?.data?.notifications) && typeof initial.json?.data?.unreadCount === 'number' && typeof initial.json?.data?.totalCount === 'number', {
    endpoint: 'GET /api/notifications?limit=20',
    expected: 'data.notifications array plus unreadCount and totalCount numbers',
    actual: JSON.stringify(initial.json?.data || {}),
    severity: 'High',
    smokeGap: false,
  });

  if (!state.adminUserId) {
    skip('Notifications', 'Assignment-triggered notification flow skipped', 'Admin userId was not available');
  } else {
    const task = await expectStatus('Notifications', 'POST /api/tasks creates assignment notification fixture', 'POST', '/api/tasks', {
      body: { title: `Notification audit assignment ${SUFFIX}`, assigneeId: state.adminUserId, dueDate: Date.now() + 86400000, status: 'Todo', priority: 'medium' },
    }, [201]);
    const taskId = remember('tasks', task.json?.data?.task?.id || '');

    if (taskId) {
      await sleep(75);
      const unread = await expectStatus('Notifications', 'GET /api/notifications unread list includes assignment notification', 'GET', '/api/notifications?unreadOnly=true&limit=50', {}, [200]);
      const notifications = Array.isArray(unread.json?.data?.notifications) ? unread.json.data.notifications : [];
      const assignmentNotification = notifications.find((notification) => notification?.referenceId === taskId);
      assertCheck('Notifications', 'Task assignment creates unread TASK_ASSIGNMENT notification for assignee', Boolean(assignmentNotification && assignmentNotification.type === 'TASK_ASSIGNMENT' && assignmentNotification.isRead === false), {
        endpoint: 'POST /api/tasks then GET /api/notifications?unreadOnly=true',
        expected: `Unread TASK_ASSIGNMENT notification with referenceId=${taskId}`,
        actual: JSON.stringify(notifications.slice(0, 5)),
        severity: 'Critical',
        smokeGap: false,
      });

      if (assignmentNotification?.id) {
        const readOne = await expectStatus('Notifications', 'PUT /api/notifications/:id/read marks assignment notification read', 'PUT', `/api/notifications/${assignmentNotification.id}/read`, {}, [200]);
        assertCheck('Notifications', 'Single notification read response returns read notification', readOne.json?.data?.notification?.id === assignmentNotification.id && readOne.json?.data?.notification?.isRead === true, {
          endpoint: 'PUT /api/notifications/:id/read',
          expected: 'data.notification.id matches and isRead=true',
          actual: JSON.stringify(readOne.json?.data?.notification || {}),
          severity: 'High',
          smokeGap: false,
        });
      }
    } else {
      skip('Notifications', 'Assignment-triggered notification flow skipped', 'Task fixture did not return an id');
    }
  }

  // ── Per-user preferences (admin) ──
  const preferences = await expectStatus('Notifications', 'GET /api/notifications/preferences returns resolved user preference toggles', 'GET', '/api/notifications/preferences', {}, [200]);
  function hasNestedPrefs(prefs) {
    return prefs && typeof prefs === 'object'
      && typeof prefs.TASK_ASSIGNMENT === 'object'
      && 'inApp' in prefs.TASK_ASSIGNMENT
      && 'email' in prefs.TASK_ASSIGNMENT;
  }
  assertCheck('Notifications', 'Per-user preference response includes nested inApp/email toggles', preferences.json?.data?.preferences && hasNestedPrefs(preferences.json.data.preferences), {
    endpoint: 'GET /api/notifications/preferences',
    expected: 'data.preferences includes { inApp: boolean, email: boolean } for known notification types',
    actual: JSON.stringify(preferences.json?.data || {}),
    severity: 'High',
    smokeGap: false,
  });
  const originalTaskAssignmentPref = preferences.json?.data?.preferences?.TASK_ASSIGNMENT || { inApp: true, email: true };
  const disabledPreference = await expectStatus('Notifications', 'PUT /api/notifications/preferences disables TASK_ASSIGNMENT email for current user', 'PUT', '/api/notifications/preferences', {
    body: { TASK_ASSIGNMENT: { inApp: true, email: false } },
  }, [200]);
  assertCheck('Notifications', 'Per-user preference update accepts partial type toggles', disabledPreference.json?.data?.preferences?.TASK_ASSIGNMENT?.email === false && typeof disabledPreference.json?.data?.preferences?.TASK_ASSIGNMENT?.inApp === 'boolean', {
    endpoint: 'PUT /api/notifications/preferences',
    expected: 'TASK_ASSIGNMENT.email=false for user and unspecified types remain present',
    actual: JSON.stringify(disabledPreference.json?.data || {}),
    severity: 'High',
    smokeGap: false,
  });
  await expectStatus('Notifications', 'PUT /api/notifications/preferences restores user TASK_ASSIGNMENT preference', 'PUT', '/api/notifications/preferences', {
    body: { TASK_ASSIGNMENT: originalTaskAssignmentPref },
  }, [200]);
  if (originalTaskAssignmentPref !== undefined) {
    await expectStatus('Notifications', 'PUT /api/notifications/preferences restores user TASK_ASSIGNMENT preference', 'PUT', '/api/notifications/preferences', {
      body: { TASK_ASSIGNMENT: originalTaskAssignmentPref },
    }, [200]);
  }

  // ── Staff user: per-user accessible ──
  if (state.staffCookie) {
    const staffPrefs = await expectStatus('Notifications', 'GET /api/notifications/preferences returns resolved preferences for staff user', 'GET', '/api/notifications/preferences', { cookie: state.staffCookie }, [200]);
    assertCheck('Notifications', 'Staff user can read own resolved preferences', staffPrefs.json?.data?.preferences && typeof staffPrefs.json.data.preferences.TASK_ASSIGNMENT === 'boolean', {
      endpoint: 'GET /api/notifications/preferences (staff)',
      expected: 'data.preferences includes resolved boolean toggles',
      actual: JSON.stringify(staffPrefs.json?.data || {}),
      severity: 'High',
      smokeGap: false,
    });

  } else {
    skip('Notifications', 'Staff per-user preference checks skipped', 'Staff cookie was not available');
  }

  const readAll = await expectStatus('Notifications', 'PUT /api/notifications/read-all marks all current user notifications read', 'PUT', '/api/notifications/read-all', {}, [200]);
  assertCheck('Notifications', 'Mark-all response includes modifiedCount', typeof readAll.json?.data?.modifiedCount === 'number', {
    endpoint: 'PUT /api/notifications/read-all',
    expected: 'data.modifiedCount number',
    actual: JSON.stringify(readAll.json?.data || {}),
    severity: 'Medium',
    smokeGap: false,
  });
  const afterReadAll = await expectStatus('Notifications', 'GET /api/notifications unread list is empty after read-all', 'GET', '/api/notifications?unreadOnly=true&limit=20', {}, [200]);
  assertCheck('Notifications', 'Read-all clears unread notifications for current user', Array.isArray(afterReadAll.json?.data?.notifications) && afterReadAll.json.data.notifications.length === 0 && afterReadAll.json?.data?.unreadCount === 0, {
    endpoint: 'PUT /api/notifications/read-all then GET /api/notifications?unreadOnly=true',
    expected: 'No unread notifications remain for current user',
    actual: JSON.stringify(afterReadAll.json?.data || {}),
    severity: 'High',
    smokeGap: false,
  });
}

async function runBlogEmbedTrackingFlow() {
  console.log('\n[BLOG / EMBED / TRACKING]');
  if (!state.adminUserId) {
    skip('Blog/embed/tracking', 'Blog flow skipped', 'Admin userId was not available');
    return;
  }

  await expectStatus('Blog/embed/tracking', 'GET /api/blog rejects missing auth', 'GET', '/api/blog', { cookie: '' }, [401]);
  await expectStatus('Blog/embed/tracking', 'GET /api/blog rejects invalid status filter', 'GET', '/api/blog?status=invalid', {}, [400]);

  const title = `Workflow Audit Blog ${SUFFIX}`;
  const expectedSlug = toSlug(title);
  const created = await expectStatus('Blog/embed/tracking', 'POST /api/blog creates published post', 'POST', '/api/blog', {
    body: {
      id: `client-supplied-id-${SUFFIX}`,
      slug: `client-supplied-slug-${SUFFIX}`,
      createdAt: 1,
      updatedAt: 1,
      views: 999,
      title,
      excerpt: 'Workflow audit excerpt',
      content: 'This is a workflow audit post. [Unsafe link](javascript:alert(1)) should not render as a clickable link.',
      category: 'Marketing',
      authorId: state.adminUserId,
      tags: ['workflow-audit'],
      status: 'published',
    },
  }, [201]);
  const post = created.json?.data?.post || {};
  const postId = remember('blogPosts', post.id || '');
  let slug = post.slug || expectedSlug;
  assertCheck('Blog/embed/tracking', 'Blog slug is server-generated from title', post.slug === expectedSlug && post.slug !== `client-supplied-slug-${SUFFIX}`, {
    endpoint: 'POST /api/blog',
    expected: `slug=${expectedSlug}`,
    actual: `slug=${post.slug}`,
    severity: 'High',
    smokeGap: true,
  });
  assertCheck('Blog/embed/tracking', 'Blog protected create fields are ignored', post.id !== `client-supplied-id-${SUFFIX}` && post.views === 0 && post.createdAt !== 1 && post.updatedAt !== 1, {
    endpoint: 'POST /api/blog',
    expected: 'Client-supplied id/views/createdAt/updatedAt ignored',
    actual: JSON.stringify({ id: post.id, views: post.views, createdAt: post.createdAt, updatedAt: post.updatedAt }),
    severity: 'High',
    smokeGap: true,
  });

  await expectStatus('Blog/embed/tracking', 'POST /api/blog rejects duplicate generated slug', 'POST', '/api/blog', {
    body: { title, excerpt: 'Duplicate', content: 'Duplicate', category: 'Marketing', authorId: state.adminUserId, status: 'published' },
  }, [409]);

  const draft = await expectStatus('Blog/embed/tracking', 'POST /api/blog creates draft post', 'POST', '/api/blog', {
    body: { title: `Workflow Audit Draft ${SUFFIX}`, excerpt: 'Draft excerpt', content: 'Draft content', category: 'Other', authorId: state.adminUserId, status: 'draft' },
  }, [201]);
  const draftPost = draft.json?.data?.post || {};
  const draftId = remember('blogPosts', draftPost.id || '');
  if (draftPost.slug) {
    await expectStatus('Blog/embed/tracking', 'GET /embed/:slug returns 404 for draft post', 'GET', `/embed/${draftPost.slug}`, { cookie: '' }, [404]);
  }
  if (draftId) {
    await expectStatus('Blog/embed/tracking', 'DELETE /api/blog/:id deletes draft fixture', 'DELETE', `/api/blog/${draftId}`, {}, [200]);
    forget('blogPosts', draftId);
  }

  if (postId) {
    const emptyUpdate = await expectStatus('Blog/embed/tracking', 'PUT /api/blog/:id accepts empty update without mutation', 'PUT', `/api/blog/${postId}`, { body: {} }, [200]);
    assertCheck('Blog/embed/tracking', 'Empty blog update preserves updatedAt', emptyUpdate.json?.data?.post?.updatedAt === post.updatedAt, {
      endpoint: `PUT /api/blog/${postId}`,
      expected: 'updatedAt unchanged on empty update',
      actual: JSON.stringify({ before: post.updatedAt, after: emptyUpdate.json?.data?.post?.updatedAt }),
      severity: 'Low',
      smokeGap: true,
    });

    const protectedUpdate = await expectStatus('Blog/embed/tracking', 'PUT /api/blog/:id ignores protected fields', 'PUT', `/api/blog/${postId}`, {
      body: { views: 777, createdAt: 2, slug: `manual-${SUFFIX}` },
    }, [200]);
    assertCheck('Blog/embed/tracking', 'Protected blog fields remain unchanged after update', protectedUpdate.json?.data?.post?.views === 0 && protectedUpdate.json?.data?.post?.createdAt === post.createdAt && protectedUpdate.json?.data?.post?.slug === slug, {
      endpoint: `PUT /api/blog/${postId}`,
      expected: 'views/createdAt/slug unchanged',
      actual: JSON.stringify({ views: protectedUpdate.json?.data?.post?.views, createdAt: protectedUpdate.json?.data?.post?.createdAt, slug: protectedUpdate.json?.data?.post?.slug }),
      severity: 'High',
      smokeGap: true,
    });

    const updatedTitle = `Workflow Audit Blog Updated ${SUFFIX}`;
    const updated = await expectStatus('Blog/embed/tracking', 'PUT /api/blog/:id updates title and slug', 'PUT', `/api/blog/${postId}`, {
      body: { title: updatedTitle, excerpt: 'Updated excerpt' },
    }, [200]);
    slug = updated.json?.data?.post?.slug || slug;
    assertCheck('Blog/embed/tracking', 'Blog update regenerates slug from new title', slug === toSlug(updatedTitle), {
      endpoint: `PUT /api/blog/${postId}`,
      expected: `slug=${toSlug(updatedTitle)}`,
      actual: `slug=${slug}`,
      severity: 'Medium',
      smokeGap: true,
    });

    const embed = await expectStatus('Blog/embed/tracking', 'GET /embed/:slug serves published embed', 'GET', `/embed/${slug}`, { cookie: '' }, [200]);
    assertCheck('Blog/embed/tracking', 'Embed response blocks unsafe javascript link rendering', !/href=["']javascript:/i.test(embed.text || ''), {
      endpoint: `GET /embed/${slug}`,
      expected: 'No href="javascript:..." in rendered embed HTML',
      actual: /href=["']javascript:/i.test(embed.text || '') ? 'Unsafe href found' : 'No unsafe href found',
      severity: 'Critical',
      smokeGap: true,
    });
    const tokenMatch = String(embed.text || '').match(/token:\s*"([^"]+)"/);
    const trackingToken = tokenMatch?.[1] || '';
    assertCheck('Blog/embed/tracking', 'Embed includes a tracking token', Boolean(trackingToken), {
      endpoint: `GET /embed/${slug}`,
      expected: 'Tracking token embedded in page script',
      actual: trackingToken ? '<token present>' : '<missing>',
      severity: 'Medium',
      smokeGap: true,
    });

    const beforeTrack = await expectStatus('Blog/embed/tracking', 'GET /api/blog/:id before tracking replay test', 'GET', `/api/blog/${postId}`, {}, [200]);
    const beforeViews = Number(beforeTrack.json?.data?.post?.views || 0);
    if (trackingToken) {
      await expectStatus('Blog/embed/tracking', 'POST /api/blog/track/:slug accepts fresh token', 'POST', `/api/blog/track/${slug}`, {
        cookie: '',
        body: { token: trackingToken },
      }, [200]);
      await sleep(50);
      const afterFirst = await expectStatus('Blog/embed/tracking', 'GET /api/blog/:id after first tracking token use', 'GET', `/api/blog/${postId}`, {}, [200]);
      const afterFirstViews = Number(afterFirst.json?.data?.post?.views || 0);
      assertCheck('Blog/embed/tracking', 'Fresh tracking token increments views once', afterFirstViews === beforeViews + 1, {
        endpoint: `POST /api/blog/track/${slug}`,
        expected: `views ${beforeViews + 1}`,
        actual: `views ${afterFirstViews}`,
        severity: 'Medium',
        smokeGap: true,
      });
      await expectStatus('Blog/embed/tracking', 'POST /api/blog/track/:slug accepts replay without increment', 'POST', `/api/blog/track/${slug}`, {
        cookie: '',
        body: { token: trackingToken },
      }, [200]);
      await sleep(50);
      const afterReplay = await expectStatus('Blog/embed/tracking', 'GET /api/blog/:id after replayed tracking token', 'GET', `/api/blog/${postId}`, {}, [200]);
      const afterReplayViews = Number(afterReplay.json?.data?.post?.views || 0);
      assertCheck('Blog/embed/tracking', 'Replayed tracking token does not increment views again', afterReplayViews === afterFirstViews, {
        endpoint: `POST /api/blog/track/${slug}`,
        expected: `views remain ${afterFirstViews}`,
        actual: `views ${afterReplayViews}`,
        severity: 'High',
        smokeGap: true,
      });
    }

    await expectStatus('Blog/embed/tracking', 'POST /api/blog/track/:slug rejects invalid slug shape', 'POST', '/api/blog/track/bad%3Cscript%3E', {
      cookie: '',
      body: { token: 'invalid' },
    }, [400]);

    await expectStatus('Blog/embed/tracking', 'DELETE /api/blog/:id deletes published fixture', 'DELETE', `/api/blog/${postId}`, {}, [200]);
    forget('blogPosts', postId);
    await expectStatus('Blog/embed/tracking', 'GET /api/blog/:id after delete returns 404', 'GET', `/api/blog/${postId}`, {}, [404]);
    await expectStatus('Blog/embed/tracking', 'GET /embed/:slug after delete returns 404', 'GET', `/embed/${slug}`, { cookie: '' }, [404]);
  }
}

async function runLeadsAndWebhooksFlow() {
  console.log('\n[LEADS / WEBHOOKS]');
  await expectStatus('Leads/webhooks', 'GET /api/leads rejects missing auth', 'GET', '/api/leads', { cookie: '' }, [401]);
  await expectStatus('Leads/webhooks', 'GET /api/leads supports special-character search safely', 'GET', '/api/leads?search=.*%5B%5D&limit=10', {}, [200]);

  const invalidLimit = await http('GET', '/api/leads?limit=0');
  if (invalidLimit.status === 400) {
    addResult('PASS', 'Leads/webhooks', 'GET /api/leads rejects invalid pagination limit', { method: 'GET', endpoint: '/api/leads?limit=0', httpStatus: 400, expected: '400' });
  } else if (invalidLimit.status === 200) {
    warnFinding('Leads/webhooks', 'GET /api/leads silently normalizes invalid pagination limit', {
      severity: 'Low',
      title: 'Lead list accepts limit=0 instead of rejecting invalid pagination',
      endpoint: 'GET /api/leads?limit=0',
      expected: 'HTTP 400 validation error for invalid pagination',
      actual: 'HTTP 200 with normalized pagination',
      reproduction: ['GET /api/leads?limit=0 with an authenticated cookie'],
      smokeGap: true,
    });
  } else {
    addResult('FAIL', 'Leads/webhooks', 'GET /api/leads invalid pagination returned unexpected status', { method: 'GET', endpoint: '/api/leads?limit=0', httpStatus: invalidLimit.status, expected: '400 or 200', actual: invalidLimit.json?.message || invalidLimit.text });
  }

  await expectStatus('Leads/webhooks', 'POST /api/leads rejects invalid email', 'POST', '/api/leads', {
    body: { firstName: 'Bad', lastName: 'Email', email: 'not-an-email' },
  }, [400]);
  const created = await expectStatus('Leads/webhooks', 'POST /api/leads creates lead', 'POST', '/api/leads', {
    body: { firstName: 'Workflow', lastName: 'Lead', email: `workflow-lead-${SUFFIX}@test.local`, phone: '+2348000000001', company: 'Workflow Leads' },
  }, [201]);
  const leadId = remember('leads', created.json?.data?.lead?.id || '');
  if (leadId) {
    await expectStatus('Leads/webhooks', 'GET /api/leads/:id returns lead', 'GET', `/api/leads/${leadId}`, {}, [200]);
    await expectStatus('Leads/webhooks', 'PATCH /api/leads/:id rejects unknown status', 'PATCH', `/api/leads/${leadId}`, { body: { status: 'unknown' } }, [400]);
    await expectStatus('Leads/webhooks', 'PATCH /api/leads/:id updates status', 'PATCH', `/api/leads/${leadId}`, { body: { status: 'contacted' } }, [200]);
    await expectStatus('Leads/webhooks', 'DELETE /api/leads/:id deletes lead', 'DELETE', `/api/leads/${leadId}`, {}, [200]);
    forget('leads', leadId);
    await expectStatus('Leads/webhooks', 'GET /api/leads/:id after delete returns 404', 'GET', `/api/leads/${leadId}`, {}, [404]);
  }

  await expectStatus('Leads/webhooks', 'POST /api/webhooks/leads/qualified rejects missing bearer token', 'POST', '/api/webhooks/leads/qualified', {
    cookie: '',
    body: { name: 'No Token', email: `no-token-${SUFFIX}@test.local` },
  }, [401]);
  await expectStatus('Leads/webhooks', 'POST /api/webhooks/leads/qualified rejects wrong bearer token', 'POST', '/api/webhooks/leads/qualified', {
    cookie: '',
    headers: { Authorization: 'Bearer definitely-wrong-token' },
    body: { name: 'Bad Token', email: `bad-token-${SUFFIX}@test.local` },
  }, [401]);

  if (!WEBHOOK_TOKEN) {
    skip('Leads/webhooks', 'Valid webhook payload tests skipped', 'WEBHOOK_BEARER_TOKEN is not configured in the audit environment');
    return;
  }

  await expectStatus('Leads/webhooks', 'POST /api/webhooks/leads/qualified rejects invalid payload', 'POST', '/api/webhooks/leads/qualified', {
    cookie: '',
    headers: { Authorization: 'Bearer <redacted-placeholder>'.replace('<redacted-placeholder>', WEBHOOK_TOKEN) },
    body: { email: 'invalid' },
  }, [400]);
  await expectStatus('Leads/webhooks', 'POST /api/webhooks/leads/qualified accepts valid payload', 'POST', '/api/webhooks/leads/qualified', {
    cookie: '',
    headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    body: { form_type: 'quote_request', name: 'Qualified Webhook', email: `qualified-webhook-${SUFFIX}@test.local`, phone: '+2348000000002', service: 'SEO', budget: '$1k', details: 'Workflow audit' },
  }, [201]);
  await expectStatus('Leads/webhooks', 'POST /api/webhooks/leads/general accepts valid payload', 'POST', '/api/webhooks/leads/general', {
    cookie: '',
    headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    body: { name: 'General Webhook', email: `general-webhook-${SUFFIX}@test.local`, phone: '+2348000000003', business: 'Webhook Co', service: 'Strategy', challenge: 'None', budget: '$2k' },
  }, [201]);
}

async function runPaymentsRevenueAnalyticsDashboardFlow() {
  console.log('\n[PAYMENTS / REVENUE / ANALYTICS / DASHBOARD]');
  const beforeClientStats = await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/clients/stats baseline', 'GET', '/api/clients/stats', {}, [200]);
  const beforeDashboardMetrics = await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/dashboard/metrics baseline', 'GET', '/api/dashboard/metrics', {}, [200]);
  assertCheck('Payments/revenue/analytics/dashboard', 'Dashboard totalClients matches client stats baseline', beforeDashboardMetrics.json?.data?.totalClients?.value === beforeClientStats.json?.data?.totalClients, {
    endpoint: 'GET /api/dashboard/metrics and GET /api/clients/stats',
    expected: 'dashboard.totalClients.value === clientStats.totalClients',
    actual: JSON.stringify({ dashboard: beforeDashboardMetrics.json?.data?.totalClients?.value, clientStats: beforeClientStats.json?.data?.totalClients }),
    severity: 'Medium',
    smokeGap: true,
  });
  assertDashboardTotalLeadTaskMetrics(
    'Payments/revenue/analytics/dashboard',
    'Dashboard metrics expose Total Leads/Total Tasks and omit obsolete names',
    beforeDashboardMetrics.json?.data,
  );

  await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments rejects empty body', 'POST', '/api/payments', { body: {} }, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments rejects legacy name/alias fields', 'POST', '/api/payments', {
    body: { clientName: 'Invalid', projectName: 'Invalid', project: 'Invalid Alias', amount: 1, date: Date.now() },
  }, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments rejects negative amount', 'POST', '/api/payments', {
    body: { clientId: 'placeholder-client', projectId: 'placeholder-project', amount: -1, date: Date.now() },
  }, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments rejects invalid status enum', 'POST', '/api/payments', {
    body: { clientId: 'placeholder-client', projectId: 'placeholder-project', amount: 1, status: 'Unknown', date: Date.now() },
  }, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments rejects invalid date', 'POST', '/api/payments', {
    body: { clientId: 'placeholder-client', projectId: 'placeholder-project', amount: 1, date: 'not-a-date' },
  }, [400]);

  const client = await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/clients creates payment client fixture', 'POST', '/api/clients', {
    body: { fullName: 'Payment Audit Client', companyName: `Payment Audit Co ${SUFFIX}`, email: `payment-client-${SUFFIX}@test.local`, phone: '+2348000000100', status: 'Active', tags: ['workflow-audit'] },
  }, [201]);
  const clientId = remember('clients', client.json?.data?.client?.id || '');

  const project = await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/projects creates payment project fixture', 'POST', '/api/projects', {
    body: { name: `Payment Audit Project ${SUFFIX}`, clientId, description: 'Payment workflow project', deadline: Date.now() + 86400000, budget: 5000, priority: 'High', status: 'Planned', teamIds: [] },
  }, [201]);
  const projectId = remember('projects', project.json?.data?.project?.id || '');

  await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments rejects invalid client reference', 'POST', '/api/payments', {
    body: { clientId: `missing-client-${SUFFIX}`, projectId, amount: 1, date: Date.now() },
  }, [404]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments rejects invalid project reference', 'POST', '/api/payments', {
    body: { clientId, projectId: `missing-project-${SUFFIX}`, amount: 1, date: Date.now() },
  }, [404]);

  const mismatchClient = await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/clients creates payment mismatch fixture', 'POST', '/api/clients', {
    body: { fullName: 'Payment Mismatch Client', companyName: `Payment Mismatch Co ${SUFFIX}`, email: `payment-mismatch-${SUFFIX}@test.local`, phone: '+2348000000101', status: 'Active', tags: ['workflow-audit'] },
  }, [201]);
  const mismatchClientId = remember('clients', mismatchClient.json?.data?.client?.id || '');
  if (mismatchClientId) {
    await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments rejects project/client mismatch', 'POST', '/api/payments', {
      body: { clientId: mismatchClientId, projectId, amount: 1, date: Date.now() },
    }, [409]);
  }

  const amount = 1234.56;
  const idOnlyPayment = await http('POST', '/api/payments', {
    body: { clientId, projectId, amount, status: 'Paid', date: Date.now(), source: 'Workflow Audit', notes: 'ID-only enrichment probe' },
  });
  if (idOnlyPayment.status === 201) {
    addResult('PASS', 'Payments/revenue/analytics/dashboard', 'POST /api/payments accepts clientId/projectId-only references', {
      method: 'POST',
      endpoint: '/api/payments',
      httpStatus: idOnlyPayment.status,
      expected: '201',
      durationMs: idOnlyPayment.durationMs,
    });
    remember('payments', idOnlyPayment.json?.data?.payment?.id || '');
    assertCheck('Payments/revenue/analytics/dashboard', 'Payment create response remains ID-only', Boolean(
      idOnlyPayment.json?.data?.payment?.clientId === clientId
      && idOnlyPayment.json?.data?.payment?.projectId === projectId
      && !Object.prototype.hasOwnProperty.call(idOnlyPayment.json?.data?.payment || {}, 'clientName')
      && !Object.prototype.hasOwnProperty.call(idOnlyPayment.json?.data?.payment || {}, 'projectName')
      && !Object.prototype.hasOwnProperty.call(idOnlyPayment.json?.data?.payment || {}, 'project')
      && !Object.prototype.hasOwnProperty.call(idOnlyPayment.json?.data?.payment || {}, 'client')
    ), {
      endpoint: 'POST /api/payments',
      expected: 'clientId/projectId present without name/alias fields',
      actual: JSON.stringify(idOnlyPayment.json?.data?.payment || {}),
      severity: 'High',
      smokeGap: false,
    });
  } else {
    addResult('FAIL', 'Payments/revenue/analytics/dashboard', 'POST /api/payments ID-only references returned unexpected status', {
      method: 'POST',
      endpoint: '/api/payments',
      httpStatus: idOnlyPayment.status,
      expected: '201',
      actual: idOnlyPayment.json?.message || idOnlyPayment.text,
      durationMs: idOnlyPayment.durationMs,
    });
  }

  const payment = await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments creates paid ID-only payment', 'POST', '/api/payments', {
    body: {
      clientId,
      projectId,
      amount,
      status: 'Paid',
      date: Date.now(),
      source: 'Workflow Audit',
      notes: 'Payment audit fixture',
    },
  }, [201]);
  const paymentId = remember('payments', payment.json?.data?.payment?.id || '');
  if (paymentId) {
    await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/payments supports special-character search safely', 'GET', '/api/payments?search=.*%5B%5D&limit=5', {}, [200]);
    await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/payments filters Paid payments', 'GET', '/api/payments?status=Paid&limit=10', {}, [200]);
    await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/payments/:id returns payment', 'GET', `/api/payments/${paymentId}`, {}, [200]);
    await expectStatus('Payments/revenue/analytics/dashboard', 'PATCH /api/payments/:id rejects clientName', 'PATCH', `/api/payments/${paymentId}`, { body: { clientName: 'Legacy Client' } }, [400]);
    await expectStatus('Payments/revenue/analytics/dashboard', 'PATCH /api/payments/:id rejects projectName', 'PATCH', `/api/payments/${paymentId}`, { body: { projectName: 'Legacy Project' } }, [400]);
    await expectStatus('Payments/revenue/analytics/dashboard', 'PATCH /api/payments/:id rejects project alias', 'PATCH', `/api/payments/${paymentId}`, { body: { project: 'Legacy Project Alias' } }, [400]);
    await expectStatus('Payments/revenue/analytics/dashboard', 'PATCH /api/payments/:id rejects invalid clientId', 'PATCH', `/api/payments/${paymentId}`, { body: { clientId: `missing-client-${SUFFIX}` } }, [404]);
    await expectStatus('Payments/revenue/analytics/dashboard', 'PATCH /api/payments/:id rejects invalid projectId', 'PATCH', `/api/payments/${paymentId}`, { body: { projectId: `missing-project-${SUFFIX}` } }, [404]);
    if (mismatchClientId) {
      await expectStatus('Payments/revenue/analytics/dashboard', 'PATCH /api/payments/:id rejects project/client mismatch', 'PATCH', `/api/payments/${paymentId}`, { body: { clientId: mismatchClientId } }, [409]);
    }
    const patched = await expectStatus('Payments/revenue/analytics/dashboard', 'PATCH /api/payments/:id updates amount', 'PATCH', `/api/payments/${paymentId}`, { body: { amount: 1500 } }, [200]);
    assertCheck('Payments/revenue/analytics/dashboard', 'Payment PATCH persists updated amount', Number(patched.json?.data?.payment?.amount) === 1500, {
      endpoint: `PATCH /api/payments/${paymentId}`,
      expected: 'amount=1500',
      actual: `amount=${patched.json?.data?.payment?.amount}`,
      severity: 'Medium',
      smokeGap: true,
    });
  }

  const doneTask = await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/tasks creates Done task for recognized project', 'POST', '/api/tasks', {
    body: { title: `Revenue recognized task ${SUFFIX}`, assigneeId: state.adminUserId, projectId, status: 'Done', dueDate: Date.now() + 86400000, priority: 'medium' },
  }, [201]);
  const doneTaskId = remember('tasks', doneTask.json?.data?.task?.id || '');
  const recognizedRevenue = 4321;
  await expectStatus('Payments/revenue/analytics/dashboard', 'PATCH /api/projects/:id sets status to Completed', 'PATCH', `/api/projects/${projectId}`, {
    body: { status: 'Completed' },
  }, [200]);

  const recognizedPayment = await expectStatus('Payments/revenue/analytics/dashboard', 'POST /api/payments creates recognized revenue payment', 'POST', `/api/payments`, {
    body: { clientId, projectId, amount: recognizedRevenue, status: 'Paid', date: Date.now() },
  }, [201]);
  const recognizedPaymentId = remember('payments', recognizedPayment.json?.data?.payment?.id || '');

  await sleep(20);
  const revenueDashboard = await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/revenue/dashboard returns recognized revenue dashboard', 'GET', '/api/revenue/dashboard?period=3months', {}, [200]);
  const revenueSummary = await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/revenue returns recognized revenue series', 'GET', '/api/revenue?period=3months', {}, [200]);
  const dashboardTotal = Number(revenueDashboard.json?.data?.summary?.totalRevenue?.value || 0);
  const revenueSeriesTotal = (revenueSummary.json?.data?.revenueSeries || []).reduce((sum, value) => sum + Number(value || 0), 0);
  assertCheck('Payments/revenue/analytics/dashboard', 'Revenue dashboard includes recognized project revenue', dashboardTotal >= recognizedRevenue, {
    endpoint: 'GET /api/revenue/dashboard?period=3months',
    expected: `totalRevenue >= ${recognizedRevenue}`,
    actual: `totalRevenue=${dashboardTotal}`,
    severity: 'High',
    smokeGap: true,
  });
  assertCheck('Payments/revenue/analytics/dashboard', 'Revenue summary series includes recognized project revenue', revenueSeriesTotal >= recognizedRevenue, {
    endpoint: 'GET /api/revenue?period=3months',
    expected: `series total >= ${recognizedRevenue}`,
    actual: `series total=${revenueSeriesTotal}`,
    severity: 'High',
    smokeGap: true,
  });

  const performance = await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/dashboard/performance includes paid payment revenue', 'GET', '/api/dashboard/performance?period=3months', {}, [200]);
  const performanceRevenueTotal = (performance.json?.data?.revenueSeries || []).reduce((sum, value) => sum + Number(value || 0), 0);
  assertCheck('Payments/revenue/analytics/dashboard', 'Dashboard performance revenue includes paid payment', performanceRevenueTotal >= 1500, {
    endpoint: 'GET /api/dashboard/performance?period=3months',
    expected: 'revenueSeries total >= 1500',
    actual: `revenueSeries total=${performanceRevenueTotal}`,
    severity: 'Medium',
    smokeGap: true,
  });

  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/revenue rejects invalid period', 'GET', '/api/revenue?period=bad', {}, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/dashboard/performance rejects invalid period', 'GET', '/api/dashboard/performance?period=bad', {}, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/dashboard/projects/in-progress rejects high limit', 'GET', '/api/dashboard/projects/in-progress?limit=999', {}, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/dashboard/activities rejects high limit', 'GET', '/api/dashboard/activities?limit=999', {}, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/analytics/overview returns overview', 'GET', '/api/analytics/overview', {}, [200]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/analytics/traffic rejects invalid range', 'GET', '/api/analytics/traffic?range=bad', {}, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/analytics/sources returns sources', 'GET', '/api/analytics/sources?range=30d', {}, [200]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/analytics/campaigns rejects invalid sortBy', 'GET', '/api/analytics/campaigns?sortBy=bad', {}, [400]);
  await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/analytics/distribution returns distribution', 'GET', '/api/analytics/distribution', {}, [200]);

  if (paymentId) {
    await expectStatus('Payments/revenue/analytics/dashboard', 'DELETE /api/payments/:id deletes payment', 'DELETE', `/api/payments/${paymentId}`, {}, [200]);
    forget('payments', paymentId);
    await expectStatus('Payments/revenue/analytics/dashboard', 'GET /api/payments/:id after delete returns 404', 'GET', `/api/payments/${paymentId}`, {}, [404]);
  }
  if (recognizedPaymentId) {
    await expectStatus('Payments/revenue/analytics/dashboard', 'DELETE /api/payments/:id deletes recognized payment fixture', 'DELETE', `/api/payments/${recognizedPaymentId}`, {}, [200, 404]);
    forget('payments', recognizedPaymentId);
  }
  if (doneTaskId) {
    await expectStatus('Payments/revenue/analytics/dashboard', 'DELETE /api/tasks/:id deletes revenue task fixture', 'DELETE', `/api/tasks/${doneTaskId}`, {}, [200, 404]);
    forget('tasks', doneTaskId);
  }
  if (projectId) {
    await expectStatus('Payments/revenue/analytics/dashboard', 'DELETE /api/projects/:id deletes revenue project fixture', 'DELETE', `/api/projects/${projectId}`, {}, [204, 404]);
    forget('projects', projectId);
  }
  if (mismatchClientId) {
    await expectStatus('Payments/revenue/analytics/dashboard', 'DELETE /api/clients/:id deletes payment mismatch fixture', 'DELETE', `/api/clients/${mismatchClientId}`, {}, [200, 404]);
    forget('clients', mismatchClientId);
  }
  if (clientId) {
    await expectStatus('Payments/revenue/analytics/dashboard', 'DELETE /api/clients/:id deletes payment client fixture', 'DELETE', `/api/clients/${clientId}`, {}, [200, 404]);
    forget('clients', clientId);
  }
}

async function runModerateStressFlow() {
  console.log('\n[MODERATE STRESS / CONCURRENCY]');
  const stressTargets = [
    { label: '20 concurrent GET /api/health', method: 'GET', endpoint: '/api/health', count: 20, cookie: '' },
    { label: '20 concurrent GET /api/projects', method: 'GET', endpoint: '/api/projects?limit=5', count: 20 },
    { label: '20 concurrent GET /api/tasks', method: 'GET', endpoint: '/api/tasks?limit=5', count: 20 },
    { label: '20 concurrent GET /api/dashboard/metrics', method: 'GET', endpoint: '/api/dashboard/metrics', count: 20 },
    { label: '10 concurrent GET /api/payments', method: 'GET', endpoint: '/api/payments?limit=5', count: 10 },
    { label: '10 concurrent GET /api/blog', method: 'GET', endpoint: '/api/blog?limit=5', count: 10 },
    { label: '10 concurrent GET /api/notifications', method: 'GET', endpoint: '/api/notifications?limit=5', count: 10 },
  ];

  for (const target of stressTargets) {
    const responses = await Promise.all(
      Array.from({ length: target.count }, () => http(target.method, target.endpoint, { cookie: Object.prototype.hasOwnProperty.call(target, 'cookie') ? target.cookie : state.adminCookie })),
    );
    const statuses = responses.reduce((acc, response) => {
      acc[response.status] = (acc[response.status] || 0) + 1;
      return acc;
    }, {});
    const has5xx = responses.some((response) => response.status >= 500 || response.status === 0);
    const has429 = responses.some((response) => response.status === 429);
    const allExpected = responses.every((response) => response.status === 200);
    const statusSummary = Object.entries(statuses).map(([status, count]) => `${status}:${count}`).join(', ');

    addResult(allExpected ? 'PASS' : 'WARN', 'Stress/concurrency', target.label, {
      method: target.method,
      endpoint: target.endpoint,
      httpStatus: statusSummary,
      expected: 'all 200',
      actual: statusSummary,
      note: allExpected ? '' : statusSummary,
    });

    if (has5xx) {
      addFinding({
        severity: 'Critical',
        area: 'Stress/concurrency',
        title: `${target.label} produced 5xx/connection failures`,
        endpoint: `${target.method} ${target.endpoint}`,
        expected: 'Moderate concurrency should not crash or return 5xx',
        actual: statusSummary,
        reproduction: [`Run ${target.count} concurrent ${target.method} ${target.endpoint} requests against staging`],
        smokeGap: true,
      });
    } else if (has429) {
      addFinding({
        severity: 'Medium',
        area: 'Stress/concurrency',
        title: `${target.label} hit rate limiting during moderate concurrency`,
        endpoint: `${target.method} ${target.endpoint}`,
        expected: 'Moderate 10-20 request burst should be within documented limits or clearly expected',
        actual: statusSummary,
        reproduction: [`Run ${target.count} concurrent ${target.method} ${target.endpoint} requests against staging`],
        smokeGap: true,
      });
    }
  }
}

async function runRedisFlushFlow() {
  console.log('\n[REDIS FLUSH]');
  const flushRes = await expectStatus('Redis flush', 'POST /api/health/redis/flush succeeds', 'POST', '/api/health/redis/flush', {}, [200]);
  assertCheck('Redis flush', 'Redis flush responds with success', flushRes.json?.success === true, {
    endpoint: 'POST /api/health/redis/flush',
    expected: 'success: true',
    actual: `success: ${flushRes.json?.success}`,
    severity: 'Medium',
    smokeGap: false,
  });

  const dashboardRes = await expectStatus('Redis flush', 'GET /api/dashboard/metrics after flush returns valid data', 'GET', '/api/dashboard/metrics', {}, [200]);
  assertCheck('Redis flush', 'Dashboard metrics are refreshed and valid', typeof dashboardRes.json?.data?.totalClients?.value === 'number', {
    endpoint: 'GET /api/dashboard/metrics',
    expected: 'totalClients.value is a number',
    actual: typeof dashboardRes.json?.data?.totalClients?.value,
    severity: 'High',
    smokeGap: false,
  });
  assertDashboardTotalLeadTaskMetrics(
    'Redis flush',
    'Dashboard metrics after flush retain Total Leads/Total Tasks contract',
    dashboardRes.json?.data,
  );
}

async function runLogoutFlow() {
  console.log('\n[LOGOUT / STALE COOKIE]');
  if (!state.adminCookie) return;
  const staleCookie = state.adminCookie;
  await expectStatus('Auth/session lifecycle', 'POST /api/auth/logout logs out admin', 'POST', '/api/auth/logout', {}, [200]);
  state.adminCookie = '';
  await expectStatus('Auth/session lifecycle', 'GET /api/user/profile rejects stale admin cookie after logout', 'GET', '/api/user/profile', { cookie: staleCookie }, [401]);
  await expectStatus('Auth/session lifecycle', 'GET /api/dashboard/metrics rejects stale admin cookie after logout', 'GET', '/api/dashboard/metrics', { cookie: staleCookie }, [401]);
}

async function cleanupFixtures() {
  console.log('\n[CLEANUP]');
  if (!state.adminCookie) {
    skip('Cleanup', 'Fixture cleanup skipped', 'Admin cookie is unavailable');
    return;
  }

  const cleanupOrder = [
    ['payments', 'DELETE', '/api/payments/'],
    ['tasks', 'DELETE', '/api/tasks/'],
    ['projects', 'DELETE', '/api/projects/'],
    ['clients', 'DELETE', '/api/clients/'],
    ['leads', 'DELETE', '/api/leads/'],
    ['mediaFiles', 'DELETE', '/api/media/files/'],
    ['blogPosts', 'DELETE', '/api/blog/'],
    ['members', 'DELETE', '/api/members/'],
  ];

  for (const [kind, method, prefix] of cleanupOrder) {
    for (const id of [...state.created[kind]]) {
      const expected = kind === 'projects' ? [204, 404] : [200, 404];
      await expectStatus('Cleanup', `${method} ${prefix}:id cleanup (${kind})`, method, `${prefix}${id}`, {}, expected, { severity: 'Low', smokeGap: false });
      forget(kind, id);
    }
  }
}

async function runAll() {
  abortIfUnsafeTarget();
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Run with Node.js 18 or newer.');
  }

  console.log('\nWorkflow audit starting');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Environment file: ${ENV_FILE}${fs.existsSync(envPath) ? '' : ' (not found; relying on process env)'}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || '<unset>'}`);
  console.log(`Cloudinary upload probes: ${SHOULD_RUN_CLOUDINARY_UPLOADS ? 'enabled' : 'skipped'}`);

  try {
    runNotificationWiringAudit();
    await runPreflight();
    const authed = await runAuthMembersAndRoleFlow();
    if (!authed) {
      skip('Workflow audit', 'Authenticated workflows skipped', 'Admin login failed');
      return;
    }
    await runProfilePictureFlow();
    await runMediaImagesFlow();
    await runMediaFlow();
    await runClientProjectTaskFlow();
    await runNotificationApiFlow();
    await runBlogEmbedTrackingFlow();
    await runLeadsAndWebhooksFlow();
    await runPaymentsRevenueAnalyticsDashboardFlow();
    await runModerateStressFlow();
    await runRedisFlushFlow();
  } finally {
    await cleanupFixtures();
    await runLogoutFlow();
    writeReport();
  }
}

function counts() {
  return state.results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 });
}

function severityRank(severity) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[severity] ?? 4;
}

function markdownEscape(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function writeReport() {
  const finishedAt = new Date();
  const summary = counts();
  const sortedFindings = [...state.findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const byArea = state.results.reduce((acc, result) => {
    acc[result.area] = acc[result.area] || { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
    acc[result.area][result.status] = (acc[result.area][result.status] || 0) + 1;
    return acc;
  }, {});

  const lines = [];
  lines.push('# Workflow Audit Report');
  lines.push('');
  lines.push(`- Generated: ${finishedAt.toISOString()}`);
  lines.push(`- Duration: ${Math.round((finishedAt - STARTED_AT) / 1000)}s`);
  lines.push(`- Target: ${BASE_URL}`);
  lines.push(`- Environment file: ${ENV_FILE}${fs.existsSync(envPath) ? '' : ' (not found; process env used)'}`);
  lines.push(`- NODE_ENV: ${process.env.NODE_ENV || '<unset>'}`);
  lines.push('- Production safeguard: audit script refuses NODE_ENV=production and non-local/non-staging targets by default.');
  lines.push(`- Cloudinary success probes: ${SHOULD_RUN_CLOUDINARY_UPLOADS ? 'enabled' : 'skipped (not explicitly enabled or credentials not configured)'}`);
  lines.push('');
  lines.push('## Summary Counts');
  lines.push('');
  lines.push(`- Pass: ${summary.PASS || 0}`);
  lines.push(`- Fail: ${summary.FAIL || 0}`);
  lines.push(`- Warn / findings: ${summary.WARN || 0}`);
  lines.push(`- Skipped: ${summary.SKIP || 0}`);
  lines.push(`- Findings recorded: ${sortedFindings.length}`);
  lines.push('');
  lines.push('## Coverage Areas');
  lines.push('');
  lines.push('| Area | Pass | Fail | Warn | Skip |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const [area, areaCounts] of Object.entries(byArea).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${markdownEscape(area)} | ${areaCounts.PASS || 0} | ${areaCounts.FAIL || 0} | ${areaCounts.WARN || 0} | ${areaCounts.SKIP || 0} |`);
  }
  lines.push('');
  lines.push('## Diagnostic Hypotheses Considered');
  lines.push('');
  lines.push('1. Route-level authorization gaps where globally authenticated routes omit admin-only checks.');
  lines.push('2. Validation inconsistencies between Zod-backed routes and routes using manual parse/default behavior.');
  lines.push('3. Cleanup/orphaning issues when parent resources such as projects or clients are deleted.');
  lines.push('4. Session-stamp lifecycle mistakes around logout and admin password resets.');
  lines.push('5. Upload trust-boundary issues, especially MIME/extension spoofing and Cloudinary-only paths.');
  lines.push('6. Derived metric inconsistencies across payments, revenue, analytics, and live dashboard aggregations.');
  lines.push('7. Moderate concurrency/rate-limit surprises on common list/detail endpoints.');
  lines.push('8. Notification route wiring, bulk dispatch fan-out behavior, and read-state API invariants.');
  lines.push('');
  lines.push('Most likely sources based on route inspection were authorization-boundary drift and validation/cleanup inconsistencies. The audit probes above validate those assumptions with direct staging requests rather than production data.');
  lines.push('');
  lines.push('## Existing Smoke Coverage Gaps This Audit Targets');
  lines.push('');
  lines.push('- Full blog create/update/delete lifecycle, protected-field mutation attempts, embed availability, and tracking-token replay behavior.');
  lines.push('- Lead/webhook invalid bearer-token cases plus lead read/mutation role access.');
  lines.push('- Client detail enrichment for last activity, associated projects, dynamic counts, notes history, and Quick Insights totals.');
  lines.push('- Payment create/update/delete plus revenue/dashboard consistency after creating paid payments, recognized revenue projects, and Total Leads/Total Tasks dashboard metrics.');
  lines.push('- Delete cleanup/orphan detection for project-linked tasks.');
  lines.push('- Pagination extremes and special-character search on lead/payment/media/list endpoints.');
  lines.push('- Moderate concurrency bursts across health, project, task, dashboard, payment, blog, and notification endpoints.');
  lines.push('- Notification API list/read/read-all behavior plus assignment-triggered notification delivery.');
  lines.push('- Static notification-system wiring checks for route mounting, service/DB helpers, bulk insert support, and project fan-out dispatchMany usage.');
  lines.push('- CORS-ish disallowed-origin behavior and docs/404 protections.');
  lines.push('');
  lines.push('## Prioritized Findings');
  lines.push('');
  if (!sortedFindings.length) {
    lines.push('No findings were recorded.');
  } else {
    sortedFindings.forEach((finding, index) => {
      lines.push(`### ${index + 1}. [${finding.severity}] ${finding.title}`);
      lines.push('');
      lines.push(`- Area: ${finding.area}`);
      if (finding.endpoint) lines.push(`- Endpoint/File area: ${finding.endpoint}`);
      if (finding.expected) lines.push(`- Expected: ${finding.expected}`);
      if (finding.actual) lines.push(`- Actual: ${finding.actual}`);
      lines.push(`- Current smoke tests likely miss this: ${finding.smokeGap ? 'Yes' : 'No'}`);
      if (finding.reproduction?.length) {
        lines.push('- Reproduction:');
        finding.reproduction.forEach((step) => lines.push(`  ${step}`));
      }
      lines.push('');
    });
  }
  lines.push('## Failed and Warning Checks');
  lines.push('');
  const nonPassing = state.results.filter((result) => result.status === 'FAIL' || result.status === 'WARN');
  if (!nonPassing.length) {
    lines.push('No failed or warning checks.');
  } else {
    lines.push('| Status | Area | Check | HTTP | Expected | Actual/Note |');
    lines.push('|---|---|---|---:|---|---|');
    nonPassing.forEach((result) => {
      lines.push(`| ${result.status} | ${markdownEscape(result.area)} | ${markdownEscape(result.label)} | ${markdownEscape(result.httpStatus)} | ${markdownEscape(result.expected)} | ${markdownEscape(result.actual || result.note)} |`);
    });
  }
  lines.push('');
  lines.push('## Skipped Checks');
  lines.push('');
  const skipped = state.results.filter((result) => result.status === 'SKIP');
  if (!skipped.length) {
    lines.push('No checks were skipped.');
  } else {
    lines.push('| Area | Check | Reason |');
    lines.push('|---|---|---|');
    skipped.forEach((result) => lines.push(`| ${markdownEscape(result.area)} | ${markdownEscape(result.label)} | ${markdownEscape(result.note)} |`));
  }
  lines.push('');
  lines.push('## Detailed Result Log');
  lines.push('');
  lines.push('| Status | Area | Check | HTTP | Duration ms |');
  lines.push('|---|---|---|---:|---:|');
  state.results.forEach((result) => {
    lines.push(`| ${result.status} | ${markdownEscape(result.area)} | ${markdownEscape(result.label)} | ${markdownEscape(result.httpStatus)} | ${markdownEscape(result.durationMs)} |`);
  });
  lines.push('');

  fs.writeFileSync(path.resolve(process.cwd(), REPORT_PATH), lines.join('\n'));
  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log(`Summary: PASS=${summary.PASS || 0} FAIL=${summary.FAIL || 0} WARN=${summary.WARN || 0} SKIP=${summary.SKIP || 0} FINDINGS=${sortedFindings.length}`);
}

runAll().catch((error) => {
  console.error(`\nFatal workflow audit error: ${redact(error.stack || error.message)}`);
  try {
    writeReport();
  } catch (reportError) {
    console.error(`Failed to write audit report: ${redact(reportError.message)}`);
  }
  process.exit(1);
});
