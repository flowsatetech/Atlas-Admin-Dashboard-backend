const express = require("express");
const { z } = require("zod");

const middlewares = require("../middlewares");
const { logger, generateToken } = require("../helpers");
const db = require("../db");
const { clientStatusEnum } = require("../models/client");
const services = require("../services");

const router = express.Router();
const { clients: rateLimiter } = middlewares.rateLimiters;

const listClientsQuerySchema = z.object({
  status: clientStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const strictCreateClientSchema = z.object({
  fullName: z.string().min(1),
  companyName: z.string().min(1),
  email: z.email(),
  phone: z.string().min(3),
  status: clientStatusEnum.default("Lead"),
  tags: z.array(z.string().min(1)).default([]),
  assignedStaffId: z.string().min(1).nullable().optional(),
  leadSource: z.string().min(1).nullable().optional(),
  notes: z.string().optional(),
});

// Legacy-compatible shape from teammate branch.
const legacyCreateClientSchema = z.object({
  fullName: z.string().min(1),
  companyId: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(3),
  statusId: z.string().min(1).optional(),
  tags: z.array(z.string()).default([]),
  assignedStaffId: z.string().min(1),
  notes: z.string().optional(),
  leadSource: z.string().optional(),
});

router.get("/", rateLimiter, async (req, res) => {
  try {
    const parsedQuery = listClientsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        data: { errors: parsedQuery.error.issues.map((issue) => issue.message) },
      });
    }

    const { status, page, limit } = parsedQuery.data;
    const { rows, total } = await db.getClientsPaginated({ status, page, limit });

    const managerIds = [...new Set(rows.map((client) => client.assignedStaffId).filter(Boolean))];
    const managersMap = {};
    await Promise.all(
      managerIds.map(async (managerId) => {
        const manager = await db.getUserById(managerId);
        managersMap[managerId] = manager
          ? `${manager.firstName || ""} ${manager.lastName || ""}`.trim() || manager.email || managerId
          : "Unassigned";
      }),
    );

    const formattedClients = rows.map((clientDoc) => ({
      id: clientDoc.id,
      fullName: clientDoc.fullName,
      company: clientDoc.companyName,
      status: clientDoc.status,
      tags: clientDoc.tags || [],
      manager: clientDoc.assignedStaffId ? (managersMap[clientDoc.assignedStaffId] || "Unassigned") : "Unassigned",
      projectsCount: clientDoc.projectsCount || 0,
    }));

    res.status(200).json({
      success: true,
      message: "Fetch clients success",
      data: {
        clients: formattedClients,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (e) {
    logger("ALL_CLIENTS").error(e);
    res.status(400).json({ success: false, message: "An unknown error occured" });
  }
});

router.post("/", middlewares.adminOnly, rateLimiter, async (req, res) => {
  try {
    let payload;
    const strict = strictCreateClientSchema.safeParse(req.body);
    if (strict.success) {
      payload = strict.data;
    } else {
      const legacy = legacyCreateClientSchema.safeParse(req.body);
      if (!legacy.success) {
        return res.status(400).json({
          success: false,
          message: "Couldn't complete create client request",
          data: {
            errors: [...strict.error.issues, ...legacy.error.issues].map((issue) => issue.message),
          },
        });
      }
      payload = {
        fullName: legacy.data.fullName,
        companyName: legacy.data.companyId,
        email: legacy.data.email,
        phone: legacy.data.phone,
        status: clientStatusEnum.options.includes(legacy.data.statusId) ? legacy.data.statusId : "Lead",
        tags: legacy.data.tags || [],
        assignedStaffId: legacy.data.assignedStaffId || null,
        leadSource: legacy.data.leadSource || null,
        notes: legacy.data.notes || "",
      };
    }

    const now = Date.now();
    const newClient = {
      id: generateToken(),
      fullName: payload.fullName,
      companyName: payload.companyName,
      email: payload.email,
      phone: payload.phone,
      status: payload.status || "Lead",
      tags: payload.tags || [],
      assignedStaffId: payload.assignedStaffId || null,
      leadSource: payload.leadSource || null,
      notes: payload.notes || "",
      projectsCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (newClient.assignedStaffId) {
      const staffExists = await db.getUserById(newClient.assignedStaffId);
      if (!staffExists) {
        return res.status(404).json({
          success: false,
          message: "Assigned staff member not found",
        });
      }
    }

    await db.addClient(newClient);
    await services.logActivity({
      type: "client.created",
      actorId: req.user?.userId || null,
      entityId: newClient.id,
      entityType: "client",
      message: `${newClient.fullName} was added as a new client`,
      meta: { companyName: newClient.companyName, status: newClient.status },
    });
    await services.recordAnalyticsEvent({
      visitorsDelta: 1,
      pageViewsDelta: 1,
      trafficSource: newClient.leadSource || "Direct",
    });

    res.status(201).json({
      success: true,
      message: "Client added successfully",
      data: {
        client: {
          id: newClient.id,
          fullName: newClient.fullName,
          company: newClient.companyName,
          status: newClient.status,
          tags: newClient.tags,
          manager: newClient.assignedStaffId || "Unassigned",
          projectsCount: 0,
        },
      },
    });
  } catch (e) {
    logger("NEW_CLIENT").error(e);
    res.status(400).json({ success: false, message: "An unknown error occured" });
  }
});

module.exports = router;
