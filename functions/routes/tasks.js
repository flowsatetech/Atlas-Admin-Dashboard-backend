const express = require("express");
const { z } = require("zod");

const middlewares = require("../middlewares");
const { logger, generateToken } = require("../helpers");
const db = require("../db");
const services = require("../services");

const router = express.Router();
const { tasks: tasksRateLimiter } = middlewares.rateLimiters;

const listTasksQuerySchema = z.object({
  status: z.enum(["Todo", "InProgress", "Review", "Done", "Blocked"]).optional(),
  assigneeId: z.string().min(1).optional(),
  assignedTo: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().min(1).optional(),
  assignedTo: z.string().min(1).optional(),
  dueDate: z.number().int().nonnegative().optional(),
  status: z.enum(["Todo", "InProgress", "Review", "Done", "Blocked"]).default("Todo"),
  projectId: z.string().min(1).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

const updateTaskSchema = createTaskSchema.partial();

router.get("/", tasksRateLimiter, async (req, res) => {
  try {
    const parsed = listTasksQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid query parameters" });

    const { status, assigneeId, assignedTo, projectId, page, limit } = parsed.data;
    const { rows, total } = await db.getTasks({ status, assigneeId, assignedTo, projectId, page, limit });

    const now = Date.now();
    const tasks = rows.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description || "",
      status: task.status,
      assigneeId: task.assigneeId || task.assignedTo,
      dueDate: task.dueDate,
      isOverdue: task.dueDate ? task.dueDate < now && task.status !== "Done" : false,
    }));

    return res.status(200).json({
      success: true,
      data: { tasks, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      message: "Tasks fetched successfully",
    });
  } catch (error) {
    logger("ALL_TASKS").error(error);
    return res.status(400).json({ success: false, message: "An unknown error occured" });
  }
});

router.post("/", middlewares.adminOnly, tasksRateLimiter, async (req, res) => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Couldn't complete create task request" });

    const resolvedAssigneeId = parsed.data.assigneeId || parsed.data.assignedTo;
    if (!resolvedAssigneeId) return res.status(400).json({ success: false, message: "assigneeId is required" });

    const assigneeExists = await db.getUserById(resolvedAssigneeId);
    if (!assigneeExists) return res.status(404).json({ success: false, message: "Assignee not found" });

    if (parsed.data.projectId) {
      const projectExists = await db.getProjectById(parsed.data.projectId);
      if (!projectExists) return res.status(404).json({ success: false, message: "Project not found" });
    }

    const now = Date.now();
    const task = {
      id: generateToken(),
      title: parsed.data.title,
      description: parsed.data.description || "",
      assigneeId: resolvedAssigneeId,
      dueDate: parsed.data.dueDate || now,
      status: parsed.data.status,
      projectId: parsed.data.projectId || null,
      priority: parsed.data.priority || "medium",
      createdAt: now,
      updatedAt: now,
    };

    await db.addTask(task);
    await services.logActivity({
      type: "task.created",
      actorId: req.user?.userId || null,
      entityId: task.id,
      entityType: "task",
      message: `${task.title} task was created`,
      meta: { assigneeId: task.assigneeId, status: task.status },
    });
    await services.recordAnalyticsEvent({ pageViewsDelta: 1, trafficSource: "Direct" });

    return res.status(201).json({ success: true, message: "Task created successfully", data: { task } });
  } catch (error) {
    logger("NEW_TASK").error(error);
    return res.status(400).json({ success: false, message: "An unknown error occured" });
  }
});

router.put("/:taskId", middlewares.adminOnly, tasksRateLimiter, async (req, res) => {
  try {
    const { taskId } = req.params;
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Couldn't complete update task request" });

    const existing = await db.getTaskById(taskId);
    if (!existing) return res.status(404).json({ success: false, message: "Task not found" });

    const resolvedAssigneeId = parsed.data.assigneeId || parsed.data.assignedTo;
    if (resolvedAssigneeId) {
      const assigneeExists = await db.getUserById(resolvedAssigneeId);
      if (!assigneeExists) return res.status(404).json({ success: false, message: "Assignee not found" });
    }

    if (parsed.data.projectId) {
      const projectExists = await db.getProjectById(parsed.data.projectId);
      if (!projectExists) return res.status(404).json({ success: false, message: "Project not found" });
    }

    const updateData = { ...parsed.data, updatedAt: Date.now() };
    if (updateData.assignedTo && !updateData.assigneeId) updateData.assigneeId = updateData.assignedTo;
    delete updateData.assignedTo;

    await db.updateTaskById(taskId, updateData);
    await services.logActivity({
      type: "task.updated",
      actorId: req.user?.userId || null,
      entityId: taskId,
      entityType: "task",
      message: `${existing.title || "Task"} was updated`,
      meta: { fields: Object.keys(parsed.data) },
    });
    await services.recordAnalyticsEvent({ pageViewsDelta: 1, trafficSource: "Direct" });

    return res.status(200).json({ success: true, message: "Task updated successfully" });
  } catch (error) {
    logger("UPDATE_TASK").error(error);
    return res.status(400).json({ success: false, message: "An unknown error occured" });
  }
});

module.exports = router;
