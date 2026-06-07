const express = require("express");

const middlewares = require("../middlewares");
const { logger, generateToken, serverError, clientError } = require("../helpers");
const db = require("../db");
const services = require("../services");
const { createTaskSchema, updateTaskSchema, listTasksQuerySchema } = require("../models/task");

const router = express.Router();
const { tasks: tasksRateLimiter } = middlewares.rateLimiters;

/**
 * @swagger
 * tags:
 * name: Tasks
 * description: Task management and assignment API
 */

/**
 * @swagger
 * /api/tasks:
 * get:
 * summary: Get all tasks with filtering and pagination
 * tags: [Tasks]
 * parameters:
 * - in: query
 * name: status
 * schema:
 * type: string
 * enum: [Todo, InProgress, Review, Done, Blocked]
 * - in: query
 * name: assigneeId
 * schema:
 * type: string
 * - in: query
 * name: projectId
 * schema:
 * type: string
 * - in: query
 * name: page
 * schema:
 * type: integer
 * default: 1
 * - in: query
 * name: limit
 * schema:
 * type: integer
 * default: 20
 * responses:
 * 200:
 * description: Successfully fetched tasks
 * 400:
 * description: Invalid query parameters
 */
router.get("/", tasksRateLimiter, async (req, res) => {
  try {
    const parsed = listTasksQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return clientError(res, 400, 'Invalid query parameters');

    const { status, assigneeId, assignedTo, projectId, page, limit } =
      parsed.data;
    const { rows, total } = await db.getTasks({
      status,
      assigneeId,
      assignedTo,
      projectId,
      page,
      limit,
    });

    const assigneeIds = [...new Set(
      rows
        .map((task) => task.assigneeId || task.assignedTo)
        .filter(Boolean),
    )];
    const assignees = await db.getUsersByIds(assigneeIds);
    const assigneeMap = new Map(
      assignees.map((user) => {
        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        return [
          user.userId,
          {
            userId: user.userId,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: fullName || user.email || user.userId,
            email: user.email,
          },
        ];
      }),
    );

    const now = Date.now();
    const tasks = rows.map((task) => {
      const resolvedAssigneeId = task.assigneeId || task.assignedTo || null;
      const assignee = resolvedAssigneeId ? assigneeMap.get(resolvedAssigneeId) || null : null;

      return {
        id: task.id,
        title: task.title,
        description: task.description || "",
        status: task.status,
        assigneeId: resolvedAssigneeId,
        assigneeName: assignee?.fullName || null,
        assignee,
        dueDate: task.dueDate,
        projectId: task.projectId || null,
        priority: task.priority || "medium",
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        isOverdue: task.dueDate
          ? task.dueDate < now && task.status !== "Done"
          : false,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        tasks,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: "Tasks fetched successfully",
    });
  } catch (error) {
    logger("ALL_TASKS").error(error);
    return serverError(res, error, 'Failed to fetch tasks.');
  }
});

/**
 * @swagger
 * /api/tasks:
 * post:
 * summary: Create a new task (Admin Only)
 * tags: [Tasks]
 * security:
 * - bearerAuth: []
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required: [title, assigneeId]
 * properties:
 * title:
 * type: string
 * description:
 * type: string
 * assigneeId:
 * type: string
 * status:
 * type: string
 * enum: [Todo, InProgress, Review, Done, Blocked]
 * priority:
 * type: string
 * enum: [low, medium, high]
 * dueDate:
 * type: integer
 * responses:
 * 201:
 * description: Task created successfully
 * 400:
 * description: Validation error
 */
router.post("/", middlewares.adminOnly, tasksRateLimiter, async (req, res) => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success)
      return clientError(res, 400, 'Couldn\'t complete create task request', parsed.error.issues.map(i => i.message));

    const resolvedAssigneeId = parsed.data.assigneeId || parsed.data.assignedTo;
    if (!resolvedAssigneeId)
      return clientError(res, 400, 'assigneeId is required');

    const assigneeExists = await db.getUserById(resolvedAssigneeId);
    if (!assigneeExists) return clientError(res, 404, 'Assignee not found');

    if (parsed.data.projectId) {
      const projectExists = await db.getProjectById(parsed.data.projectId);
      if (!projectExists) return clientError(res, 404, 'Project not found');
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
    await services.recordAnalyticsEvent({
      pageViewsDelta: 1,
      trafficSource: "Direct",
    });

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: { task },
    });
  } catch (error) {
    logger("NEW_TASK").error(error);
    return serverError(res, error, 'Failed to create task.');
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}:
 * get:
 * summary: Get full task details by ID
 * tags: [Tasks]
 * parameters:
 * - in: path
 * name: taskId
 * required: true
 * schema:
 * type: string
 * responses:
 * 200:
 * description: Task details fetched successfully
 * 404:
 * description: Task not found
 */
router.get("/:taskId", tasksRateLimiter, async (req, res) => {
  try {
    const task = await db.getTaskDetailById(req.params.taskId);
    if (!task)
      return clientError(res, 404, 'Task not found');

    const now = Date.now();
    return res.status(200).json({
      success: true,
      message: "Task details fetched successfully",
      data: {
        task: {
          ...task,
          isOverdue: task.dueDate ? task.dueDate < now && task.status !== "Done" : false,
        },
      },
    });
  } catch (error) {
    logger("GET_TASK").error(error);
    return serverError(res, error, 'Failed to fetch task.');
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}:
 * patch:
 * summary: Update an existing task (Admin Only)
 * tags: [Tasks]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: taskId
 * required: true
 * schema:
 * type: string
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * description: All fields are optional for updates
 * responses:
 * 200:
 * description: Task updated successfully
 * 404:
 * description: Task not found
 */
router.patch(
  "/:taskId",
  middlewares.adminOnly,
  tasksRateLimiter,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success)
        return clientError(res, 400, 'Couldn\'t complete update task request', parsed.error.issues.map(i => i.message));

      const existing = await db.getTaskById(taskId);
      if (!existing)
        return clientError(res, 404, 'Task not found');

      const resolvedAssigneeId = parsed.data.assigneeId || parsed.data.assignedTo;
      if (resolvedAssigneeId) {
        const assigneeExists = await db.getUserById(resolvedAssigneeId);
        if (!assigneeExists)
          return clientError(res, 404, 'Assignee not found');
      }

      if (parsed.data.projectId) {
        const projectExists = await db.getProjectById(parsed.data.projectId);
        if (!projectExists)
          return clientError(res, 404, 'Project not found');
      }

      const updateData = { ...parsed.data, updatedAt: Date.now() };
      if (updateData.assignedTo && !updateData.assigneeId)
        updateData.assigneeId = updateData.assignedTo;
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
      await services.recordAnalyticsEvent({
        pageViewsDelta: 1,
        trafficSource: "Direct",
      });

      return res
        .status(200)
        .json({ success: true, message: "Task updated successfully" });
    } catch (error) {
      logger("UPDATE_TASK").error(error);
      return serverError(res, error, 'Failed to update task.');
    }
  },
);

router.delete("/:taskId", middlewares.adminOnly, tasksRateLimiter, async (req, res) => {
  try {
    const { taskId } = req.params;
    const existing = await db.getTaskById(taskId);
    if (!existing) {
      return clientError(res, 404, 'Task not found');
    }

    await db.deleteTaskById(taskId);
    await services.logActivity({
      type: "task.deleted",
      actorId: req.user?.userId || null,
      entityId: taskId,
      entityType: "task",
      message: `${existing.title || "Task"} was deleted`,
      meta: {},
    });

    return res.status(200).json({ success: true, message: "Task deleted successfully" });
  } catch (error) {
    logger("DELETE_TASK").error(error);
    return serverError(res, error, 'Failed to delete task.');
  }
});

module.exports = router;
