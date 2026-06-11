'use strict';

/**
 * Dedicated rate-limit behavior test for Atlas Admin Dashboard backend.
 *
 * Usage:
 *   node scripts/rate-limit-test.js
 *   npm run test:rate-limit
 *
 * The script reuses a running API server when reachable. If no server is reachable,
 * it starts `node server.js` with low test-only rate-limit thresholds, runs checks,
 * and stops only the server process that it started.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const ENV_FILE = process.env.RATE_LIMIT_TEST_ENV_FILE || process.env.SMOKE_TEST_ENV_FILE || '.env.staging';
const envPath = path.resolve(process.cwd(), ENV_FILE);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const API_BASE_URL = (process.env.RATE_LIMIT_TEST_BASE_URL || process.env.API_BASE_URL || process.env.SMOKE_TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/+$/, '');
const EMAIL = (process.env.RATE_LIMIT_TEST_EMAIL || process.env.SMOKE_EMAIL || 'admin1@atlas-africa.com.ng').trim();
const PASSWORD = (process.env.RATE_LIMIT_TEST_PASSWORD || process.env.SMOKE_PASSWORD || 'nimda@salta').trim();
const START_SERVER_IF_DOWN = !/^false$/i.test(process.env.RATE_LIMIT_TEST_START_SERVER_IF_DOWN || 'true');
const REQUEST_TIMEOUT_MS = numberEnv('RATE_LIMIT_TEST_REQUEST_TIMEOUT_MS', 8000);
const SERVER_START_TIMEOUT_MS = numberEnv('RATE_LIMIT_TEST_SERVER_START_TIMEOUT_MS', 30000);
const BETWEEN_REQUEST_MS = numberEnv('RATE_LIMIT_TEST_BETWEEN_REQUEST_MS', 0);
const DEFAULT_PROBE_EXTRA = numberEnv('RATE_LIMIT_TEST_EXTRA_ATTEMPTS', 2);
const MAX_ATTEMPTS_CAP = numberEnv('RATE_LIMIT_TEST_MAX_ATTEMPTS_CAP', 750);
const STARTED_SERVER_LIMIT_MAX = numberEnv('RATE_LIMIT_TEST_STARTED_SERVER_LIMIT_MAX', 3);
const STARTED_SERVER_WINDOW_MS = numberEnv('RATE_LIMIT_TEST_STARTED_SERVER_WINDOW_MS', 60000);

const state = {
  results: [],
  observations: [],
  serverProcess: null,
  startedServer: false,
  authCookie: '',
};

const startedServerRateLimitEnv = {
  RATE_LIMIT_STORE: process.env.RATE_LIMIT_TEST_STARTED_RATE_LIMIT_STORE || 'memory',
  RATE_LIMIT_AUTH_LOGIN_WINDOW_MS: String(STARTED_SERVER_WINDOW_MS),
  RATE_LIMIT_AUTH_LOGIN_MAX: String(STARTED_SERVER_LIMIT_MAX),
  RATE_LIMIT_AUTH_LOGIN_IP_WINDOW_MS: String(STARTED_SERVER_WINDOW_MS),
  RATE_LIMIT_AUTH_LOGIN_IP_MAX: String(Math.max(STARTED_SERVER_LIMIT_MAX + 4, 8)),
  RATE_LIMIT_HEALTH_WINDOW_MS: String(STARTED_SERVER_WINDOW_MS),
  RATE_LIMIT_HEALTH_MAX: String(Math.max(STARTED_SERVER_LIMIT_MAX + 8, 12)),
  RATE_LIMIT_404_WINDOW_MS: String(STARTED_SERVER_WINDOW_MS),
  RATE_LIMIT_404_MAX: String(STARTED_SERVER_LIMIT_MAX),
  RATE_LIMIT_PROJECTS_READ_WINDOW_MS: String(STARTED_SERVER_WINDOW_MS),
  RATE_LIMIT_PROJECTS_READ_MAX: String(STARTED_SERVER_LIMIT_MAX),
  RATE_LIMIT_CLIENTS_WRITE_WINDOW_MS: String(STARTED_SERVER_WINDOW_MS),
  RATE_LIMIT_CLIENTS_WRITE_MAX: String(STARTED_SERVER_LIMIT_MAX),
  RATE_LIMIT_NOTIFICATIONS_READ_WINDOW_MS: String(STARTED_SERVER_WINDOW_MS),
  RATE_LIMIT_NOTIFICATIONS_READ_MAX: String(STARTED_SERVER_LIMIT_MAX),
  RATE_LIMIT_NOTIFICATIONS_WRITE_WINDOW_MS: String(STARTED_SERVER_WINDOW_MS),
  RATE_LIMIT_NOTIFICATIONS_WRITE_MAX: String(STARTED_SERVER_LIMIT_MAX),
};

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function limiterMax(envName, fallback = STARTED_SERVER_LIMIT_MAX) {
  if (state.startedServer && startedServerRateLimitEnv[envName]) return Number(startedServerRateLimitEnv[envName]);
  return numberEnv(envName, fallback);
}

function attemptsFor(envName, fallback = STARTED_SERVER_LIMIT_MAX) {
  const configured = limiterMax(envName, fallback) + DEFAULT_PROBE_EXTRA;
  const override = numberEnv(`RATE_LIMIT_TEST_${envName.replace(/^RATE_LIMIT_/, '').replace(/_MAX$/, '')}_ATTEMPTS`, 0);
  return Math.min(override || configured, MAX_ATTEMPTS_CAP);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function header(response, name) {
  return response?.headers?.get(name) || '';
}

function retryAfterSummary(response) {
  const retryAfter = header(response, 'retry-after');
  const reset = header(response, 'ratelimit-reset');
  const limit = header(response, 'ratelimit-limit');
  const remaining = header(response, 'ratelimit-remaining');
  const bits = [];
  if (retryAfter) bits.push(`retry-after=${retryAfter}`);
  if (limit) bits.push(`ratelimit-limit=${limit}`);
  if (remaining) bits.push(`remaining=${remaining}`);
  if (reset) bits.push(`reset=${reset}`);
  return bits.length ? bits.join(', ') : 'no retry-after/rate-limit headers observed';
}

function addResult(status, label, detail = {}) {
  const record = {
    status,
    label,
    httpStatus: detail.httpStatus ?? '',
    note: detail.note || '',
    fatal: Boolean(detail.fatal),
  };
  state.results.push(record);

  const glyph = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'WARN' ? '!' : '-';
  const color = status === 'PASS' ? '\x1b[32m' : status === 'FAIL' ? '\x1b[31m' : status === 'WARN' ? '\x1b[33m' : '\x1b[36m';
  const http = record.httpStatus !== '' ? ` [${record.httpStatus}]` : '';
  const note = record.note ? ` — ${record.note}` : '';
  console.log(`  ${color}${glyph}\x1b[0m ${label}${http}${note}`);
}

function pass(label, response, note = '') {
  addResult('PASS', label, { httpStatus: response?.status ?? '', note });
}

function fail(label, response, note = '', fatal = false) {
  addResult('FAIL', label, { httpStatus: response?.status ?? 0, note, fatal });
}

function warn(label, response, note = '') {
  addResult('WARN', label, { httpStatus: response?.status ?? '', note });
}

function skip(label, note = '') {
  addResult('SKIP', label, { note });
}

function observe(message) {
  state.observations.push(message);
  console.log(`    ${message}`);
}

async function request(method, endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = { ...(options.headers || {}) };
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';
  if (options.cookie !== undefined ? options.cookie : state.authCookie) headers.Cookie = options.cookie !== undefined ? options.cookie : state.authCookie;

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
      redirect: 'manual',
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
    return { response, status: response.status, text, json, error: null };
  } catch (error) {
    return { response: null, status: 0, text: '', json: null, error };
  } finally {
    clearTimeout(timeout);
  }
}

async function isReachable() {
  const { response, error } = await request('GET', '/api/health', { cookie: '' });
  return !error && response && response.status < 500;
}

function buildServerEnv() {
  return {
    ...process.env,
    ...startedServerRateLimitEnv,
  };
}

async function startServerIfNeeded() {
  console.log('\n[SERVER]');
  if (await isReachable()) {
    pass(`Reuse existing API server at ${API_BASE_URL}`, { status: 'OK' }, 'server responded to GET /api/health');
    return true;
  }

  if (!START_SERVER_IF_DOWN) {
    fail(`Reach API server at ${API_BASE_URL}`, null, 'server is down and RATE_LIMIT_TEST_START_SERVER_IF_DOWN=false', true);
    return false;
  }

  console.log('  Starting API server with low test-only rate-limit thresholds...');
  state.serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: buildServerEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  state.startedServer = true;

  state.serverProcess.stdout.on('data', (chunk) => process.stdout.write(`    [server] ${chunk}`));
  state.serverProcess.stderr.on('data', (chunk) => process.stderr.write(`    [server] ${chunk}`));

  const startedAt = Date.now();
  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (await isReachable()) {
      pass(`Started API server at ${API_BASE_URL}`, { status: 'OK' }, `test max=${STARTED_SERVER_LIMIT_MAX}, windowMs=${STARTED_SERVER_WINDOW_MS}`);
      return true;
    }
    if (state.serverProcess.exitCode !== null) break;
    await sleep(500);
  }

  fail(`Start API server at ${API_BASE_URL}`, null, 'server did not become reachable before timeout', true);
  return false;
}

async function stopStartedServer() {
  if (!state.serverProcess || state.serverProcess.exitCode !== null) return;
  console.log('\n[CLEANUP]');
  state.serverProcess.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => state.serverProcess.once('exit', resolve)),
    sleep(5000).then(() => {
      if (state.serverProcess.exitCode === null) state.serverProcess.kill('SIGKILL');
    }),
  ]);
  pass('Stopped API server process started by this script', { status: 'OK' });
}

async function login(label = 'POST /api/auth/login baseline') {
  const result = await request('POST', '/api/auth/login', {
    cookie: '',
    json: { email: EMAIL, password: PASSWORD },
  });
  if (result.error) {
    fail(label, null, `connection error: ${result.error.message}`, true);
    return false;
  }

  const rawCookie = header(result.response, 'set-cookie');
  const match = rawCookie.match(/auth_token=([^;]+)/);
  if (result.status === 200 && match) {
    state.authCookie = `auth_token=${match[1]}`;
    pass(label, result.response, 'auth cookie captured');
    return true;
  }

  fail(label, result.response, result.json?.message || result.text.slice(0, 120), true);
  return false;
}

async function flushRedis(label = 'POST /api/health/redis/flush reset limiter state') {
  if (!state.authCookie) {
    skip(label, 'no auth cookie available');
    return false;
  }

  const result = await request('POST', '/api/health/redis/flush', { json: {} });
  if (result.error) {
    warn(label, null, `connection error: ${result.error.message}`);
    return false;
  }

  if (result.status === 200) {
    pass(label, result.response, retryAfterSummary(result.response));
    return true;
  }

  if (result.status === 503) {
    warn(label, result.response, 'Redis is not connected; in-memory limiter state cannot be externally flushed');
    return false;
  }

  warn(label, result.response, result.json?.message || retryAfterSummary(result.response));
  return false;
}

async function baseline() {
  console.log('\n[BASELINE]');
  const health = await request('GET', '/api/health', { cookie: '' });
  if (health.error) fail('GET /api/health baseline reaches server', null, health.error.message, true);
  else if (health.status === 200) pass('GET /api/health baseline succeeds before limits are hit', health.response, retryAfterSummary(health.response));
  else warn('GET /api/health baseline behavior', health.response, health.json?.message || retryAfterSummary(health.response));

  if (!state.authCookie) await login();

  const projects = await request('GET', '/api/projects?limit=1');
  if (projects.error) fail('GET /api/projects baseline reaches server', null, projects.error.message, true);
  else if (projects.status < 400) pass('GET /api/projects baseline succeeds before limits are hit', projects.response, retryAfterSummary(projects.response));
  else warn('GET /api/projects baseline behavior', projects.response, projects.json?.message || retryAfterSummary(projects.response));
}

async function spamScenario({ title, label, method, endpoint, body, attempts, expectLimited = true, cookie }) {
  console.log(`\n[${title}]`);
  observe(`${method} ${endpoint} attempts=${attempts}`);

  const statuses = [];
  let firstSuccess = null;
  let firstLimited = null;
  let firstError = null;

  for (let index = 1; index <= attempts; index += 1) {
    const result = await request(method, endpoint, { json: typeof body === 'function' ? body(index) : body, cookie });
    statuses.push(result.status);
    if (result.error && !firstError) firstError = result.error;
    if (!firstSuccess && result.status > 0 && result.status !== 429 && result.status < 500) firstSuccess = { index, response: result.response, status: result.status };
    if (!firstLimited && result.status === 429) firstLimited = { index, response: result.response, status: result.status, json: result.json, text: result.text };
    if (firstLimited) break;
    if (BETWEEN_REQUEST_MS) await sleep(BETWEEN_REQUEST_MS);
  }

  const statusSummary = summarizeStatuses(statuses);
  if (firstError) {
    fail(`${label} requests complete without network errors`, null, firstError.message);
  } else {
    pass(`${label} requests completed`, { status: statuses[statuses.length - 1] || '' }, statusSummary);
  }

  if (firstSuccess) {
    pass(`${label} has a pre-limit non-429 response`, firstSuccess.response, `attempt ${firstSuccess.index}; ${retryAfterSummary(firstSuccess.response)}`);
  } else {
    warn(`${label} did not observe a pre-limit non-429 response`, { status: statuses[0] || '' }, statusSummary);
  }

  if (firstLimited) {
    const note = `attempt ${firstLimited.index}; ${retryAfterSummary(firstLimited.response)}; message=${firstLimited.json?.message || firstLimited.text.slice(0, 80) || '<empty>'}`;
    pass(`${label} is rate limited`, firstLimited.response, note);
  } else if (expectLimited) {
    fail(`${label} is rate limited`, { status: statuses[statuses.length - 1] || 0 }, `no 429 observed; statuses: ${statusSummary}`);
  } else {
    warn(`${label} is not rate limited`, { status: statuses[statuses.length - 1] || 0 }, `no 429 observed; statuses: ${statusSummary}`);
  }

  return { statuses, firstLimited };
}

function summarizeStatuses(statuses) {
  const counts = statuses.reduce((acc, status) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([status, count]) => `${status}x${count}`).join(', ') || '<none>';
}

async function testReadHeavyLimiter() {
  await login('POST /api/auth/login for read-heavy limiter scenario');
  await spamScenario({
    title: 'READ-HEAVY ENDPOINT',
    label: 'GET /api/projects read limiter',
    method: 'GET',
    endpoint: '/api/projects?limit=1',
    attempts: attemptsFor('RATE_LIMIT_PROJECTS_READ_MAX', 600),
  });
  await flushRedis();
}

async function testWriteHeavyLimiter() {
  await login('POST /api/auth/login for write-heavy limiter scenario');
  await spamScenario({
    title: 'WRITE-HEAVY ENDPOINT',
    label: 'PATCH /api/clients/:id write limiter',
    method: 'PATCH',
    endpoint: `/api/clients/rate-limit-test-missing-${Date.now()}`,
    body: { notes: 'Temporary write probe generated by scripts/rate-limit-test.js' },
    attempts: attemptsFor('RATE_LIMIT_CLIENTS_WRITE_MAX', 180),
  });
  await flushRedis();
}

async function testNotificationLimiters() {
  await login('POST /api/auth/login for notification limiter scenario');
  await spamScenario({
    title: 'NOTIFICATIONS READ ENDPOINT',
    label: 'GET /api/notifications read limiter',
    method: 'GET',
    endpoint: '/api/notifications?limit=1',
    attempts: attemptsFor('RATE_LIMIT_NOTIFICATIONS_READ_MAX', 600),
  });
  await flushRedis();
}

async function testLoginBruteForceLimiter() {
  console.log('\n[LOGIN BRUTE-FORCE]');
  const probeEmail = (process.env.RATE_LIMIT_TEST_BRUTE_FORCE_EMAIL || `rate-limit-missing-${Date.now()}@test.local`).trim().toLowerCase();
  await spamScenario({
    title: 'LOGIN BRUTE-FORCE',
    label: 'POST /api/auth/login invalid-password limiter',
    method: 'POST',
    endpoint: '/api/auth/login',
    cookie: '',
    body: { email: probeEmail, password: 'definitely-wrong-password' },
    attempts: attemptsFor('RATE_LIMIT_AUTH_LOGIN_MAX', 10),
  });
  await flushRedis();
}

async function test404Limiter() {
  await spamScenario({
    title: '404 ENDPOINT',
    label: 'Unknown route 404 limiter',
    method: 'GET',
    endpoint: `/api/rate-limit-test-missing-${Date.now()}`,
    cookie: '',
    attempts: attemptsFor('RATE_LIMIT_404_MAX', 120),
    expectLimited: false,
  });
  await flushRedis();
}

async function testHealthLimiter() {
  await spamScenario({
    title: 'HEALTH ENDPOINT',
    label: 'GET /api/health limiter',
    method: 'GET',
    endpoint: '/api/health',
    cookie: '',
    attempts: attemptsFor('RATE_LIMIT_HEALTH_MAX', 120),
  });
}

function printSummary() {
  const counts = state.results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  const failures = state.results.filter((result) => result.status === 'FAIL');
  const fatalFailures = failures.filter((result) => result.fatal);
  const warnings = state.results.filter((result) => result.status === 'WARN');
  const skipped = state.results.filter((result) => result.status === 'SKIP');

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`\x1b[1mRate-limit Results: PASS=${counts.PASS || 0} FAIL=${counts.FAIL || 0} WARN=${counts.WARN || 0} SKIP=${counts.SKIP || 0}\x1b[0m`);

  if (warnings.length) {
    console.log('\n\x1b[33mWarnings / observed behavior:\x1b[0m');
    warnings.forEach((result) => console.log(`  • ${result.label}${result.note ? ` — ${result.note}` : ''}`));
  }

  if (skipped.length) {
    console.log('\n\x1b[36mSkipped:\x1b[0m');
    skipped.forEach((result) => console.log(`  • ${result.label}${result.note ? ` — ${result.note}` : ''}`));
  }

  if (failures.length) {
    console.log('\n\x1b[31mFailed checks:\x1b[0m');
    failures.forEach((result) => console.log(`  • ${result.label}${result.note ? ` — ${result.note}` : ''}`));
  }

  if (state.observations.length) {
    console.log('\nObserved behavior notes:');
    state.observations.forEach((message) => console.log(`  • ${message}`));
  }

  console.log('');
  return fatalFailures.length || failures.length ? 1 : 0;
}

async function run() {
  console.log(`\n\x1b[1mRate-limit test → ${API_BASE_URL}\x1b[0m`);
  console.log(`Environment file: ${fs.existsSync(envPath) ? ENV_FILE : `${ENV_FILE} (not found, using process env only)`}`);
  console.log(`Login email: ${EMAIL}`);
  console.log(`Attempt cap: ${MAX_ATTEMPTS_CAP}`);

  try {
    const ready = await startServerIfNeeded();
    if (!ready) {
      process.exitCode = printSummary();
      return;
    }

    await baseline();
    await flushRedis('POST /api/health/redis/flush initial reset');
    await testReadHeavyLimiter();
    await testWriteHeavyLimiter();
    await testNotificationLimiters();
    await testLoginBruteForceLimiter();
    await test404Limiter();
    await testHealthLimiter();
  } finally {
    await stopStartedServer();
  }

  process.exitCode = printSummary();
}

run().catch(async (error) => {
  console.error(`\nFatal rate-limit test error: ${error.stack || error.message}`);
  await stopStartedServer();
  process.exitCode = 1;
});
