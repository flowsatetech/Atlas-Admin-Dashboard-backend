/**
 * Project-wide smoke test — hits every API endpoint and reports pass/fail.
 * Covers: happy path, auth/authorization, input validation, 404s, conflict, post-logout.
 * Usage: node scripts/smoke-test.js
 * Requires the server to already be running on BASE_URL.
 */

const ENV_FILE = process.env.SMOKE_TEST_ENV_FILE || '.env.staging';
require('dotenv').config({ path: ENV_FILE });

const BASE_URL = process.env.SMOKE_TEST_BASE_URL || "http://127.0.0.1:3000";
const EMAIL = (process.env.SMOKE_EMAIL || "onasogaemmanuel02@gmail.com").trim();
const PASSWORD = (process.env.SMOKE_PASSWORD || "nimda@salta").trim();
const WEBHOOK_TOKEN = process.env.WEBHOOK_BEARER_TOKEN || "test-webhook-token";
const HAS_CLOUDINARY_CONFIG = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
  .every((key) => Boolean((process.env[key] || "").trim()));
const ENABLE_CLOUDINARY_UPLOAD_SMOKE = /^true$/i.test(process.env.SMOKE_ENABLE_CLOUDINARY_UPLOADS || "");
const SHOULD_RUN_CLOUDINARY_UPLOADS = HAS_CLOUDINARY_CONFIG && ENABLE_CLOUDINARY_UPLOAD_SMOKE;
const ORIGINAL_TEST_MEMBER_PASSWORD = "TestPassword123!";
const CHANGED_TEST_MEMBER_PASSWORD = "ChangedPassword123!";

let authCookie = "";
const pass = [];
const fail = [];
const skipped = [];

// ─── helpers ─────────────────────────────────────────────────────────────────

function ok(label, status) {
  pass.push(label);
  console.log(`  \x1b[32m✓\x1b[0m ${label} [${status}]`);
}

function bad(label, status, note = "") {
  fail.push(label);
  console.log(`  \x1b[31m✗\x1b[0m ${label} [${status}]${note ? " — " + note : ""}`);
}

function skipSmoke(label, note = "") {
  skipped.push(label);
  console.log(`  \x1b[33m-\x1b[0m ${label} [SKIP]${note ? " — " + note : ""}`);
}

// Request using the global authCookie
async function req(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (authCookie) opts.headers["Cookie"] = authCookie;
  if (body) opts.body = JSON.stringify(body);

  let res, json;
  try {
    res = await fetch(`${BASE_URL}${path}`, opts);
    try { json = await res.json(); } catch { json = null; }
  } catch (err) {
    return { status: 0, json: null, err };
  }
  return { status: res.status, json, headers: res.headers };
}

// Request with an explicit cookie value (pass "" for no cookie)
async function reqWith(method, path, cookie, body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (cookie) opts.headers["Cookie"] = cookie;
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    let json; try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json, headers: res.headers };
  } catch (err) {
    return { status: 0, json: null, err };
  }
}

async function reqMultipart(method, path, { fields = {}, files = [] } = {}) {
  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(name, String(value));
  }

  for (const file of files) {
    const blob = new Blob([file.content], { type: file.contentType || "application/octet-stream" });
    form.append(file.name, blob, file.filename || "file.bin");
  }

  const opts = { method, headers: {}, body: form };
  if (authCookie) opts.headers["Cookie"] = authCookie;

  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    let json; try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json, headers: res.headers };
  } catch (err) {
    return { status: 0, json: null, err };
  }
}

async function check(label, method, path, body = null, { expect = [200, 201], note = "" } = {}) {
  const { status, json, err } = await req(method, path, body);
  if (err) { bad(label, 0, `connection error: ${err.message}`); return null; }
  const passed = expect.includes(status);
  const detail = (!passed && json?.message) ? json.message : note;
  passed ? ok(label, status) : bad(label, status, detail);
  return json;
}

async function checkWith(label, method, path, cookie, body = null, { expect = [200, 201] } = {}) {
  const { status, json, err } = await reqWith(method, path, cookie, body);
  if (err) { bad(label, 0, `connection error: ${err.message}`); return null; }
  const passed = expect.includes(status);
  const detail = (!passed && json?.message) ? json.message : "";
  passed ? ok(label, status) : bad(label, status, detail);
  return json;
}

async function checkMultipart(label, method, path, multipart = {}, { expect = [200, 201], note = "" } = {}) {
  const { status, json, err } = await reqMultipart(method, path, multipart);
  if (err) { bad(label, 0, `connection error: ${err.message}`); return null; }
  const passed = expect.includes(status);
  const detail = (!passed && json?.message) ? json.message : note;
  passed ? ok(label, status) : bad(label, status, detail);
  return json;
}

function assertSmoke(label, condition, note = "") {
  condition ? ok(label, "ASSERT") : bad(label, "ASSERT", note);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertProjectHasClientDetails(label, project, expectedClientId) {
  const client = project?.client;
  const issues = [];

  if (!isPlainObject(project)) issues.push("project is not an object");
  if (!isPlainObject(client)) issues.push("client is not an object");
  if (typeof client === "string") issues.push("client is still a string id/name instead of detail object");
  if (expectedClientId && project?.clientId !== expectedClientId) issues.push(`project.clientId expected ${expectedClientId}`);
  if (expectedClientId && client?.id !== expectedClientId) issues.push(`client.id expected ${expectedClientId}`);
  if (client && Object.prototype.hasOwnProperty.call(client, "_id")) issues.push("client exposes MongoDB _id");
  if (client && !Array.isArray(client.tags)) issues.push("client.tags is not an array");

  const requiredStringFields = ["id", "fullName", "companyName", "email", "phone", "status"];
  const missingFields = requiredStringFields.filter((field) => typeof client?.[field] !== "string" || !client[field]);
  if (missingFields.length) issues.push(`client missing required fields: ${missingFields.join(", ")}`);

  assertSmoke(label, issues.length === 0, issues.join("; "));
}

function assertProjectHasNullClient(label, project, expectedClientId) {
  const issues = [];

  if (!isPlainObject(project)) issues.push("project is not an object");
  if (expectedClientId && project?.clientId !== expectedClientId) issues.push(`project.clientId expected ${expectedClientId}`);
  if (project?.client !== null) issues.push(`client expected null, received ${JSON.stringify(project?.client)}`);

  assertSmoke(label, issues.length === 0, issues.join("; "));
}

function findProjectById(projects = [], projectId) {
  return Array.isArray(projects) ? projects.find((project) => project?.id === projectId) : null;
}

function assertProjectTaskProgress(label, project, expected) {
  const issues = [];

  if (!isPlainObject(project)) issues.push("project is not an object");
  if (project?.totalTasks !== expected.totalTasks) issues.push(`totalTasks expected ${expected.totalTasks}, received ${project?.totalTasks}`);
  if (project?.completedTasks !== expected.completedTasks) issues.push(`completedTasks expected ${expected.completedTasks}, received ${project?.completedTasks}`);
  if (Number(project?.progress) !== expected.progress) issues.push(`progress expected ${expected.progress}, received ${project?.progress}`);
  if (project?.status !== expected.status) issues.push(`status expected ${expected.status}, received ${project?.status}`);
  if (Object.prototype.hasOwnProperty.call(project || {}, "percentage")) issues.push("project exposes duplicate percentage field; progress should be the canonical percentage");

  assertSmoke(label, issues.length === 0, issues.join("; "));
}

function cloudinarySkipReason() {
  if (!HAS_CLOUDINARY_CONFIG) return "Cloudinary credentials are not configured in this smoke-test environment";
  if (!ENABLE_CLOUDINARY_UPLOAD_SMOKE) return "set SMOKE_ENABLE_CLOUDINARY_UPLOADS=true to explicitly allow external Cloudinary uploads";
  return "Cloudinary upload smoke tests are disabled";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notificationItems(payload) {
  return Array.isArray(payload?.data?.notifications) ? payload.data.notifications : [];
}

// Minimal valid PNG (1x1 pixel, red)
const tinyPngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

// Minimal valid JPEG
const tinyJpegBuffer = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM', 'base64');

// Generic binary buffer for non-image file uploads
const tinyBinaryBuffer = Buffer.from('Hello, this is a test file for upload.', 'utf-8');

// ─── auth helpers ─────────────────────────────────────────────────────────────

async function loginAs(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const rawCookie = res.headers.get("set-cookie") || "";
  const match = rawCookie.match(/auth_token=([^;]+)/);
  return { status: res.status, cookie: match ? `auth_token=${match[1]}` : "" };
}

async function login() {
  console.log("\n[AUTH]");
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  const rawCookie = res.headers.get("set-cookie") || "";
  const match = rawCookie.match(/auth_token=([^;]+)/);
  const cookie = match ? `auth_token=${match[1]}` : "";

  if (res.status === 200 && cookie) {
    authCookie = cookie;
    ok("POST /api/auth/login", 200);
    return true;
  }
  bad("POST /api/auth/login", res.status, `aborting: ${JSON.stringify(json)}`);
  return false;
}

// ─── test suites ──────────────────────────────────────────────────────────────

async function testHealth() {
  console.log("\n[HEALTH]");
  await check("GET  /api/health", "GET", "/api/health");
  await check("POST /api/health/redis/flush", "POST", "/api/health/redis/flush", null, { expect: [200] });

  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      headers: { Origin: "https://definitely-not-allowed.smoke.invalid" },
    });
    const exposedOrigin = res.headers.get("access-control-allow-origin") || "";
    assertSmoke(
      "GET  /api/health disallowed CORS origin is cleanly rejected",
      res.status === 403 && exposedOrigin === "",
      `expected 403 without access-control-allow-origin, received ${res.status} / ${exposedOrigin || "<none>"}`,
    );
  } catch (err) {
    bad("GET  /api/health disallowed CORS origin is cleanly rejected", 0, err.message);
  }
}

async function testProfilePictureEndpoints() {
  await checkMultipart(
    "PUT  /api/user/profile/picture (missing file) → 400",
    "PUT",
    "/api/user/profile/picture",
    {},
    { expect: [400] },
  );
  await checkMultipart(
    "PUT  /api/user/profile/picture rejects SVG MIME → 400",
    "PUT",
    "/api/user/profile/picture",
    {
      files: [{ name: "picture", filename: "avatar.svg", contentType: "image/svg+xml", content: Buffer.from("<svg></svg>") }],
    },
    { expect: [400] },
  );
  await checkMultipart(
    "PUT  /api/user/profile/picture rejects invalid JPEG content → 400",
    "PUT",
    "/api/user/profile/picture",
    {
      files: [{ name: "picture", filename: "avatar.jpg", contentType: "image/jpeg", content: Buffer.from("not a real jpeg") }],
    },
    { expect: [400] },
  );

  if (!SHOULD_RUN_CLOUDINARY_UPLOADS) {
    skipSmoke("PUT  /api/user/profile/picture valid upload", cloudinarySkipReason());
    return;
  }

  const uploaded = await checkMultipart(
    "PUT  /api/user/profile/picture uploads valid PNG",
    "PUT",
    "/api/user/profile/picture",
    {
      files: [{ name: "picture", filename: "avatar.png", contentType: "image/png", content: tinyPngBuffer }],
    },
  );
  assertSmoke(
    "PUT  /api/user/profile/picture returns avatarUrl",
    typeof uploaded?.data?.profile?.avatarUrl === "string" && uploaded.data.profile.avatarUrl.startsWith("http"),
    `expected avatarUrl string, received ${JSON.stringify(uploaded?.data?.profile?.avatarUrl)}`,
  );
  await check("DELETE /api/user/profile/picture removes uploaded picture", "DELETE", "/api/user/profile/picture", null, { expect: [200] });
}

async function testUser() {
  console.log("\n[USER]");
  await check("GET  /api/user/profile", "GET", "/api/user/profile");
  await testProfilePictureEndpoints();
}

function assertDashboardUsesTotalLeadAndTaskMetrics(label, metrics) {
  const issues = [];

  if (typeof metrics?.totalLeads?.value !== "number") issues.push("totalLeads.value is not numeric");
  if (typeof metrics?.totalTasks?.value !== "number") issues.push("totalTasks.value is not numeric");
  if (Object.prototype.hasOwnProperty.call(metrics || {}, "newLeads")) issues.push("obsolete newLeads metric is present");
  if (Object.prototype.hasOwnProperty.call(metrics || {}, "pendingTasks")) issues.push("obsolete pendingTasks metric is present");

  assertSmoke(label, issues.length === 0, issues.join("; "));
}

async function testDashboard() {
  console.log("\n[DASHBOARD]");
  const metrics = await check("GET  /api/dashboard/metrics", "GET", "/api/dashboard/metrics");
  assertDashboardUsesTotalLeadAndTaskMetrics(
    "GET  /api/dashboard/metrics exposes Total Leads/Total Tasks only",
    metrics?.data,
  );
  await check("GET  /api/dashboard/performance", "GET", "/api/dashboard/performance");
  await check("GET  /api/dashboard/projects/in-progress", "GET", "/api/dashboard/projects/in-progress");
  await check("GET  /api/dashboard/activities", "GET", "/api/dashboard/activities");
}

async function testProjectClientPopulation() {
  const suffix = Date.now();
  let clientId = null;
  let projectId = null;
  let clientAlreadyDeleted = false;

  const createdClient = await check(
    "POST /api/clients (project client smoke fixture)",
    "POST",
    "/api/clients",
    {
      fullName: "Smoke Project Client",
      companyName: `Smoke Client Co ${suffix}`,
      email: `smoke-project-client-${suffix}@test.local`,
      phone: "+2348000000000",
      status: "Active",
      tags: ["smoke", "project-client"],
      notes: "Temporary client for project client population smoke coverage",
    },
    { expect: [201] }
  );
  clientId = createdClient?.data?.client?.id;

  if (!clientId) {
    skipSmoke("PROJECT CLIENT POPULATION fixture", "could not create client fixture");
    return;
  }

  const createdProject = await check(
    "POST /api/projects (client population fixture)",
    "POST",
    "/api/projects",
    {
      name: `Smoke Client Population ${suffix}`,
      clientId,
      description: "Temporary project for project client population smoke coverage",
      deadline: Date.now() + 86400000,
      budget: 1000,
      priority: "Low",
      status: "Planned",
      teamIds: [],
    },
    { expect: [201] }
  );
  projectId = createdProject?.data?.project?.id;

  if (!projectId) {
    skipSmoke("PROJECT CLIENT POPULATION fixture", "could not create project fixture");
    await check("DELETE /api/clients/:id (project fixture cleanup)", "DELETE", `/api/clients/${clientId}`, null, { expect: [200] });
    return;
  }

  const listRes = await check(
    "GET  /api/projects includes populated client fixture",
    "GET",
    `/api/projects?status=Planned&limit=10`
  );
  const listProject = findProjectById(listRes?.data?.projects, projectId);
  assertProjectHasClientDetails("GET  /api/projects client is full object", listProject, clientId);

  const detailRes = await check(
    "GET  /api/projects/:id includes populated client fixture",
    "GET",
    `/api/projects/${projectId}`
  );
  assertProjectHasClientDetails("GET  /api/projects/:id client is full object", detailRes?.data?.project, clientId);
  assertSmoke(
    "GET  /api/projects/:id comments are included from detail aggregate",
    Array.isArray(detailRes?.data?.project?.comments),
    "project detail response did not include comments array"
  );

  await check("DELETE /api/clients/:id (orphan project edge fixture)", "DELETE", `/api/clients/${clientId}`, null, { expect: [200] });
  clientAlreadyDeleted = true;

  const orphanDetailRes = await check(
    "GET  /api/projects/:id orphaned client edge",
    "GET",
    `/api/projects/${projectId}`
  );
  assertProjectHasNullClient("GET  /api/projects/:id missing client returns null", orphanDetailRes?.data?.project, clientId);

  const orphanListRes = await check(
    "GET  /api/projects orphaned client edge",
    "GET",
    `/api/projects?status=Planned&limit=10`
  );
  const orphanListProject = findProjectById(orphanListRes?.data?.projects, projectId);
  assertProjectHasNullClient("GET  /api/projects missing client returns null", orphanListProject, clientId);

  if (projectId) {
    await check("DELETE /api/projects/:id (project fixture cleanup)", "DELETE", `/api/projects/${projectId}`, null, { expect: [204] });
  }
  if (clientId && !clientAlreadyDeleted) {
    await check("DELETE /api/clients/:id (project fixture cleanup)", "DELETE", `/api/clients/${clientId}`, null, { expect: [200] });
  }
}

async function testProjectTaskDerivedProgress() {
  const suffix = Date.now();
  let clientId;
  let projectId;
  let firstTaskId;
  let secondTaskId;

  const adminRes = await req("GET", "/api/user/profile");
  const adminId = adminRes.json?.data?.profile?.userId;

  if (!adminId) {
    skipSmoke("PROJECT TASK PROGRESS fixture", "could not resolve current admin user ID");
    return;
  }

  const createdClient = await check(
    "POST /api/clients (project task progress fixture)",
    "POST",
    "/api/clients",
    {
      fullName: "Smoke Progress Client",
      companyName: `Smoke Progress Co ${suffix}`,
      email: `smoke-project-progress-${suffix}@test.local`,
      phone: "+2348000000001",
      status: "Active",
      tags: ["smoke", "project-progress"],
      notes: "Temporary client for task-derived project progress smoke coverage",
    },
    { expect: [201] }
  );
  clientId = createdClient?.data?.client?.id;

  if (!clientId) {
    skipSmoke("PROJECT TASK PROGRESS fixture", "could not create client fixture");
    return;
  }

  const createdProject = await check(
    "POST /api/projects (task-derived progress fixture)",
    "POST",
    "/api/projects",
    {
      name: `Smoke Task Progress ${suffix}`,
      clientId,
      description: "Temporary project for task-derived progress smoke coverage",
      deadline: Date.now() + 604800000,
      budget: 2500,
      priority: "Medium",
      status: "Planned",
      teamIds: [],
    },
    { expect: [201] }
  );
  projectId = createdProject?.data?.project?.id;

  if (!projectId) {
    skipSmoke("PROJECT TASK PROGRESS fixture", "could not create project fixture");
    if (clientId) await check("DELETE /api/clients/:id (project progress fixture cleanup)", "DELETE", `/api/clients/${clientId}`, null, { expect: [200] });
    return;
  }

  const firstTask = await check(
    "POST /api/tasks (project progress todo task)",
    "POST",
    "/api/tasks",
    {
      title: `Smoke progress todo ${suffix}`,
      description: "Project progress should count this as incomplete",
      assigneeId: adminId,
      dueDate: Date.now() + 86400000,
      status: "Todo",
      projectId,
      priority: "medium",
    },
    { expect: [201] }
  );
  firstTaskId = firstTask?.data?.task?.id;

  const secondTask = await check(
    "POST /api/tasks (project progress done task)",
    "POST",
    "/api/tasks",
    {
      title: `Smoke progress done ${suffix}`,
      description: "Project progress should count this as complete",
      assigneeId: adminId,
      dueDate: Date.now() + 172800000,
      status: "Done",
      projectId,
      priority: "medium",
    },
    { expect: [201] }
  );
  secondTaskId = secondTask?.data?.task?.id;

  if (firstTaskId && secondTaskId) {
    const halfCompleteDetail = await check(
      "GET  /api/projects/:id task-derived progress half complete",
      "GET",
      `/api/projects/${projectId}`
    );
    assertProjectTaskProgress(
      "GET  /api/projects/:id derives progress from completed/total tasks",
      halfCompleteDetail?.data?.project,
      { totalTasks: 2, completedTasks: 1, progress: 50, status: "InProgress" }
    );

    await check("PATCH /api/projects/:id rejects manual progress", "PATCH", `/api/projects/${projectId}`, { progress: 10 }, { expect: [400] });
    await check("PUT  /api/projects/:id is not supported", "PUT", `/api/projects/${projectId}`, { progress: 25 }, { expect: [404] });

    await check("PATCH /api/tasks/:id completes remaining project task", "PATCH", `/api/tasks/${firstTaskId}`, { status: "Done" });
    const completeDetail = await check(
      "GET  /api/projects/:id task-derived progress complete",
      "GET",
      `/api/projects/${projectId}`
    );
    assertProjectTaskProgress(
      "GET  /api/projects/:id auto-completes project at 100 percent",
      completeDetail?.data?.project,
      { totalTasks: 2, completedTasks: 2, progress: 100, status: "Completed" }
    );

    await check("PATCH /api/tasks/:id reopens project task", "PATCH", `/api/tasks/${secondTaskId}`, { status: "InProgress" });
    const reopenedDetail = await check(
      "GET  /api/projects/:id task-derived progress after reopen",
      "GET",
      `/api/projects/${projectId}`
    );
    assertProjectTaskProgress(
      "GET  /api/projects/:id recalculates progress when a task is reopened",
      reopenedDetail?.data?.project,
      { totalTasks: 2, completedTasks: 1, progress: 50, status: "InProgress" }
    );
  } else {
    skipSmoke("PROJECT TASK PROGRESS task fixtures", "could not create both linked tasks");
  }

  let projectDeleted = false;
  if (projectId) {
    const deleteProjectRes = await req("DELETE", `/api/projects/${projectId}`);
    if (deleteProjectRes.status === 204) {
      projectDeleted = true;
      ok("DELETE /api/projects/:id cascades linked tasks (project progress fixture cleanup)", deleteProjectRes.status);
    } else {
      bad("DELETE /api/projects/:id cascades linked tasks (project progress fixture cleanup)", deleteProjectRes.status, deleteProjectRes.json?.message || "unexpected status");
    }
  }

  if (projectDeleted) {
    if (firstTaskId) await check("GET  /api/tasks/:id after project delete → 404", "GET", `/api/tasks/${firstTaskId}`, null, { expect: [404] });
    if (secondTaskId) await check("GET  /api/tasks/:id after project delete → 404", "GET", `/api/tasks/${secondTaskId}`, null, { expect: [404] });
  } else {
    if (firstTaskId) await check("DELETE /api/tasks/:id (project progress fixture cleanup)", "DELETE", `/api/tasks/${firstTaskId}`, null, { expect: [200, 404] });
    if (secondTaskId) await check("DELETE /api/tasks/:id (project progress fixture cleanup)", "DELETE", `/api/tasks/${secondTaskId}`, null, { expect: [200, 404] });
  }

  if (clientId) await check("DELETE /api/clients/:id (project progress fixture cleanup)", "DELETE", `/api/clients/${clientId}`, null, { expect: [200] });
}

async function testProjectFiles(projectId) {
  if (!projectId) {
    skipSmoke("PROJECT FILE ENDPOINTS", "no project ID available");
    return;
  }

  // GET — list files for a project (empty initially)
  const listEmpty = await check("GET  /api/projects/:id/files (empty)", "GET", `/api/projects/${projectId}/files`);
  assertSmoke(
    "GET  /api/projects/:id/files returns empty list",
    Array.isArray(listEmpty?.data?.files) && listEmpty.data.files.length === 0,
    `expected empty files array, received ${JSON.stringify(listEmpty?.data?.files)}`
  );

  // POST — missing file → 400
  await checkMultipart(
    "POST /api/projects/:id/files (missing file) → 400",
    "POST",
    `/api/projects/${projectId}/files`,
    {},
    { expect: [400] },
  );

  if (!SHOULD_RUN_CLOUDINARY_UPLOADS) {
    skipSmoke("POST /api/projects/:id/files valid upload", cloudinarySkipReason());
  } else {
    const uploaded = await checkMultipart(
      "POST /api/projects/:id/files uploads valid binary",
      "POST",
      `/api/projects/${projectId}/files`,
      {
        files: [{ name: "file", filename: "project-file.txt", contentType: "text/plain", content: tinyBinaryBuffer }],
      },
      { expect: [201] }
    );
    const fileId = uploaded?.data?.file?.id;

    if (fileId) {
      const listAfterUpload = await check("GET  /api/projects/:id/files (after upload)", "GET", `/api/projects/${projectId}/files`);
      assertSmoke(
        "GET  /api/projects/:id/files returns uploaded file",
        Array.isArray(listAfterUpload?.data?.files) && listAfterUpload.data.files.some(f => f?.id === fileId),
        `expected file in array, received ${JSON.stringify(listAfterUpload?.data?.files)}`
      );
      await check("DELETE /api/projects/:id/files/:fileId", "DELETE", `/api/projects/${projectId}/files/${fileId}`, null, { expect: [200] });
    }
  }

  // DELETE — unknown file → 404
  await check("DELETE /api/projects/:id/files/:fileId (not found) → 404", "DELETE", `/api/projects/${projectId}/files/no-such-file-id`, null, { expect: [404] });

  // POST — register a file via URL and then POST it to the project (simulated)
  // We use the "register file URL" endpoint + then call our project file endpoints with URL approach
  // Actually, let's register a file URL first via media route, then try to add it to the project
  const suffix = Date.now();
  const registered = await check(
    "POST /api/media/files/url (project file fixture)",
    "POST",
    "/api/media/files/url",
    {
      url: `https://cdn.example.com/project-smoke-${suffix}.pdf`,
      fileName: `project-smoke-${suffix}.pdf`,
      type: "document",
      mimeType: "application/pdf",
      sizeBytes: 42,
    },
    { expect: [201] }
  );
  const registeredFileId = registered?.data?.file?.id;

  if (!registeredFileId) {
    skipSmoke("POST /api/projects/:id/files URL fixture", "could not register file URL fixture");
    return;
  }

  // We can't attach the registered URL file to the project via the POST upload endpoint (requires multipart),
  // but we can verify the DELETE and list flows

  // List to confirm the file is not associated with our project
  const listAfterMedia = await check("GET  /api/projects/:id/files (still empty)", "GET", `/api/projects/${projectId}/files`);
  assertSmoke(
    "GET  /api/projects/:id/files still empty after unrelated media creation",
    Array.isArray(listAfterMedia?.data?.files) && listAfterMedia.data.files.length === 0,
    `expected empty, received ${JSON.stringify(listAfterMedia?.data?.files)}`
  );

  // Clean up the registered file
  await check("DELETE /api/media/files/:id (project file fixture cleanup)", "DELETE", `/api/media/files/${registeredFileId}`, null, { expect: [200] });
}

async function testProjects() {
  console.log("\n[PROJECTS]");
  await check("GET  /api/projects/stats", "GET", "/api/projects/stats");
  const res = await check("GET  /api/projects", "GET", "/api/projects");
  const projectId = res?.data?.projects?.[0]?.id;
  const projectWithClient = res?.data?.projects?.find((project) => project?.clientId && project?.client);

  if (projectWithClient) {
    assertProjectHasClientDetails("GET  /api/projects existing row has populated client", projectWithClient, projectWithClient.clientId);
  } else {
    skipSmoke("GET  /api/projects existing row has populated client", "no project with client details available in list response");
  }

  if (projectId) {
    const detail = await check(`GET  /api/projects/:id`, "GET", `/api/projects/${projectId}`);
    if (detail?.data?.project?.clientId && detail?.data?.project?.client) {
      assertProjectHasClientDetails("GET  /api/projects/:id existing row has populated client", detail.data.project, detail.data.project.clientId);
    }
    await check("GET  /api/projects/:id/comments", "GET", `/api/projects/${projectId}/comments`);
    await check("POST /api/projects/:id/comments", "POST", `/api/projects/${projectId}/comments`, { comment: "Smoke test comment" }, { expect: [204] });
    await check("PATCH /api/projects/:id (financials)", "PATCH", `/api/projects/${projectId}`, { budget: 9999 }, { expect: [200] });
  } else {
    skipSmoke("GET  /api/projects/:id", "no project ID available");
    skipSmoke("GET  /api/projects/:id/comments", "no project ID available");
    skipSmoke("POST /api/projects/:id/comments", "no project ID available");
    skipSmoke("PATCH /api/projects/:id (financials)", "no project ID available");
  }

  const emptyStatus = `smoke-empty-status-${Date.now()}`;
  const emptyRes = await check(
    "GET  /api/projects empty filtered list edge",
    "GET",
    `/api/projects?status=${encodeURIComponent(emptyStatus)}&limit=5`
  );
  assertSmoke(
    "GET  /api/projects empty filter returns empty projects array",
    Array.isArray(emptyRes?.data?.projects) && emptyRes.data.projects.length === 0,
    `expected empty array, received ${JSON.stringify(emptyRes?.data?.projects)}`
  );
  assertSmoke(
    "GET  /api/projects empty filter still returns global infoData",
    typeof emptyRes?.data?.infoData?.totalProjects === "number",
    "infoData.totalProjects missing or not numeric"
  );

  await testProjectClientPopulation();
  await testProjectTaskDerivedProgress();

  // Project file endpoints
  await testProjectFiles(projectId);

  // PATCH — progress is derived from linked tasks and cannot be set manually
  if (projectId) {
    await check("PATCH /api/projects/:id rejects manual progress", "PATCH", `/api/projects/${projectId}`, { progress: 10 }, { expect: [400] });
  }
}

function assertClientDetailInsights(label, detail, expected = {}) {
  const client = detail?.data?.client;
  const issues = [];

  if (!isPlainObject(client)) issues.push("client detail is not an object");
  if (!Object.prototype.hasOwnProperty.call(client || {}, "lastActivity")) issues.push("lastActivity key is missing");
  if (!Array.isArray(client?.projects)) issues.push("projects is not an array");
  if (!Array.isArray(client?.notesHistory)) issues.push("notesHistory is not an array");
  if (!isPlainObject(client?.quickInsights)) issues.push("quickInsights is not an object");
  if (typeof client?.projectsCount !== "number") issues.push("projectsCount is not numeric");
  if (typeof client?.quickInsights?.totalProjects !== "number") issues.push("quickInsights.totalProjects is not numeric");
  if (typeof client?.quickInsights?.activeProjects !== "number") issues.push("quickInsights.activeProjects is not numeric");
  if (client?.projectsCount !== client?.quickInsights?.totalProjects) issues.push("projectsCount does not match quickInsights.totalProjects");

  if (expected.projectId && !client?.projects?.some((project) => project?.id === expected.projectId)) {
    issues.push(`associated project ${expected.projectId} is missing from projects array`);
  }
  if (expected.totalProjects !== undefined && client?.projectsCount !== expected.totalProjects) {
    issues.push(`projectsCount expected ${expected.totalProjects}, received ${client?.projectsCount}`);
  }
  if (expected.activeProjects !== undefined && client?.quickInsights?.activeProjects !== expected.activeProjects) {
    issues.push(`quickInsights.activeProjects expected ${expected.activeProjects}, received ${client?.quickInsights?.activeProjects}`);
  }
  if (expected.noteSubstring && !String(client?.notes || "").includes(expected.noteSubstring)) {
    issues.push(`notes does not include ${expected.noteSubstring}`);
  }
  if (expected.noteSubstring && !client?.notesHistory?.some((entry) => entry?.note === expected.noteSubstring)) {
    issues.push(`notesHistory does not include appended note ${expected.noteSubstring}`);
  }
  if (expected.requireLastActivity && !client?.lastActivity?.createdAt) {
    issues.push("lastActivity is missing or does not include createdAt");
  }

  assertSmoke(label, issues.length === 0, issues.join("; "));
}

async function testClientDetailInsights() {
  const suffix = Date.now();
  let clientId = null;
  let projectId = null;
  const initialNote = `Initial smoke note ${suffix}`;
  const appendedNote = `Appended smoke note ${suffix}`;

  try {
    const createdClient = await check(
      "POST /api/clients (client detail insights fixture)",
      "POST",
      "/api/clients",
      {
        fullName: "Smoke Detail Client",
        companyName: `Smoke Detail Co ${suffix}`,
        email: `smoke-client-detail-${suffix}@test.local`,
        phone: "+2348000000400",
        status: "Active",
        tags: ["smoke", "client-detail"],
        notes: initialNote,
      },
      { expect: [201] },
    );
    clientId = createdClient?.data?.client?.id;

    if (!clientId) {
      skipSmoke("CLIENT DETAIL INSIGHTS fixture", "could not create client fixture");
      return;
    }

    const createdProject = await check(
      "POST /api/projects (client detail associated project fixture)",
      "POST",
      "/api/projects",
      {
        name: `Smoke Client Detail Project ${suffix}`,
        clientId,
        description: "Temporary project for client detail insight smoke coverage",
        deadline: Date.now() + 86400000,
        budget: 1500,
        priority: "Medium",
        status: "Planned",
        teamIds: [],
      },
      { expect: [201] },
    );
    projectId = createdProject?.data?.project?.id;

    if (!projectId) {
      skipSmoke("CLIENT DETAIL INSIGHTS project fixture", "could not create project fixture");
    }

    await check("PATCH /api/clients/:id appendNote", "PATCH", `/api/clients/${clientId}`, { appendNote: appendedNote });

    const detail = await check("GET  /api/clients/:id exposes detail insights", "GET", `/api/clients/${clientId}`);
    assertClientDetailInsights(
      "GET  /api/clients/:id exposes activity, projects, notes history, and quick insights",
      detail,
      {
        projectId,
        totalProjects: projectId ? 1 : 0,
        activeProjects: projectId ? 1 : 0,
        noteSubstring: appendedNote,
        requireLastActivity: true,
      },
    );
  } finally {
    if (projectId) await check("DELETE /api/projects/:id (client detail fixture cleanup)", "DELETE", `/api/projects/${projectId}`, null, { expect: [204, 404] });
    if (clientId) await check("DELETE /api/clients/:id (client detail fixture cleanup)", "DELETE", `/api/clients/${clientId}`, null, { expect: [200, 404] });
  }
}

async function testClients() {
  console.log("\n[CLIENTS]");
  await check("GET  /api/clients/stats", "GET", "/api/clients/stats");
  const res = await check("GET  /api/clients", "GET", "/api/clients");
  const clientId = res?.data?.clients?.[0]?.id;

  if (clientId) {
    const detail = await check("GET  /api/clients/:id", "GET", `/api/clients/${clientId}`);
    assertClientDetailInsights("GET  /api/clients/:id existing row exposes detail shape", detail);
    await check("PATCH /api/clients/:id", "PATCH", `/api/clients/${clientId}`, { notes: "smoke-test" });
  } else {
    skipSmoke("GET  /api/clients/:id", "no client ID available");
  }

  await testClientDetailInsights();
}

async function testMemberMutationEndpoints() {
  const suffix = Date.now();
  const staffEmail = `member-smoke-${suffix}@test.local`;
  const originalPassword = ORIGINAL_TEST_MEMBER_PASSWORD;
  const changedPassword = `${CHANGED_TEST_MEMBER_PASSWORD}${suffix}`;
  let memberId = null;

  try {
    const created = await check(
      "POST /api/members (member mutation fixture)",
      "POST",
      "/api/members",
      {
        firstName: "Member",
        lastName: "Smoke",
        email: staffEmail,
        phone: "+2348000000301",
        password: originalPassword,
        role: "staff",
        job: "Smoke Test Fixture",
      },
      { expect: [201] },
    );
    memberId = created?.data?.user?.userId;

    if (!memberId) {
      skipSmoke("PATCH /api/members/:id fixture", "could not create temporary member fixture");
      return;
    }

    await check("PATCH /api/members/:id", "PATCH", `/api/members/${memberId}`, { job: `smoke-${suffix}` });
    await check("PUT  /api/members/:id no longer allowed", "PUT", `/api/members/${memberId}`, { job: "legacy-put" }, { expect: [404] });

    const originalLogin = await loginAs(staffEmail, originalPassword);
    assertSmoke(
      "POST /api/auth/login (member original password)",
      originalLogin.status === 200 && Boolean(originalLogin.cookie),
      `expected 200 with auth cookie, received ${originalLogin.status}`,
    );

    await check("PUT  /api/members/:id/password", "PUT", `/api/members/${memberId}/password`, { password: changedPassword });

    const oldLogin = await loginAs(staffEmail, originalPassword);
    assertSmoke(
      "POST /api/auth/login old member password fails",
      oldLogin.status === 401 && !oldLogin.cookie,
      `expected 401 without auth cookie, received ${oldLogin.status}`,
    );

    const newLogin = await loginAs(staffEmail, changedPassword);
    assertSmoke(
      "POST /api/auth/login new member password succeeds",
      newLogin.status === 200 && Boolean(newLogin.cookie),
      `expected 200 with auth cookie, received ${newLogin.status}`,
    );

    await check("PUT  /api/members/:id/password (restore fixture password)", "PUT", `/api/members/${memberId}/password`, { password: originalPassword });
    const restoredLogin = await loginAs(staffEmail, originalPassword);
    assertSmoke(
      "POST /api/auth/login restored member password succeeds",
      restoredLogin.status === 200 && Boolean(restoredLogin.cookie),
      `expected 200 with auth cookie, received ${restoredLogin.status}`,
    );
  } finally {
    if (memberId) {
      await check("DELETE /api/members/:id (member fixture cleanup)", "DELETE", `/api/members/${memberId}`, null, { expect: [200] });
    }
  }
}

async function testMembers() {
  console.log("\n[MEMBERS]");
  await check("GET  /api/members", "GET", "/api/members");
  await testMemberMutationEndpoints();
}

async function testNotifications() {
  console.log("\n[NOTIFICATIONS]");
  const adminRes = await req("GET", "/api/user/profile");
  const adminId = adminRes.json?.data?.profile?.userId;
  let taskId = null;
  let staffCookie = null;
  let staffId = null;

  const initialList = await check("GET  /api/notifications", "GET", "/api/notifications?limit=20");
  assertSmoke(
    "GET  /api/notifications returns notification collection metadata",
    Array.isArray(initialList?.data?.notifications)
      && typeof initialList?.data?.unreadCount === "number"
      && typeof initialList?.data?.totalCount === "number",
    `received ${JSON.stringify(initialList?.data)}`,
  );

  try {
    // ── Per-user preferences (admin) ──
    function hasNestedPrefs(prefs) {
      return prefs && typeof prefs === 'object'
        && typeof prefs.TASK_ASSIGNMENT === 'object'
        && 'inApp' in prefs.TASK_ASSIGNMENT
        && 'email' in prefs.TASK_ASSIGNMENT;
    }
    const initialPreferences = await check("GET  /api/notifications/preferences", "GET", "/api/notifications/preferences");
    assertSmoke(
      "GET  /api/notifications/preferences returns resolved preference toggles for current user",
      initialPreferences?.data?.preferences
        && hasNestedPrefs(initialPreferences.data.preferences),
      `received ${JSON.stringify(initialPreferences?.data)}`,
    );

    const originalTaskAssignmentPreference = initialPreferences?.data?.preferences?.TASK_ASSIGNMENT || { inApp: true, email: true };
    const disabledPreferences = await check(
      "PUT  /api/notifications/preferences disables one type for current user",
      "PUT",
      "/api/notifications/preferences",
      { TASK_ASSIGNMENT: { inApp: true, email: false } },
    );
    assertSmoke(
      "PUT  /api/notifications/preferences accepts partial per-user toggles",
      disabledPreferences?.data?.preferences?.TASK_ASSIGNMENT?.email === false
        && typeof disabledPreferences?.data?.preferences?.PROJECT_STATUS_CHANGE?.inApp === "boolean",
      `received ${JSON.stringify(disabledPreferences?.data)}`,
    );

    const restoredPreferences = await check(
      "PUT  /api/notifications/preferences restores one user type",
      "PUT",
      "/api/notifications/preferences",
      { TASK_ASSIGNMENT: originalTaskAssignmentPreference },
    );
    assertSmoke(
      "PUT  /api/notifications/preferences preserves full preference response shape",
      restoredPreferences?.data?.preferences
        && hasNestedPrefs(restoredPreferences.data.preferences),
      `received ${JSON.stringify(restoredPreferences?.data)}`,
    );

    // ── Staff user: per-user preferences accessible ──
    const staffEmail = `staff-notif-${Date.now()}@test.local`;
    const staffPassword = "TestPassword123!";
    const createdStaff = await check(
      "POST /api/members (create staff user for notification tests)",
      "POST", "/api/members",
      { firstName: "Staff", lastName: "Notif", email: staffEmail, phone: "+2348000000340", password: staffPassword, role: "staff" },
      { expect: [201] },
    );
    staffId = createdStaff?.data?.user?.userId || null;

    if (staffId) {
      const staffLogin = await loginAs(staffEmail, staffPassword);
      staffCookie = staffLogin.cookie;

      if (staffCookie) {
        ok("POST /api/auth/login (staff for notification tests)", staffLogin.status);

        const staffPrefs = await checkWith("GET  /api/notifications/preferences (staff)", "GET", "/api/notifications/preferences", staffCookie);
        assertSmoke(
          "GET  /api/notifications/preferences returns resolved preferences for staff user",
          staffPrefs?.data?.preferences
            && hasNestedPrefs(staffPrefs.data.preferences),
          `received ${JSON.stringify(staffPrefs?.data)}`,
        );

        const staffUpdated = await checkWith(
          "PUT  /api/notifications/preferences (staff updates own)",
          "PUT",
          "/api/notifications/preferences",
          staffCookie,
          { TASK_ASSIGNMENT: { inApp: false, email: false } },
        );
        assertSmoke(
          "PUT  /api/notifications/preferences (staff) accepts partial toggles",
          staffUpdated?.data?.preferences?.TASK_ASSIGNMENT?.inApp === false,
          `received ${JSON.stringify(staffUpdated?.data)}`,
        );

      } else {
        bad("POST /api/auth/login (staff for notification tests)", staffLogin.status, "could not obtain staff cookie");
      }
    } else {
      skipSmoke("Staff notification preference tests", "could not create staff user fixture");
    }

    let notificationToMark = notificationItems(initialList).find((notification) => notification?.id && !notification?.isRead)
      || notificationItems(initialList).find((notification) => notification?.id)
      || null;

    if (!adminId) {
      skipSmoke("NOTIFICATION assignment trigger fixture", "could not resolve current admin user ID");
    } else {
      const suffix = Date.now();
      const createdTask = await check(
        "POST /api/tasks creates notification trigger fixture",
        "POST",
        "/api/tasks",
        {
          title: `Smoke notification assignment ${suffix}`,
          description: "Temporary task for notification smoke coverage",
          assigneeId: adminId,
          dueDate: Date.now() + 86400000,
          status: "Todo",
          priority: "medium",
        },
        { expect: [201] },
      );
      taskId = createdTask?.data?.task?.id || null;

      if (taskId) {
        await sleep(75);
        const triggeredList = await check(
          "GET  /api/notifications includes task assignment notification",
          "GET",
          "/api/notifications?unreadOnly=true&limit=50",
        );
        const triggeredNotification = notificationItems(triggeredList).find((notification) => notification?.referenceId === taskId);
        assertSmoke(
          "TASK_ASSIGNMENT notification is created for assigned user",
          Boolean(triggeredNotification && triggeredNotification.type === "TASK_ASSIGNMENT" && triggeredNotification.isRead === false),
          `taskId=${taskId}, notifications=${JSON.stringify(notificationItems(triggeredList).slice(0, 5))}`,
        );
        if (triggeredNotification?.id) notificationToMark = triggeredNotification;
      } else {
        skipSmoke("TASK_ASSIGNMENT notification trigger", "task fixture did not return an id");
      }
    }

    if (notificationToMark?.id) {
      const readOne = await check(
        notificationToMark.referenceId === taskId
          ? "PUT  /api/notifications/:id/read"
          : "PUT  /api/notifications/:id/read (existing fallback)",
        "PUT",
        `/api/notifications/${notificationToMark.id}/read`,
      );
      assertSmoke(
        "PUT  /api/notifications/:id/read marks one notification read",
        readOne?.data?.notification?.id === notificationToMark.id && readOne?.data?.notification?.isRead === true,
        `received ${JSON.stringify(readOne?.data?.notification)}`,
      );
    } else {
      skipSmoke("PUT  /api/notifications/:id/read", "no notification was available to mark as read");
    }

    const readAll = await check("PUT  /api/notifications/read-all", "PUT", "/api/notifications/read-all");
    assertSmoke(
      "PUT  /api/notifications/read-all returns modifiedCount",
      typeof readAll?.data?.modifiedCount === "number",
      `received ${JSON.stringify(readAll?.data)}`,
    );

    const unreadAfter = await check("GET  /api/notifications unread after read-all", "GET", "/api/notifications?unreadOnly=true&limit=20");
    assertSmoke(
      "PUT  /api/notifications/read-all clears unread notifications for current user",
      notificationItems(unreadAfter).length === 0 && unreadAfter?.data?.unreadCount === 0,
      `received ${JSON.stringify(unreadAfter?.data)}`,
    );
  } finally {
    if (taskId) {
      await check("DELETE /api/tasks/:id (notification fixture cleanup)", "DELETE", `/api/tasks/${taskId}`, null, { expect: [200, 404] });
    }
    if (staffId) {
      await check("DELETE /api/members/:id (staff notif fixture cleanup)", "DELETE", `/api/members/${staffId}`, null, { expect: [200] });
    }
  }
}

async function testTasks() {
  console.log("\n[TASKS]");
  const adminRes = await req("GET", "/api/user/profile");
  const adminId = adminRes.json?.data?.profile?.userId;

  const res = await check("GET  /api/tasks", "GET", "/api/tasks");
  const taskId = res?.data?.tasks?.[0]?.id;

  if (adminId) {
    const created = await check(
      "POST /api/tasks",
      "POST",
      "/api/tasks",
      { title: "Smoke test task", assigneeId: adminId, dueDate: Date.now() + 86400000 },
      { expect: [201] }
    );
    const newTaskId = created?.data?.task?.id;
    if (newTaskId) {
      const taskDetail = await check("GET  /api/tasks/:id", "GET", `/api/tasks/${newTaskId}`);
      assertSmoke(
        "GET  /api/tasks/:id returns assignee details",
        taskDetail?.data?.task?.assignee?.userId === adminId,
        `expected assignee.userId ${adminId}, received ${JSON.stringify(taskDetail?.data?.task?.assignee)}`
      );
      assertSmoke(
        "GET  /api/tasks/:id returns project key even when unassigned",
        Object.prototype.hasOwnProperty.call(taskDetail?.data?.task || {}, "project") && taskDetail.data.task.project === null,
        `expected project null, received ${JSON.stringify(taskDetail?.data?.task?.project)}`
      );
      assertSmoke(
        "GET  /api/tasks/:id hides MongoDB _id",
        !Object.prototype.hasOwnProperty.call(taskDetail?.data?.task || {}, "_id"),
        "task detail response exposed _id"
      );
      await check("PATCH /api/tasks/:id", "PATCH", `/api/tasks/${newTaskId}`, { status: "Done" });
      const patchedTaskDetail = await check("GET  /api/tasks/:id after PATCH", "GET", `/api/tasks/${newTaskId}`);
      assertSmoke(
        "PATCH /api/tasks/:id persists changes",
        patchedTaskDetail?.data?.task?.status === "Done",
        `expected status Done, received ${patchedTaskDetail?.data?.task?.status}`
      );
      await check("PUT  /api/tasks/:id no longer allowed", "PUT", `/api/tasks/${newTaskId}`, { status: "InProgress" }, { expect: [404] });
      await check("DELETE /api/tasks/:id", "DELETE", `/api/tasks/${newTaskId}`);
    }
  }

  if (taskId) {
    await check("GET  /api/tasks/:id (existing)", "GET", `/api/tasks/${taskId}`);
    await check("PATCH /api/tasks/:id (existing)", "PATCH", `/api/tasks/${taskId}`, { status: "InProgress" });
  }
}

async function testLeads() {
  console.log("\n[LEADS]");
  const res = await check("GET  /api/leads", "GET", "/api/leads");
  const leadId = res?.data?.leads?.[0]?.id;

  const created = await check(
    "POST /api/leads",
    "POST",
    "/api/leads",
    { firstName: "Smoke", lastName: "Test", email: `smoke-${Date.now()}@test.com` },
    { expect: [201] }
  );
  const newLeadId = created?.data?.lead?.id;

  const idToTest = newLeadId || leadId;
  if (idToTest) {
    await check("GET  /api/leads/:id", "GET", `/api/leads/${idToTest}`);
    await check("PATCH /api/leads/:id", "PATCH", `/api/leads/${idToTest}`, { status: "contacted" });
    if (newLeadId) {
      await check("DELETE /api/leads/:id", "DELETE", `/api/leads/${newLeadId}`);
    }
  }
}

async function testBlogAdmin() {
  const adminRes = await req("GET", "/api/user/profile");
  const adminId = adminRes.json?.data?.profile?.userId;

  if (!adminId) {
    skipSmoke("POST /api/blog (blog admin)", "no admin user ID available");
    return;
  }
  
  const suffix = Date.now();
  const createdPost = await check(
    "POST /api/blog creates a post",
    "POST",
    "/api/blog",
    {
      title: `Smoke Blog Post ${suffix}`,
      content: "This is a smoke test post.",
      category: "Technology",
      tags: ["smoke", "test"],
      status: "published",
      authorId: adminId,
    },
    { expect: [201] }
  );
  
  const newPostId = createdPost?.data?.post?.id;
  const newPostSlug = createdPost?.data?.post?.slug;

  if (newPostId) {
    const updatedPost = await check("PUT  /api/blog/:id updates the post", "PUT", `/api/blog/${newPostId}`, { title: `Updated Smoke Blog ${suffix}` }, { expect: [200] });
    const currentPostSlug = updatedPost?.data?.post?.slug || newPostSlug;
    
    await testBlogEmbedTracking(currentPostSlug);

    await check("DELETE /api/blog/:id deletes the post", "DELETE", `/api/blog/${newPostId}`, null, { expect: [200] });
  }
}

async function testBlogEmbedTracking(slug) {
  if (!slug) {
    skipSmoke("GET  /embed/:slug and track", "no slug available");
    return;
  }
  await check("POST /api/blog/track/:slug tracks view", "POST", `/api/blog/track/${slug}`, {}, { expect: [200] });
  
  const embedRes = await req("GET", `/embed/${slug}`);
  assertSmoke("GET  /embed/:slug returns embed HTML", embedRes.status === 200 && embedRes.headers.get("content-type")?.includes("text/html"), `received ${embedRes.status}`);
}

async function testBlog() {
  console.log("\n[BLOG]");
  await check("GET  /api/blog/stats", "GET", "/api/blog/stats");
  const res = await check("GET  /api/blog", "GET", "/api/blog");
  const postId = res?.data?.posts?.[0]?.id;

  if (postId) {
    await check("GET  /api/blog/:id", "GET", `/api/blog/${postId}`);
  } else {
    skipSmoke("GET  /api/blog/:id", "no post ID available");
  }

  await testBlogAdmin();
}

async function testAnalytics() {
  console.log("\n[ANALYTICS]");
  await check("GET  /api/analytics/overview", "GET", "/api/analytics/overview");
  await check("GET  /api/analytics/traffic", "GET", "/api/analytics/traffic");
  await check("GET  /api/analytics/sources", "GET", "/api/analytics/sources");
  await check("GET  /api/analytics/campaigns", "GET", "/api/analytics/campaigns");
  await check("GET  /api/analytics/distribution", "GET", "/api/analytics/distribution");
}

async function testRevenue() {
  console.log("\n[REVENUE]");
  await check("GET  /api/revenue", "GET", "/api/revenue");
  await check("GET  /api/revenue/dashboard", "GET", "/api/revenue/dashboard");
}

async function testPayments() {
  console.log("\n[PAYMENTS]");
  const res = await check("GET  /api/payments", "GET", "/api/payments");
  let paymentId = res?.data?.payments?.[0]?.id;

  if (paymentId) {
    await check("GET  /api/payments/:id", "GET", `/api/payments/${paymentId}`);
  } else {
    skipSmoke("GET  /api/payments/:id", "no payment ID available");
  }

  const suffix = Date.now();
  let clientId = null;
  let projectId = null;
  let mismatchClientId = null;
  let idOnlyPaymentId = null;

  try {
    const client = await check(
      "POST /api/clients (payment ID fixture)",
      "POST",
      "/api/clients",
      {
        fullName: "Smoke Payment Client",
        companyName: `Smoke Payment Co ${suffix}`,
        email: `smoke-payment-${suffix}@test.local`,
        phone: "+2348000000200",
        status: "Active",
        tags: ["smoke", "payment"],
      },
      { expect: [201] },
    );
    clientId = client?.data?.client?.id;

    if (!clientId) {
      skipSmoke("POST /api/payments ID-only fixture", "could not create client fixture");
      return;
    }

    const project = await check(
      "POST /api/projects (payment ID fixture)",
      "POST",
      "/api/projects",
      {
        name: `Smoke Payment Project ${suffix}`,
        clientId,
        description: "Temporary project for payment ID-only smoke coverage",
        deadline: Date.now() + 86400000,
        budget: 1200,
        priority: "Medium",
        status: "Planned",
        teamIds: [],
      },
      { expect: [201] },
    );
    projectId = project?.data?.project?.id;

    if (!projectId) {
      skipSmoke("POST /api/payments ID-only fixture", "could not create project fixture");
      return;
    }

    const mismatchClient = await check(
      "POST /api/clients (payment mismatch fixture)",
      "POST",
      "/api/clients",
      {
        fullName: "Smoke Payment Mismatch Client",
        companyName: `Smoke Payment Mismatch Co ${suffix}`,
        email: `smoke-payment-mismatch-${suffix}@test.local`,
        phone: "+2348000000201",
        status: "Active",
        tags: ["smoke", "payment-mismatch"],
      },
      { expect: [201] },
    );
    mismatchClientId = mismatchClient?.data?.client?.id || null;

    await check(
      "POST /api/payments rejects legacy name/alias relationship fields → 400",
      "POST",
      "/api/payments",
      {
        clientName: "Legacy Client",
        projectName: "Legacy Project",
        project: "Legacy Project Alias",
        amount: 1,
        date: Date.now(),
      },
      { expect: [400] },
    );
    await check(
      "POST /api/payments rejects invalid clientId → 404",
      "POST",
      "/api/payments",
      { clientId: `missing-client-${suffix}`, projectId, amount: 1, date: Date.now() },
      { expect: [404] },
    );
    await check(
      "POST /api/payments rejects invalid projectId → 404",
      "POST",
      "/api/payments",
      { clientId, projectId: `missing-project-${suffix}`, amount: 1, date: Date.now() },
      { expect: [404] },
    );
    if (mismatchClientId) {
      await check(
        "POST /api/payments rejects project/client mismatch → 409",
        "POST",
        "/api/payments",
        { clientId: mismatchClientId, projectId, amount: 1, date: Date.now() },
        { expect: [409] },
      );
    } else {
      skipSmoke("POST /api/payments rejects project/client mismatch → 409", "could not create mismatch client fixture");
    }

    const amount = 987.65;
    const idOnlyPayment = await check(
      "POST /api/payments accepts ID-only client/project references",
      "POST",
      "/api/payments",
      {
        clientId,
        projectId,
        amount,
        status: "Paid",
        date: Date.now(),
        source: "Smoke Test",
        notes: "ID-only payment smoke probe",
      },
      { expect: [201] },
    );
    const createdPayment = idOnlyPayment?.data?.payment;
    idOnlyPaymentId = createdPayment?.id || null;
    assertSmoke(
      "POST /api/payments stores and returns ID-only relationship fields",
      createdPayment?.clientId === clientId
        && createdPayment?.projectId === projectId
        && !Object.prototype.hasOwnProperty.call(createdPayment || {}, "clientName")
        && !Object.prototype.hasOwnProperty.call(createdPayment || {}, "projectName")
        && !Object.prototype.hasOwnProperty.call(createdPayment || {}, "project")
        && !Object.prototype.hasOwnProperty.call(createdPayment || {}, "client"),
      `received ${JSON.stringify(createdPayment)}`,
    );

    if (idOnlyPaymentId) {
      await check("PATCH /api/payments/:id rejects clientName → 400", "PATCH", `/api/payments/${idOnlyPaymentId}`, { clientName: "Legacy Client" }, { expect: [400] });
      await check("PATCH /api/payments/:id rejects projectName → 400", "PATCH", `/api/payments/${idOnlyPaymentId}`, { projectName: "Legacy Project" }, { expect: [400] });
      await check("PATCH /api/payments/:id rejects project alias → 400", "PATCH", `/api/payments/${idOnlyPaymentId}`, { project: "Legacy Project Alias" }, { expect: [400] });
      await check("PATCH /api/payments/:id rejects invalid clientId → 404", "PATCH", `/api/payments/${idOnlyPaymentId}`, { clientId: `missing-client-${suffix}` }, { expect: [404] });
      await check("PATCH /api/payments/:id rejects invalid projectId → 404", "PATCH", `/api/payments/${idOnlyPaymentId}`, { projectId: `missing-project-${suffix}` }, { expect: [404] });
      if (mismatchClientId) {
        await check("PATCH /api/payments/:id rejects project/client mismatch → 409", "PATCH", `/api/payments/${idOnlyPaymentId}`, { clientId: mismatchClientId }, { expect: [409] });
      }
    }

    const performance = await check("GET  /api/dashboard/performance includes paid payment", "GET", "/api/dashboard/performance?period=3months");
    const performanceRevenueTotal = (performance?.data?.revenueSeries || []).reduce((sum, value) => sum + Number(value || 0), 0);
    assertSmoke(
      "GET  /api/dashboard/performance revenue reflects paid payment",
      performanceRevenueTotal >= amount,
      `expected revenue total >= ${amount}, received ${performanceRevenueTotal}`,
    );
  } finally {
    if (idOnlyPaymentId) await check("DELETE /api/payments/:id (payment ID fixture cleanup)", "DELETE", `/api/payments/${idOnlyPaymentId}`, null, { expect: [200, 404] });
    if (projectId) await check("DELETE /api/projects/:id (payment ID fixture cleanup)", "DELETE", `/api/projects/${projectId}`, null, { expect: [204, 404] });
    if (mismatchClientId) await check("DELETE /api/clients/:id (payment mismatch fixture cleanup)", "DELETE", `/api/clients/${mismatchClientId}`, null, { expect: [200, 404] });
    if (clientId) await check("DELETE /api/clients/:id (payment ID fixture cleanup)", "DELETE", `/api/clients/${clientId}`, null, { expect: [200, 404] });
  }
}

async function testMediaImages() {
  console.log("\n[MEDIA IMAGES]");
  await check("GET  /api/media/images/all", "GET", "/api/media/images/all");

  if (!SHOULD_RUN_CLOUDINARY_UPLOADS) {
    skipSmoke("POST /api/media/images/new", cloudinarySkipReason());
    return;
  }

  const uploaded = await checkMultipart(
    "POST /api/media/images/new",
    "POST",
    "/api/media/images/new",
    {
      files: [{ name: "image", filename: "test.png", contentType: "image/png", content: tinyPngBuffer }],
    },
    { expect: [201] }
  );

  const imageId = uploaded?.data?.id;
  if (imageId) {
    await check("GET  /api/media/images/:imageId", "GET", `/api/media/images/${imageId}`);
    await checkMultipart(
      "PUT  /api/media/images/:imageId/replace",
      "PUT",
      `/api/media/images/${imageId}/replace`,
      {
        files: [{ name: "image", filename: "test-replace.png", contentType: "image/png", content: tinyPngBuffer }],
      },
      { expect: [200] }
    );
  }
}

async function testMediaFiles() {
  console.log("\n[MEDIA FILES]");
  const suffix = Date.now();
  let registeredFileId = null;
  let uploadedFileId = null;

  await check("GET  /api/media/files", "GET", "/api/media/files");
  await check("POST /api/media/files/url rejects non-HTTPS URL → 400", "POST", "/api/media/files/url", { url: "http://cdn.example.com/file.pdf" }, { expect: [400] });
  await checkMultipart("POST /api/media/files (missing file) → 400", "POST", "/api/media/files", {}, { expect: [400] });

  try {
    const registered = await check(
      "POST /api/media/files/url",
      "POST",
      "/api/media/files/url",
      {
        url: `https://cdn.example.com/smoke/${suffix}/company-presentation.pdf`,
        fileName: `smoke-${suffix}.pdf`,
        type: "document",
        mimeType: "application/pdf",
        sizeBytes: 42,
      },
      { expect: [201] },
    );
    registeredFileId = registered?.data?.file?.id;

    if (registeredFileId) {
      const listRes = await check("GET  /api/media/files includes registered URL file", "GET", "/api/media/files?type=document&limit=100");
      assertSmoke(
        "GET  /api/media/files registered URL file appears in list",
        Array.isArray(listRes?.data?.files) && listRes.data.files.some((file) => file?.id === registeredFileId),
        `registered file ${registeredFileId} not found in list response`,
      );
      await check("GET  /api/media/files/:id", "GET", `/api/media/files/${registeredFileId}`);
      await check("DELETE /api/media/files/:id", "DELETE", `/api/media/files/${registeredFileId}`);
      await check("GET  /api/media/files/:id after delete → 404", "GET", `/api/media/files/${registeredFileId}`, null, { expect: [404] });
      registeredFileId = null;
    } else {
      skipSmoke("GET/DELETE /api/media/files/:id registered URL fixture", "could not register temporary URL file fixture");
    }

    if (!SHOULD_RUN_CLOUDINARY_UPLOADS) {
      skipSmoke("POST /api/media/files binary upload", cloudinarySkipReason());
      return;
    }

    const uploaded = await checkMultipart(
      "POST /api/media/files binary upload",
      "POST",
      "/api/media/files",
      {
        files: [{ name: "file", filename: `smoke-${suffix}.txt`, contentType: "text/plain", content: Buffer.from("smoke test file upload") }],
      },
      { expect: [201] },
    );
    uploadedFileId = uploaded?.data?.file?.id;

    if (uploadedFileId) {
      await check("GET  /api/media/files/:id (uploaded binary)", "GET", `/api/media/files/${uploadedFileId}`);
      await check("DELETE /api/media/files/:id (uploaded binary cleanup)", "DELETE", `/api/media/files/${uploadedFileId}`);
      uploadedFileId = null;
    } else {
      skipSmoke("DELETE /api/media/files/:id uploaded binary cleanup", "binary upload did not return a file id");
    }
  } finally {
    if (registeredFileId) {
      await check("DELETE /api/media/files/:id (registered URL cleanup)", "DELETE", `/api/media/files/${registeredFileId}`, null, { expect: [200, 404] });
    }
    if (uploadedFileId) {
      await check("DELETE /api/media/files/:id (uploaded binary cleanup)", "DELETE", `/api/media/files/${uploadedFileId}`, null, { expect: [200, 404] });
    }
  }
}

async function testWebhooks() {
  console.log("\n[WEBHOOKS]");
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${WEBHOOK_TOKEN}` };

  const qualifiedPayload = {
    form_type: "quote_request",
    name: "John Webhook",
    email: `john-${Date.now()}@webhook.com`,
    phone: "+123456789",
    service: "SEO",
    budget: "$1k",
    details: "Test"
  };

  const generalPayload = {
    name: "Jane Webhook",
    email: `jane-${Date.now()}@webhook.com`,
    phone: "+987654321",
    business: "Acme",
    service: "Strategy",
    challenge: "None",
    budget: "$2k"
  };

  const checkWebhook = async (label, path, body) => {
    try {
      const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      const passed = res.status === 201;
      passed ? ok(label, res.status) : bad(label, res.status);
    } catch(err) {
      bad(label, 0, err.message);
    }
  };

  await checkWebhook("POST /api/webhooks/leads/qualified", "/api/webhooks/leads/qualified", qualifiedPayload);
  await checkWebhook("POST /api/webhooks/leads/general", "/api/webhooks/leads/general", generalPayload);
}

async function testLogout() {
  console.log("\n[LOGOUT]");
  await check("POST /api/auth/logout", "POST", "/api/auth/logout", null, { expect: [200] });
}

// ─── edge case suites ─────────────────────────────────────────────────────────

// 1. No cookie → every protected route must return 401
async function testUnauthorized() {
  console.log("\n[EDGE: UNAUTHORIZED — no cookie → 401]");
  const routes = [
    ["GET  /api/user/profile", "GET", "/api/user/profile"],
    ["PUT  /api/user/profile/picture", "PUT", "/api/user/profile/picture"],
    ["GET  /api/dashboard/metrics", "GET", "/api/dashboard/metrics"],
    ["GET  /api/projects", "GET", "/api/projects"],
    ["GET  /api/clients", "GET", "/api/clients"],
    ["GET  /api/members", "GET", "/api/members"],
    ["GET  /api/media/files", "GET", "/api/media/files"],
    ["GET  /api/leads", "GET", "/api/leads"],
    ["GET  /api/analytics/overview", "GET", "/api/analytics/overview"],
    ["GET  /api/revenue", "GET", "/api/revenue"],
    ["GET  /api/payments", "GET", "/api/payments"],
    ["GET  /api/notifications", "GET", "/api/notifications"],
    ["PUT  /api/notifications/read-all", "PUT", "/api/notifications/read-all"],
  ];
  for (const [label, method, path] of routes) {
    await checkWith(`${label} → 401`, method, path, "", null, { expect: [401] });
  }

  // Webhooks unauthorized (missing token)
  try {
    const res = await fetch(`${BASE_URL}/api/webhooks/leads/qualified`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({name:"X", email:"x@x.com"}) });
    res.status === 401 ? ok("POST /api/webhooks/leads/qualified (no token) → 401", res.status) : bad("POST /api/webhooks/leads/qualified (no token) → 401", res.status);
  } catch(err) {
    bad("POST /api/webhooks/leads/qualified (no token) → 401", 0, err.message);
  }
}

// 2. Stale cookie after logout must be rejected
async function testPostLogoutAccess(staleCookie) {
  console.log("\n[EDGE: POST-LOGOUT — stale cookie → 401]");
  await checkWith(
    "GET  /api/user/profile (stale cookie) → 401",
    "GET", "/api/user/profile", staleCookie, null, { expect: [401] }
  );
  await checkWith(
    "GET  /api/dashboard/metrics (stale cookie) → 401",
    "GET", "/api/dashboard/metrics", staleCookie, null, { expect: [401] }
  );
}

// 3. Invalid / missing fields must return 400
async function testValidation() {
  console.log("\n[EDGE: VALIDATION — bad input → 400]");
  // Login route has userAlreadyAuth middleware — must test without a cookie
  await checkWith(
    "POST /api/auth/login (missing password) → 400",
    "POST", "/api/auth/login", "",
    { email: "nope@x.com" },
    { expect: [400, 401] }
  );
  await check(
    "POST /api/leads (invalid email) → 400",
    "POST", "/api/leads", { firstName: "X", lastName: "Y", email: "not-an-email" },
    { expect: [400] }
  );
  await check(
    "GET  /api/projects (invalid pagination) → 400",
    "GET", "/api/projects?limit=0", null,
    { expect: [400] }
  );
  await check(
    "GET  /api/leads (invalid pagination) → 400",
    "GET", "/api/leads?limit=0", null,
    { expect: [400] }
  );
  await check(
    "POST /api/tasks (empty body) → 400",
    "POST", "/api/tasks", {},
    { expect: [400] }
  );
  await check(
    "POST /api/members (empty body) → 400",
    "POST", "/api/members", {},
    { expect: [400] }
  );

  // Webhooks validation
  const whHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${WEBHOOK_TOKEN}` };
  try {
    const res = await fetch(`${BASE_URL}/api/webhooks/leads/qualified`, { method: "POST", headers: whHeaders, body: JSON.stringify({email:"invalid"}) });
    res.status === 400 ? ok("POST /api/webhooks/leads/qualified (missing name) → 400", res.status) : bad("POST /api/webhooks/leads/qualified (missing name) → 400", res.status);
  } catch(err) {
    bad("POST /api/webhooks/leads/qualified (missing name) → 400", 0, err.message);
  }
}

// 4. Non-existent resource IDs must return 404
async function testNotFound() {
  console.log("\n[EDGE: NOT FOUND — unknown IDs → 404]");
  await check("GET  /api/projects/no-such-id → 404",  "GET", "/api/projects/no-such-id",  null, { expect: [404] });
  await check("GET  /api/clients/no-such-id → 404",   "GET", "/api/clients/no-such-id",   null, { expect: [404] });
  await check("GET  /api/leads/no-such-id → 404",     "GET", "/api/leads/no-such-id",     null, { expect: [404] });
  await check("GET  /api/payments/no-such-id → 404",  "GET", "/api/payments/no-such-id",  null, { expect: [404] });
  await check("GET  /api/tasks/no-such-id → 404",     "GET", "/api/tasks/no-such-id",     null, { expect: [404] });
  await check("PATCH /api/tasks/no-such-id → 404",   "PATCH", "/api/tasks/no-such-id", { status: "Done" }, { expect: [404] });
  await check("PATCH /api/members/no-such-id → 404",  "PATCH", "/api/members/no-such-id", { job: "x" }, { expect: [404] });
}

// 5. Duplicate resource must return 409
async function testConflict() {
  console.log("\n[EDGE: CONFLICT — duplicate resource → 409]");
  await check(
    "POST /api/members (duplicate email) → 409",
    "POST", "/api/members",
    { firstName: "Dup", lastName: "User", email: EMAIL, phone: "+2348000000398", password: PASSWORD, role: "staff" },
    { expect: [409] }
  );
}

// 6. Staff user hitting admin-only routes must get 403
async function testAdminOnly() {
  console.log("\n[EDGE: ADMIN-ONLY — staff user → 403]");

  const staffEmail = `staff-smoke-${Date.now()}@test.local`;
  const staffPassword = "TestPassword123!";

  // Create the staff user (as admin)
  const created = await check(
    "POST /api/members (create test staff user)",
    "POST", "/api/members",
    { firstName: "Staff", lastName: "Smoke", email: staffEmail, phone: "+2348000000302", password: staffPassword, role: "staff" },
    { expect: [201] }
  );

  if (!created) return;

  // Login as staff
  const { status: staffLoginStatus, cookie: staffCookie } = await loginAs(staffEmail, staffPassword);
  if (!staffCookie) {
    bad("POST /api/auth/login (staff)", staffLoginStatus, "could not obtain staff cookie");
    return;
  }
  ok("POST /api/auth/login (staff)", staffLoginStatus);

  // Admin-only route checks
  await checkWith("GET  /api/members (staff) → 403",       "GET",  "/api/members",  staffCookie, null,  { expect: [403] });
  await checkWith("PUT  /api/members/:id/password (staff) → 403", "PUT", "/api/members/any-id/password", staffCookie, { password: "NopePassword123!" }, { expect: [403] });
  await checkWith("DELETE /api/members/:id (staff) → 403", "DELETE", "/api/members/any-id", staffCookie, null, { expect: [403] });
  await checkWith("POST /api/payments (staff) → 403",      "POST", "/api/payments", staffCookie,
    { clientId: "no-access-client", projectId: "no-access-project", amount: 1, date: Date.now() }, { expect: [403] });
  await checkWith("POST /api/blog (staff) → 403",          "POST", "/api/blog",     staffCookie,
    { title: "T", content: "C" }, { expect: [403] });

  const leadFixture = await check(
    "POST /api/leads (lead admin-only fixture)",
    "POST",
    "/api/leads",
    { firstName: "Admin", lastName: "Only", email: `lead-admin-only-${Date.now()}@test.local` },
    { expect: [201] },
  );
  const leadId = leadFixture?.data?.lead?.id;
  await checkWith("GET  /api/leads (staff) → 403", "GET", "/api/leads", staffCookie, null, { expect: [403] });
  await checkWith("GET  /api/leads/stats (staff) → 403", "GET", "/api/leads/stats", staffCookie, null, { expect: [403] });
  await checkWith("POST /api/leads (staff) → 403", "POST", "/api/leads", staffCookie,
    { firstName: "Staff", lastName: "Nope", email: `staff-lead-${Date.now()}@test.local` }, { expect: [403] });
  if (leadId) {
    await checkWith("GET  /api/leads/:id (staff) → 403", "GET", `/api/leads/${leadId}`, staffCookie, null, { expect: [403] });
    await checkWith("PATCH /api/leads/:id (staff) → 403", "PATCH", `/api/leads/${leadId}`, staffCookie, { status: "contacted" }, { expect: [403] });
    await checkWith("DELETE /api/leads/:id (staff) → 403", "DELETE", `/api/leads/${leadId}`, staffCookie, null, { expect: [403] });
    await check("DELETE /api/leads/:id (lead admin-only fixture cleanup)", "DELETE", `/api/leads/${leadId}`, null, { expect: [200, 404] });
  } else {
    skipSmoke("PATCH/DELETE /api/leads staff authorization", "could not create lead fixture");
  }

  // Cleanup: delete the test staff user as admin
  const membersRes = await req("GET", `/api/members?search=${encodeURIComponent(staffEmail)}`);
  const staffId = membersRes.json?.data?.members?.[0]?.userId;
  if (staffId) {
    await check(
      "DELETE /api/members/:id (cleanup)",
      "DELETE", `/api/members/${staffId}`, null, { expect: [200] }
    );
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n\x1b[1mSmoke test → ${BASE_URL}\x1b[0m`);
  console.log(`Environment file: ${ENV_FILE}`);
  console.log(`Login email: ${EMAIL}`);
  console.log(`Cloudinary upload smoke: ${SHOULD_RUN_CLOUDINARY_UPLOADS ? "enabled" : `skipped (${cloudinarySkipReason()})`}`);

  // ── edge case: unauthenticated requests (must run before login) ──
  await testUnauthorized();

  // ── login ──
  const authed = await login();
  if (!authed) {
    console.log("\n\x1b[31mAborted: login failed.\x1b[0m");
    process.exit(1);
  }

  // ── happy path ──
  await testHealth();
  await testUser();
  await testDashboard();
  await testProjects();
  await testClients();
  await testMembers();
  await testTasks();
  await testNotifications();
  await testLeads();
  await testBlog();
  await testAnalytics();
  await testRevenue();
  await testPayments();
  await testMediaImages();
  await testMediaFiles();
  await testWebhooks();

  // ── edge cases (while still authenticated as admin) ──
  await testValidation();
  await testNotFound();
  await testConflict();
  await testAdminOnly();

  // ── logout + stale-cookie check ──
  const staleCookie = authCookie;
  await testLogout();
  await testPostLogoutAccess(staleCookie);

  // ── summary ──────────────────────────────────────────────────────
  const total = pass.length + fail.length;
  console.log(`\n${"─".repeat(50)}`);
  console.log(`\x1b[1mResults: ${pass.length}/${total} passed\x1b[0m`);
  if (skipped.length) {
    console.log(`\n\x1b[33mSkipped (${skipped.length}, not counted as failures):\x1b[0m`);
    skipped.forEach((s) => console.log(`  • ${s}`));
  }
  if (fail.length) {
    console.log(`\n\x1b[31mFailed (${fail.length}):\x1b[0m`);
    fail.forEach((f) => console.log(`  • ${f}`));
  }
  console.log("");
  process.exit(fail.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
