/**
 * Project-wide smoke test — hits every API endpoint and reports pass/fail.
 * Covers: happy path, auth/authorization, input validation, 404s, conflict, post-logout.
 * Usage: node scripts/smoke-test.js
 * Requires the server to already be running on BASE_URL.
 */

const ENV_FILE = process.env.SMOKE_TEST_ENV_FILE || '.env.staging';
require('dotenv').config({ path: ENV_FILE });

const BASE_URL = process.env.SMOKE_TEST_BASE_URL || "http://127.0.0.1:3000";
const EMAIL = (process.env.SMOKE_EMAIL || "admin1@atlas-africa.com.ng").trim();
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

function tinyPngBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
}

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
      files: [{ name: "picture", filename: "avatar.png", contentType: "image/png", content: tinyPngBuffer() }],
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

async function testDashboard() {
  console.log("\n[DASHBOARD]");
  await check("GET  /api/dashboard/metrics", "GET", "/api/dashboard/metrics");
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
    await check("PUT  /api/projects/:id rejects manual progress", "PUT", `/api/projects/${projectId}`, { progress: 25 }, { expect: [400] });

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

  if (firstTaskId) await check("DELETE /api/tasks/:id (project progress fixture cleanup)", "DELETE", `/api/tasks/${firstTaskId}`);
  if (secondTaskId) await check("DELETE /api/tasks/:id (project progress fixture cleanup)", "DELETE", `/api/tasks/${secondTaskId}`);
  if (projectId) await check("DELETE /api/projects/:id (project progress fixture cleanup)", "DELETE", `/api/projects/${projectId}`, null, { expect: [204] });
  if (clientId) await check("DELETE /api/clients/:id (project progress fixture cleanup)", "DELETE", `/api/clients/${clientId}`, null, { expect: [200] });
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
  } else {
    skipSmoke("GET  /api/projects/:id", "no project ID available");
    skipSmoke("GET  /api/projects/:id/comments", "no project ID available");
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

  // PATCH — progress is derived from linked tasks and cannot be set manually
  if (projectId) {
    await check("PATCH /api/projects/:id rejects manual progress", "PATCH", `/api/projects/${projectId}`, { progress: 10 }, { expect: [400] });
  }
}

async function testClients() {
  console.log("\n[CLIENTS]");
  await check("GET  /api/clients/stats", "GET", "/api/clients/stats");
  const res = await check("GET  /api/clients", "GET", "/api/clients");
  const clientId = res?.data?.clients?.[0]?.id;

  if (clientId) {
    await check("GET  /api/clients/:id", "GET", `/api/clients/${clientId}`);
    await check("PATCH /api/clients/:id", "PATCH", `/api/clients/${clientId}`, { notes: "smoke-test" });
  } else {
    skipSmoke("GET  /api/clients/:id", "no client ID available");
  }
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

  if (!paymentId) {
    // No existing payment — create one so we can test GET/:id
    const created = await check(
      "POST /api/payments",
      "POST",
      "/api/payments",
      {
        clientName: "Smoke Client",
        projectName: "Smoke Project",
        amount: 1000,
        status: "Pending",
        date: Date.now(),
      },
      { expect: [201] }
    );
    paymentId = created?.data?.payment?.id;
  }

  if (paymentId) {
    await check("GET  /api/payments/:id", "GET", `/api/payments/${paymentId}`);
  } else {
    skipSmoke("GET  /api/payments/:id", "no payment ID available");
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
    { firstName: "Dup", lastName: "User", email: EMAIL, password: PASSWORD, role: "staff" },
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
    { firstName: "Staff", lastName: "Smoke", email: staffEmail, password: staffPassword, role: "staff" },
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
    { clientName: "X", projectName: "Y", amount: 1, date: Date.now() }, { expect: [403] });
  await checkWith("POST /api/blog (staff) → 403",          "POST", "/api/blog",     staffCookie,
    { title: "T", content: "C" }, { expect: [403] });

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
  await testLeads();
  await testBlog();
  await testAnalytics();
  await testRevenue();
  await testPayments();
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
