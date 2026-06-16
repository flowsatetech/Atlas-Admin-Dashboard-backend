const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { logger } = require("../helpers");
const db = require("./index");
const seedData = require("./seed-data.json");

async function seedDB() {
  try {
    // ── USERS ──────────────────────────────────────────────────────────────
    for (const u of seedData.users) {
      const existing = await db.getUserByEmail(u.email);
      if (existing) {
        logger("SEED").info(`User exists, skipping: ${u.email}`);
        continue;
      }
      const passwordHash = await bcrypt.hash(u.password, 10);
      const stamp = `${crypto.randomBytes(16).toString("hex")}_stamp_${Date.now()}`;
      const { password: _plain, ...rest } = u;
      const defaultNotificationPreferences = {
        TASK_ASSIGNMENT: true,
        PROJECT_ASSIGNMENT: true,
        CLIENT_ASSIGNMENT: true,
        LEAD_ASSIGNMENT: true,
        COMMENT_MENTION: true,
        ROLE_CHANGE: true,
        SYSTEM_ALERT: true,
        CLIENT_CREATED: true,
        PROJECT_STATUS_CHANGE: true,
        LEAD_STATUS_CHANGE: true,
        PROJECT_COMMENT: true,
        PASSWORD_UPDATED: true,
      };
      await db.addUser({
        ...rest,
        password: passwordHash,
        stamp,
        lastLogin: null,
        notificationPreferences: rest.notificationPreferences || defaultNotificationPreferences
      });
      logger("SEED").info(`User seeded: ${u.email} (${u.role})`);
    }

    // ── CLIENTS ────────────────────────────────────────────────────────────
    for (const c of seedData.clients) {
      try {
        const existing = await db.getClientById(c.id);
        if (existing) { logger("SEED").info(`Client exists, skipping: ${c.id}`); continue; }
        await db.addClient(c);
        logger("SEED").info(`Client seeded: ${c.id}`);
      } catch (err) {
        if (isDupKey(err)) { logger("SEED").info(`Client dup key, skipping: ${c.id}`); } else throw err;
      }
    }

    // ── PROJECTS ───────────────────────────────────────────────────────────
    for (const p of seedData.projects) {
      try {
        const existing = await db.getProjectById(p.id);
        if (existing) { logger("SEED").info(`Project exists, skipping: ${p.id}`); continue; }
        await db.addProject(p);
        logger("SEED").info(`Project seeded: ${p.id}`);
      } catch (err) {
        if (isDupKey(err)) { logger("SEED").info(`Project dup key, skipping: ${p.id}`); } else throw err;
      }
    }

    // ── TASKS ──────────────────────────────────────────────────────────────
    for (const t of seedData.tasks) {
      try {
        const existing = await db.getTaskById(t.id);
        if (existing) { logger("SEED").info(`Task exists, skipping: ${t.id}`); continue; }
        await db.addTask(t);
        logger("SEED").info(`Task seeded: ${t.id}`);
      } catch (err) {
        if (isDupKey(err)) { logger("SEED").info(`Task dup key, skipping: ${t.id}`); } else throw err;
      }
    }

    // ── ANALYTICS SNAPSHOTS (upsert is inherently idempotent) ──────────────
    for (const snap of seedData.analyticsSnapshots) {
      await db.upsertAnalyticsSnapshotByPeriod(snap);
      logger("SEED").info(`Analytics snapshot upserted: ${snap.id}`);
    }

    // ── CAMPAIGN STATS ─────────────────────────────────────────────────────
    const { rows: existingStats } = await db.getCampaignStats({ limit: 1000 });
    const existingStatIds = new Set(existingStats.map((s) => s.id));
    for (const cs of seedData.campaignStats) {
      if (existingStatIds.has(cs.id)) { logger("SEED").info(`Campaign stat exists, skipping: ${cs.id}`); continue; }
      await db.addCampaignStat(cs);
      logger("SEED").info(`Campaign stat seeded: ${cs.id}`);
    }

    // ── BLOG POSTS ─────────────────────────────────────────────────────────
    for (const post of seedData.blogPosts) {
      try {
        const existing = await db.getBlogPostBySlug(post.slug);
        if (existing) { logger("SEED").info(`Blog post exists, skipping: ${post.slug}`); continue; }
        await db.addBlogPost(post);
        logger("SEED").info(`Blog post seeded: ${post.slug}`);
      } catch (err) {
        if (isDupKey(err)) { logger("SEED").info(`Blog post dup key, skipping: ${post.slug}`); } else throw err;
      }
    }

    // ── LEADS ──────────────────────────────────────────────────────────────
    const { leads: existingLeads } = await db.getAllLeads({ limit: 1000 });
    const existingLeadIds = new Set(existingLeads.map((l) => l.id));
    for (const lead of seedData.leads) {
      if (existingLeadIds.has(lead.id)) { logger("SEED").info(`Lead exists, skipping: ${lead.email}`); continue; }
      await db.addLead(lead);
      logger("SEED").info(`Lead seeded: ${lead.email}`);
    }

    // ── ACTIVITY LOGS (append-only; seed only when empty) ──────────────────
    const { total } = await db.getActivityLogs({ limit: 1 });
    if (total === 0) {
      for (const log of seedData.activityLogs) {
        await db.addActivityLog(log);
        logger("SEED").info(`Activity log seeded: ${log.type}`);
      }
    } else {
      logger("SEED").info("Activity logs exist, skipping");
    }

    // ── COMMENTS (skip per-project if that project already has comments) ────
    const commentProjectIds = [...new Set(seedData.comments.map((c) => c.projectId))];
    const skipCommentProjects = new Set();
    for (const projectId of commentProjectIds) {
      const existing = await db.getCommentsByProjectId(projectId);
      if (existing.length > 0) {
        skipCommentProjects.add(projectId);
        logger("SEED").info(`Comments exist for ${projectId}, skipping`);
      }
    }
    for (const comment of seedData.comments) {
      if (skipCommentProjects.has(comment.projectId)) continue;
      await db.addComment(comment);
      logger("SEED").info(`Comment seeded: ${comment.id}`);
    }
  } catch (err) {
    logger("SEED").error("Seed failed:");
    logger("SEED").error(err);
    throw err;
  }
}

module.exports = { seedDB };
