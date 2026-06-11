'use strict';

/**
 * Dedicated CORS behavior test for Atlas Admin Dashboard backend.
 *
 * Usage:
 *   node scripts/cors-test.js
 *   npm run test:cors
 *
 * Requires the API server to already be running at API_BASE_URL.
 * Loads .env.staging by default so APP_BASE_URL can provide the default allowed origin.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_FILE = process.env.CORS_TEST_ENV_FILE || process.env.SMOKE_TEST_ENV_FILE || '.env.staging';
const envPath = path.resolve(process.cwd(), ENV_FILE);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const API_BASE_URL = (process.env.API_BASE_URL || process.env.CORS_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
const TEST_ENDPOINT = process.env.CORS_TEST_ENDPOINT || '/api/health';
const ALLOWED_ORIGIN = (process.env.CORS_ALLOWED_ORIGIN || firstAppBaseUrlOrigin() || 'http://localhost:3000').trim();
const DISALLOWED_ORIGIN = (process.env.CORS_DISALLOWED_ORIGIN || 'https://definitely-not-allowed.cors-test.invalid').trim();
const EMPTY_ORIGIN = process.env.CORS_EMPTY_ORIGIN || '';

const state = {
  results: [],
  observations: [],
};

function firstAppBaseUrlOrigin() {
  const raw = process.env.APP_BASE_URL;
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return String(parsed.find(Boolean) || '').replace(/\/+$/, '');
    }
    return String(parsed || '').replace(/\/+$/, '');
  } catch (_) {
    return String(raw || '')
      .split(',')
      .map((value) => value.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, ''))
      .find(Boolean) || '';
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveTrailingSlashOrigin(origin) {
  return origin.endsWith('/') ? origin : `${origin}/`;
}

function deriveCaseVariantOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const protocol = parsed.protocol.toUpperCase();
    const hostname = parsed.hostname
      .split('')
      .map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()))
      .join('');
    return `${protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch (_) {
    return String(origin || '').toUpperCase();
  }
}

function header(response, name) {
  return response.headers.get(name) || '';
}

function corsSnapshot(response) {
  return {
    allowOrigin: header(response, 'access-control-allow-origin'),
    allowCredentials: header(response, 'access-control-allow-credentials'),
    allowMethods: header(response, 'access-control-allow-methods'),
    allowHeaders: header(response, 'access-control-allow-headers'),
    vary: header(response, 'vary'),
  };
}

function describeCors(snapshot) {
  const bits = [];
  bits.push(`allow-origin=${snapshot.allowOrigin || '<none>'}`);
  bits.push(`allow-credentials=${snapshot.allowCredentials || '<none>'}`);
  if (snapshot.allowMethods) bits.push(`allow-methods=${snapshot.allowMethods}`);
  if (snapshot.allowHeaders) bits.push(`allow-headers=${snapshot.allowHeaders}`);
  if (snapshot.vary) bits.push(`vary=${snapshot.vary}`);
  return bits.join(', ');
}

function addResult(status, label, detail = {}) {
  const record = {
    status,
    label,
    httpStatus: detail.httpStatus ?? '',
    expected: detail.expected || '',
    actual: detail.actual || '',
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
  const headers = { ...(options.headers || {}) };
  if (Object.prototype.hasOwnProperty.call(options, 'origin')) {
    headers.Origin = options.origin;
  }
  if (options.preflightMethod) {
    headers['Access-Control-Request-Method'] = options.preflightMethod;
  }
  if (options.preflightHeaders) {
    headers['Access-Control-Request-Headers'] = options.preflightHeaders;
  }
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      redirect: 'manual',
    });
    const text = await response.text().catch(() => '');
    return { response, text, error: null };
  } catch (error) {
    return { response: null, text: '', error };
  }
}

function originGranted(response, origin) {
  return header(response, 'access-control-allow-origin') === origin;
}

function credentialsGranted(response) {
  return /^true$/i.test(header(response, 'access-control-allow-credentials'));
}

function methodAllowed(response, method) {
  const methods = header(response, 'access-control-allow-methods')
    .split(',')
    .map((value) => value.trim().toUpperCase());
  return methods.includes(method.toUpperCase());
}

function headersAllowed(response, expectedHeaders) {
  const actual = header(response, 'access-control-allow-headers').toLowerCase();
  return expectedHeaders.every((expected) => new RegExp(`(^|[,\\s])${escapeRegExp(expected.toLowerCase())}([,\\s]|$)`).test(actual));
}

async function checkReachable() {
  console.log('\n[CONNECTIVITY]');
  const { response, error } = await request('GET', TEST_ENDPOINT);
  if (error) {
    fail(`GET ${TEST_ENDPOINT} reaches API server`, null, `connection error: ${error.message}`, true);
    return false;
  }
  if (response.status >= 200 && response.status < 500) {
    pass(`GET ${TEST_ENDPOINT} reaches API server`, response, 'server responded; continuing CORS checks');
    return true;
  }
  fail(`GET ${TEST_ENDPOINT} reaches API server`, response, 'server returned 5xx; CORS checks may be misleading', true);
  return false;
}

async function testNoOrigin() {
  console.log('\n[NO ORIGIN]');
  const { response, error } = await request('GET', TEST_ENDPOINT);
  if (error) return fail('Request without Origin header is accepted by non-browser clients', null, error.message);

  const snapshot = corsSnapshot(response);
  const noAllowOrigin = !snapshot.allowOrigin;
  if (response.status < 500 && noAllowOrigin) {
    pass('Request without Origin header does not emit Access-Control-Allow-Origin', response, describeCors(snapshot));
  } else if (response.status < 500) {
    warn('Request without Origin header received CORS headers', response, describeCors(snapshot));
  } else {
    fail('Request without Origin header should not crash', response, describeCors(snapshot));
  }
}

async function testAllowedSimpleGet() {
  console.log('\n[ALLOWED ORIGIN SIMPLE GET]');
  const { response, error } = await request('GET', TEST_ENDPOINT, { origin: ALLOWED_ORIGIN });
  if (error) return fail('Simple GET from allowed origin reaches API', null, error.message);

  const snapshot = corsSnapshot(response);
  if (originGranted(response, ALLOWED_ORIGIN) && response.status < 500) {
    pass('Simple GET from allowed origin is granted CORS access', response, describeCors(snapshot));
  } else {
    fail('Simple GET from allowed origin is granted CORS access', response, `expected allow-origin=${ALLOWED_ORIGIN}; ${describeCors(snapshot)}`);
  }
}

async function testAllowedPreflight() {
  console.log('\n[ALLOWED ORIGIN PREFLIGHT]');
  const expectedHeaders = ['content-type', 'authorization'];
  const { response, error } = await request('OPTIONS', TEST_ENDPOINT, {
    origin: ALLOWED_ORIGIN,
    preflightMethod: 'GET',
    preflightHeaders: expectedHeaders.join(', '),
  });
  if (error) return fail('Preflight OPTIONS from allowed origin reaches API', null, error.message);

  const snapshot = corsSnapshot(response);
  const okStatus = [200, 204].includes(response.status);
  const okCors = originGranted(response, ALLOWED_ORIGIN) && methodAllowed(response, 'GET') && headersAllowed(response, expectedHeaders);
  if (okStatus && okCors) {
    pass('Preflight OPTIONS from allowed origin permits method and headers', response, describeCors(snapshot));
  } else {
    fail('Preflight OPTIONS from allowed origin permits method and headers', response, `expected 200/204, allow-origin=${ALLOWED_ORIGIN}, GET, and ${expectedHeaders.join('/')} headers; ${describeCors(snapshot)}`);
  }
}

async function testCredentialedAllowedOrigin() {
  console.log('\n[CREDENTIALS]');
  const { response, error } = await request('GET', TEST_ENDPOINT, {
    origin: ALLOWED_ORIGIN,
    cookie: 'cors_test_cookie=1',
  });
  if (error) return fail('Credentialed request from allowed origin reaches API', null, error.message);

  const snapshot = corsSnapshot(response);
  if (originGranted(response, ALLOWED_ORIGIN) && credentialsGranted(response)) {
    pass('Credentialed allowed-origin response includes access-control-allow-credentials: true', response, describeCors(snapshot));
  } else {
    fail('Credentialed allowed-origin response includes access-control-allow-credentials: true', response, `expected allow-origin=${ALLOWED_ORIGIN} and credentials=true; ${describeCors(snapshot)}`);
  }
}

async function testDisallowedOrigin() {
  console.log('\n[DISALLOWED ORIGIN]');
  const { response, error, text } = await request('GET', TEST_ENDPOINT, { origin: DISALLOWED_ORIGIN });
  if (error) return fail('Disallowed origin behavior is observable', null, error.message);

  const snapshot = corsSnapshot(response);
  const deniedCors = !originGranted(response, DISALLOWED_ORIGIN) && !snapshot.allowOrigin;
  if (deniedCors) {
    pass('Disallowed origin is not granted CORS access', response, describeCors(snapshot));
  } else {
    fail('Disallowed origin is not granted CORS access', response, `unexpected CORS grant; ${describeCors(snapshot)}`);
  }

  if (response.status >= 500) {
    warn('Disallowed origin currently surfaces through global error handling', response, 'observed 5xx; reporting only, no CORS implementation change made');
  } else {
    observe(`Disallowed origin returned HTTP ${response.status}; response body preview: ${(text || '<empty>').slice(0, 120)}`);
  }
}

async function testEmptyOrigin() {
  console.log('\n[EMPTY ORIGIN]');
  const { response, error } = await request('GET', TEST_ENDPOINT, { origin: EMPTY_ORIGIN });
  if (error) return fail('Empty Origin edge case is observable', null, error.message);

  const snapshot = corsSnapshot(response);
  if (!snapshot.allowOrigin && response.status < 500) {
    pass('Empty Origin header is not reflected as a trusted origin', response, describeCors(snapshot));
  } else if (snapshot.allowOrigin === EMPTY_ORIGIN) {
    fail('Empty Origin header is not reflected as a trusted origin', response, `empty origin was reflected; ${describeCors(snapshot)}`);
  } else {
    warn('Empty Origin edge case behavior observed', response, describeCors(snapshot));
  }
}

async function testMalformedOrigin() {
  console.log('\n[MALFORMED ORIGIN]');
  const malformedOrigin = process.env.CORS_MALFORMED_ORIGIN || 'not a valid origin';
  const { response, error } = await request('GET', TEST_ENDPOINT, { origin: malformedOrigin });
  if (error) return fail('Malformed Origin edge case is observable', null, error.message);

  const snapshot = corsSnapshot(response);
  if (!originGranted(response, malformedOrigin) && !snapshot.allowOrigin) {
    pass('Malformed Origin is not granted CORS access', response, describeCors(snapshot));
  } else {
    fail('Malformed Origin is not granted CORS access', response, `unexpected CORS grant; ${describeCors(snapshot)}`);
  }
}

async function testTrailingSlashOrigin() {
  console.log('\n[TRAILING SLASH ORIGIN]');
  const trailingSlashOrigin = process.env.CORS_TRAILING_SLASH_ORIGIN || deriveTrailingSlashOrigin(ALLOWED_ORIGIN);
  if (trailingSlashOrigin === ALLOWED_ORIGIN) {
    return skip('Allowed origin with trailing slash differs from configured origin', 'configured allowed origin already includes a trailing slash');
  }

  const { response, error } = await request('GET', TEST_ENDPOINT, { origin: trailingSlashOrigin });
  if (error) return fail('Trailing slash origin behavior is observable', null, error.message);

  const snapshot = corsSnapshot(response);
  if (!originGranted(response, trailingSlashOrigin) && !snapshot.allowOrigin) {
    pass('Allowed origin with trailing slash is not treated as the same origin unless configured', response, describeCors(snapshot));
  } else {
    fail('Allowed origin with trailing slash is not treated as the same origin unless configured', response, `unexpected CORS grant for ${trailingSlashOrigin}; ${describeCors(snapshot)}`);
  }
}

async function testCaseSensitiveOrigin() {
  console.log('\n[CASE-SENSITIVE ORIGIN]');
  const caseVariantOrigin = process.env.CORS_CASE_VARIANT_ORIGIN || deriveCaseVariantOrigin(ALLOWED_ORIGIN);
  if (caseVariantOrigin === ALLOWED_ORIGIN) {
    return skip('Case-sensitive origin behavior can be probed', 'could not derive a different case variant');
  }

  const { response, error } = await request('GET', TEST_ENDPOINT, { origin: caseVariantOrigin });
  if (error) return fail('Case-variant origin behavior is observable', null, error.message);

  const snapshot = corsSnapshot(response);
  if (originGranted(response, caseVariantOrigin)) {
    warn('Case-variant origin is granted CORS access', response, `origin comparison appears case-insensitive or variant is configured; ${describeCors(snapshot)}`);
  } else {
    pass('Case-variant origin is not granted CORS access', response, `origin comparison appears case-sensitive; ${describeCors(snapshot)}`);
  }
}

function printSummary() {
  const counts = state.results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  const fatalFailures = state.results.filter((result) => result.status === 'FAIL' && result.fatal);
  const failures = state.results.filter((result) => result.status === 'FAIL');
  const warnings = state.results.filter((result) => result.status === 'WARN');
  const skipped = state.results.filter((result) => result.status === 'SKIP');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`\x1b[1mCORS Results: PASS=${counts.PASS || 0} FAIL=${counts.FAIL || 0} WARN=${counts.WARN || 0} SKIP=${counts.SKIP || 0}\x1b[0m`);

  if (warnings.length) {
    console.log('\n\x1b[33mWarnings / observed behavior (not forced code changes):\x1b[0m');
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
  console.log(`\n\x1b[1mCORS test → ${API_BASE_URL}${TEST_ENDPOINT}\x1b[0m`);
  console.log(`Environment file: ${fs.existsSync(envPath) ? ENV_FILE : `${ENV_FILE} (not found, using process env only)`}`);
  console.log(`Allowed origin under test: ${ALLOWED_ORIGIN || '<none>'}`);
  console.log(`Disallowed origin under test: ${DISALLOWED_ORIGIN}`);

  const reachable = await checkReachable();
  if (!reachable) {
    process.exitCode = printSummary();
    return;
  }

  await testNoOrigin();
  await testAllowedSimpleGet();
  await testAllowedPreflight();
  await testCredentialedAllowedOrigin();
  await testDisallowedOrigin();
  await testEmptyOrigin();
  await testMalformedOrigin();
  await testTrailingSlashOrigin();
  await testCaseSensitiveOrigin();

  process.exitCode = printSummary();
}

run().catch((error) => {
  console.error(`\nFatal CORS test error: ${error.stack || error.message}`);
  process.exitCode = 1;
});
