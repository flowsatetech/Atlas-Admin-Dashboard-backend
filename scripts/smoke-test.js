/**
 * Project-wide smoke test — hits every API endpoint and reports pass/fail.
 * Covers: happy path, auth/authorization, input validation, 404s, conflict, post-logout.
 * Usage: node scripts/smoke-test.js
 * Requires the server to already be running on BASE_URL.
 */

require('dotenv').config({ path: '.env.staging' });

const BASE_URL = process.env.SMOKE_TEST_BASE_URL || "http://127.0.0.1:3000";
const EMAIL = (process.env.SMOKE_EMAIL || "admin@atlas.local").trim();
const PASSWORD = (process.env.SMOKE_PASSWORD || "TestPassword123!").trim();
const WEBHOOK_TOKEN = process.env.WEBHOOK_BEARER_TOKEN || "test-webhook-token";

let authCookie = "";
const pass = [];
const fail = [];

// ─── helpers ─────────────────────────────────────────────────────────────────

function ok(label, status) {
  pass.push(label);
  console.log(`  \x1b[32m✓\x1b[0m ${label} [${status}]`);
}

function bad(label, status, note = "") {
  fail.push(label);
  console.log(`  \x1b[31m✗\x1b[0m ${label} [${status}]${note ? " — " + note : ""}`);
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

async function testUser() {
  console.log("\n[USER]");
  await check("GET  /api/user/profile", "GET", "/api/user/profile");
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
    bad("PROJECT CLIENT POPULATION fixture", "SKIP", "could not create client fixture");
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
    bad("PROJECT CLIENT POPULATION fixture", "SKIP", "could not create project fixture");
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

async function testProjects() {
  console.log("\n[PROJECTS]");
  await check("GET  /api/projects/stats", "GET", "/api/projects/stats");
  const res = await check("GET  /api/projects", "GET", "/api/projects");
  const projectId = res?.data?.projects?.[0]?.id;
  const projectWithClient = res?.data?.projects?.find((project) => project?.clientId && project?.client);

  if (projectWithClient) {
    assertProjectHasClientDetails("GET  /api/projects existing row has populated client", projectWithClient, projectWithClient.clientId);
  } else {
    bad("GET  /api/projects existing row has populated client", "ASSERT", "no project with client details available in list response");
  }

  if (projectId) {
    const detail = await check(`GET  /api/projects/:id`, "GET", `/api/projects/${projectId}`);
    if (detail?.data?.project?.clientId && detail?.data?.project?.client) {
      assertProjectHasClientDetails("GET  /api/projects/:id existing row has populated client", detail.data.project, detail.data.project.clientId);
    }
    await check("GET  /api/projects/:id/comments", "GET", `/api/projects/${projectId}/comments`);
  } else {
    bad("GET  /api/projects/:id", "SKIP", "no project ID available");
    bad("GET  /api/projects/:id/comments", "SKIP", "no project ID available");
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

  // PATCH — update progress on first project
  if (projectId) {
    await check("PATCH /api/projects/:id", "PATCH", `/api/projects/${projectId}`, { progress: 10 });
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
    bad("GET  /api/clients/:id", "SKIP", "no client ID available");
  }
}

async function testMembers() {
  console.log("\n[MEMBERS]");
  const res = await check("GET  /api/members", "GET", "/api/members");
  const memberId = res?.data?.members?.[0]?.userId;

  if (memberId) {
    await check("PUT  /api/members/:id", "PUT", `/api/members/${memberId}`, { job: `smoke-${Date.now()}` });
  } else {
    bad("PUT  /api/members/:id", "SKIP", "no member ID available");
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

async function testBlog() {
  console.log("\n[BLOG]");
  await check("GET  /api/blog/stats", "GET", "/api/blog/stats");
  const res = await check("GET  /api/blog", "GET", "/api/blog");
  const postId = res?.data?.posts?.[0]?.id;

  if (postId) {
    await check("GET  /api/blog/:id", "GET", `/api/blog/${postId}`);
  } else {
    bad("GET  /api/blog/:id", "SKIP", "no post ID available");
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
    bad("GET  /api/payments/:id", "SKIP", "no payment ID available");
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
    ["GET  /api/dashboard/metrics", "GET", "/api/dashboard/metrics"],
    ["GET  /api/projects", "GET", "/api/projects"],
    ["GET  /api/clients", "GET", "/api/clients"],
    ["GET  /api/members", "GET", "/api/members"],
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
  await check("PUT  /api/members/no-such-id → 404",   "PUT", "/api/members/no-such-id", { job: "x" }, { expect: [404] });
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
  console.log(`Credentials: ${EMAIL}`);

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
