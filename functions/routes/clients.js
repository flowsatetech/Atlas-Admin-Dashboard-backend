const express = require("express");

const middlewares = require("../middlewares");
const { logger, generateToken, serverError, clientError } = require("../helpers");
const db = require("../db");
const { clientStatusEnum, createClientSchema, updateClientSchema, listClientsQuerySchema } = require("../models/client");
const services = require("../services");

const router = express.Router();

function formatClientForList(clientDoc, managerName = "Unassigned") {
  const assignedStaffId = clientDoc.assignedStaffId || null;

  return {
    id: clientDoc.id,
    fullName: clientDoc.fullName,
    company: clientDoc.companyName,
    companyName: clientDoc.companyName,
    email: clientDoc.email,
    phone: clientDoc.phone,
    status: clientDoc.status,
    tags: clientDoc.tags || [],
    manager: assignedStaffId ? managerName : "Unassigned",
    assignedStaffId,
    leadSource: clientDoc.leadSource || null,
    notes: clientDoc.notes || "",
    projectsCount: clientDoc.projectsCount || 0,
    createdAt: clientDoc.createdAt,
    updatedAt: clientDoc.updatedAt,
  };
}

/**
 * GET /api/clients/stats
 * Aggregates client baseline card statistics from the collection
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await db.getClientStats();
    
    res.status(200).json({
      success: true,
      message: "Fetch client stats success",
      data: stats,
    });
  } catch (e) {
    logger("CLIENT_STATS").error(e);
    return serverError(res, e, 'Failed to fetch client stats.');
  }
});

router.get("/", async (req, res) => {
  try {
    const parsedQuery = listClientsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return clientError(res, 400, 'Invalid query parameters', parsedQuery.error.issues.map(i => i.message));
    }

    const { status, page, limit } = parsedQuery.data;

    let assignedStaffId = "";
    const isAdmin = req.user?.role === 'admin';
    const includeUnassigned = req.query.includeUnassigned !== 'false';

    if (!isAdmin || (!includeUnassigned && isAdmin)) {
        assignedStaffId = req.user?.userId;
    }

    const { rows, total } = await db.getClientsPaginated({ status, page, limit, assignedStaffId });

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

    const projectCounts = await db.getProjectCountsByClientIds(rows.map((clientDoc) => clientDoc.id));
    const formattedClients = rows.map((clientDoc) => formatClientForList(
      { ...clientDoc, projectsCount: projectCounts[clientDoc.id] || 0 },
      managersMap[clientDoc.assignedStaffId] || "Unassigned",
    ));

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
    return serverError(res, e, 'Failed to fetch clients.');
  }
});

/**
 * GET /api/clients/:id
 * Fetches details for an individual client document
 */
router.get("/:id", async (req, res) => {
  try {
    const client = await db.getClientById(req.params.id);
    if (!client) {
      return clientError(res, 404, 'Client not found');
    }

    let managerName = "Unassigned";
    if (client.assignedStaffId) {
      const manager = await db.getUserById(client.assignedStaffId);
      if (manager) {
        managerName = `${manager.firstName || ""} ${manager.lastName || ""}`.trim() || manager.email || client.assignedStaffId;
      }
    }

    const [lastActivity, projects, quickInsights] = await Promise.all([
      db.getLatestClientActivity(client.id),
      db.getProjectsByClientId(client.id),
      db.getClientProjectInsights(client.id),
    ]);
    const projectsCount = quickInsights.totalProjects;

    res.status(200).json({
      success: true,
      message: "Fetch client details success",
      data: {
        client: {
          id: client.id,
          fullName: client.fullName,
          companyName: client.companyName,
          email: client.email,
          phone: client.phone,
          status: client.status,
          tags: client.tags || [],
          manager: managerName,
          assignedStaffId: client.assignedStaffId,
          leadSource: client.leadSource || null,
          notes: client.notes || "",
          notesHistory: client.notesHistory || [],
          projectsCount,
          projects,
          quickInsights,
          lastActivity: lastActivity || null,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
        },
      },
    });
  } catch (e) {
    logger("GET_CLIENT_DETAIL").error(e);
    return serverError(res, e, 'Failed to fetch client details.');
  }
});

router.post("/", middlewares.adminOnly, async (req, res) => {
  try {
    const parsed = createClientSchema.safeParse({ ...req.body, id: generateToken() });
    if (!parsed.success) {
      return clientError(res, 400, 'Couldn\'t complete create client request', parsed.error.issues.map(i => i.message));
    }

    const payload = parsed.data;

    const now = Date.now();
    const newClient = {
      id: payload.id,
      fullName: payload.fullName,
      companyName: payload.companyName,
      email: payload.email,
      phone: payload.phone,
      status: payload.status || "Lead",
      tags: payload.tags || [],
      assignedStaffId: payload.assignedStaffId || null,
      leadSource: payload.leadSource || null,
      notes: payload.notes || "",
      notesHistory: payload.notes ? [{ note: payload.notes, createdAt: now, createdBy: req.user?.userId || null }] : [],
      projectsCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (newClient.assignedStaffId) {
      const staffExists = await db.getUserById(newClient.assignedStaffId);
      if (!staffExists) {
        return clientError(res, 404, 'Assigned staff member not found');
      }
      services.NotificationService.dispatch({
          recipientId: staffExists.userId,
          type: 'CLIENT_ASSIGNMENT',
          title: 'Client Assigned',
          message: `You have been assigned to client: ${newClient.fullName}`,
          link: `/clients/${newClient.id}`,
          referenceId: newClient.id,
          referenceType: 'Client',
          createdBy: req.user?.userId
      }, 'NEW_CLIENT');
    }

    await db.addClient(newClient);

    const adminRecipients = await db.getUsersByRoles(['admin', 'manager']);
    const clientCreatedNotifications = adminRecipients
      .filter((recipient) => recipient.userId && recipient.userId !== req.user?.userId)
      .map((recipient) => ({
        recipientId: recipient.userId,
        type: 'CLIENT_CREATED',
        title: 'New Client Created',
        message: `${newClient.fullName} was added as a new client`,
        link: `/clients/${newClient.id}`,
        referenceId: newClient.id,
        referenceType: 'Client',
        createdBy: req.user?.userId
      }));

    services.NotificationService.dispatchMany(clientCreatedNotifications, 'NEW_CLIENT');
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
        client: formatClientForList(newClient, newClient.assignedStaffId || "Unassigned"),
      },
    });
  } catch (e) {
    logger("NEW_CLIENT").error(e);
    return serverError(res, e, 'Failed to create client.');
  }
});

/**
 * PATCH /api/clients/:id
 * Implements optional field mutations securely for existing client records
 */
router.patch("/:id", middlewares.adminOnly, async (req, res) => {
  try {
    const parsed = updateClientSchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 400, 'Invalid update payload data', parsed.error.issues.map(i => i.message));
    }

    const client = await db.getClientById(req.params.id);
    if (!client) {
      return clientError(res, 404, 'Client not found');
    }

    if (parsed.data.assignedStaffId) {
      const staffExists = await db.getUserById(parsed.data.assignedStaffId);
      if (!staffExists) {
        return clientError(res, 404, 'Assigned staff member not found');
      }
      if (parsed.data.assignedStaffId !== client.assignedStaffId) {
          services.NotificationService.dispatch({
              recipientId: staffExists.userId,
              type: 'CLIENT_ASSIGNMENT',
              title: 'Client Assigned',
              message: `You have been assigned to client: ${client.fullName}`,
              link: `/clients/${client.id}`,
              referenceId: client.id,
              referenceType: 'Client',
              createdBy: req.user?.userId
          }, 'UPDATE_CLIENT');
      }
    }

    const { appendNote, ...updatePayload } = parsed.data;
    const updates = {
      ...updatePayload,
      updatedAt: Date.now(),
    };

    if (appendNote) {
      const existingNotes = client.notes || "";
      const noteEntry = {
        note: appendNote,
        createdAt: updates.updatedAt,
        createdBy: req.user?.userId || null,
      };
      updates.notes = existingNotes ? `${existingNotes}\n${appendNote}` : appendNote;
      updates.notesHistory = [...(client.notesHistory || []), noteEntry];
    } else if (Object.prototype.hasOwnProperty.call(updatePayload, 'notes') && updatePayload.notes !== client.notes) {
      updates.notesHistory = [
        ...(client.notesHistory || []),
        {
          note: updatePayload.notes || "",
          previousNote: client.notes || "",
          createdAt: updates.updatedAt,
          createdBy: req.user?.userId || null,
        },
      ];
    }

    await db.updateClient(req.params.id, updates);

    await services.logActivity({
      type: "client.updated",
      actorId: req.user?.userId || null,
      entityId: client.id,
      entityType: "client",
      message: `${client.fullName} profile info was updated`,
      meta: updates,
    });

    res.status(200).json({
      success: true,
      message: "Client updated successfully",
    });
  } catch (e) {
    logger("UPDATE_CLIENT").error(e);
    return serverError(res, e, 'Failed to update client.');
  }
});

/**
 * DELETE /api/clients/:id
 * Clears an active client record from the project database collection
 */
router.delete("/:id", middlewares.adminOnly, async (req, res) => {
  try {
    const client = await db.getClientById(req.params.id);
    if (!client) {
      return clientError(res, 404, 'Client not found');
    }

    await db.deleteClient(req.params.id);

    await services.logActivity({
      type: "client.deleted",
      actorId: req.user?.userId || null,
      entityId: req.params.id,
      entityType: "client",
      message: `${client.fullName} was deleted from clients list`,
    });

    res.status(200).json({
      success: true,
      message: "Client profile successfully deleted",
    });
  } catch (e) {
    logger("DELETE_CLIENT").error(e);
    return serverError(res, e, 'Failed to delete client.');
  }
});

module.exports = router;
