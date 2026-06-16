const express = require("express");
const { z } = require("zod");

const middlewares = require("../middlewares");
const { logger, generateToken, serverError, clientError } = require("../helpers");
const db = require("../db");
const models = require("../models");
const services = require("../services");

const router = express.Router();

const emptyToUndefined = (value) => (value === "" ? undefined : value);

const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
  search: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  status: z.preprocess(emptyToUndefined, models.payment.paymentStatusEnum.optional()),
  from: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  to: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

function parseDateQuery(value, endOfDay = false) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  if (!endOfDay) return parsed;

  const date = new Date(parsed);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999);
}

function formatPayment(payment) {
  return {
    id: payment.id,
    clientId: payment.clientId,
    projectId: payment.projectId,
    amount: payment.amount,
    status: payment.status,
    date: payment.date,
    source: payment.source || null,
    notes: payment.notes || "",
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

function getPaymentReferenceErrorStatus(message) {
  if (message === "Project does not belong to supplied client") return 409;
  if (message === "clientId and projectId are required") return 400;
  return 404;
}

async function validatePaymentReferences(clientId, projectId) {
  if (!clientId || !projectId) return { error: "clientId and projectId are required" };

  const [client, project] = await Promise.all([
    db.getClientById(clientId),
    db.getProjectById(projectId),
  ]);

  if (!client) return { error: "Client not found" };
  if (!project) return { error: "Project not found" };
  if (project.clientId && project.clientId !== clientId) {
    return { error: "Project does not belong to supplied client" };
  }

  return { client, project };
}

router.get("/", middlewares.adminOnly, async (req, res) => {
  try {
    const parsed = paymentListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return clientError(res, 400, 'Invalid query parameters', parsed.error.issues.map(i => i.message));
    }

    const from = parseDateQuery(parsed.data.from);
    const to = parseDateQuery(parsed.data.to, true);
    if (from === null || to === null) {
      return clientError(res, 400, 'Invalid date range');
    }

    const { page, limit, search, status } = parsed.data;
    const { rows, total } = await db.getPayments({
      page,
      limit,
      search,
      status,
      from,
      to,
    });

    return res.status(200).json({
      success: true,
      message: "Fetch payments success",
      data: {
        payments: rows.map(formatPayment),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger("ALL_PAYMENTS").error(error);
    return serverError(res, error, 'Failed to fetch payments.');
  }
});

const LEGACY_PAYMENT_FIELDS = ["clientName", "projectName", "project"];

function rejectLegacyPaymentFields(body) {
  if (!body || typeof body !== "object") return null;
  const field = LEGACY_PAYMENT_FIELDS.find((f) => Object.prototype.hasOwnProperty.call(body, f));
  if (!field) return null;
  const suggested = field === "project" ? "projectId" : field === "clientName" ? "clientId" : "projectId";
  return `Field '${field}' is not recognized. Use '${suggested}' instead.`;
}

router.post("/", middlewares.adminOnly, async (req, res) => {
  try {
    const legacyError = rejectLegacyPaymentFields(req.body);
    if (legacyError) {
      return clientError(res, 400, legacyError);
    }

    const parsed = models.payment.createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 400, 'Couldn\'t complete create payment request', parsed.error.issues.map(i => i.message));
    }

    const references = await validatePaymentReferences(parsed.data.clientId, parsed.data.projectId);
    if (references.error) {
      return clientError(res, getPaymentReferenceErrorStatus(references.error), references.error);
    }

    const now = Date.now();
    const payment = {
      id: generateToken(),
      clientId: parsed.data.clientId,
      projectId: parsed.data.projectId,
      amount: Number(parsed.data.amount),
      status: parsed.data.status,
      date: parsed.data.date,
      source: parsed.data.source || null,
      notes: parsed.data.notes || "",
      createdAt: now,
      updatedAt: now,
    };

    const newPayment = await db.addPayment(payment);
    await services.logActivity({
      type: "payment.created",
      actorId: req.user?.userId || null,
      entityId: payment.id,
      entityType: "payment",
      message: `Payment ${payment.id} was created`,
      meta: { amount: payment.amount, status: payment.status },
    });
    return res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: { payment: formatPayment(newPayment) },
    });
  } catch (error) {
    logger("NEW_PAYMENT").error(error);
    return serverError(res, error, 'Failed to create payment.');
  }
});

router.get("/:paymentId", async (req, res) => {
  try {
    const payment = await db.getPaymentById(req.params.paymentId);
    if (!payment) {
      return clientError(res, 404, 'Payment not found');
    }

    return res.status(200).json({
      success: true,
      message: "Fetch payment success",
      data: { payment: formatPayment(payment) },
    });
  } catch (error) {
    logger("GET_PAYMENT").error(error);
    return serverError(res, error, 'Failed to fetch payment.');
  }
});

router.patch("/:paymentId", middlewares.adminOnly, async (req, res) => {
  try {
    const legacyError = rejectLegacyPaymentFields(req.body);
    if (legacyError) {
      return clientError(res, 400, legacyError);
    }

    const existing = await db.getPaymentById(req.params.paymentId);
    if (!existing) {
      return clientError(res, 404, 'Payment not found');
    }

    const parsed = models.payment.updatePaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 400, 'Invalid update payload data', parsed.error.issues.map(i => i.message));
    }

    const effectiveClientId = parsed.data.clientId || existing.clientId;
    const effectiveProjectId = parsed.data.projectId || existing.projectId;
    const references = await validatePaymentReferences(effectiveClientId, effectiveProjectId);
    if (references.error) {
      return clientError(res, getPaymentReferenceErrorStatus(references.error), references.error);
    }

    const updateData = {
      ...parsed.data,
      updatedAt: Date.now(),
    };

    const updatedPayment = await db.updatePayment(req.params.paymentId, updateData);
    await services.logActivity({
      type: "payment.updated",
      actorId: req.user?.userId || null,
      entityId: req.params.paymentId,
      entityType: "payment",
      message: `Payment ${existing.id || req.params.paymentId} was updated`,
      meta: { fields: Object.keys(updateData) },
    });
    return res.status(200).json({
      success: true,
      message: "Payment updated successfully",
      data: { payment: formatPayment(updatedPayment) },
    });
  } catch (error) {
    logger("UPDATE_PAYMENT").error(error);
    return serverError(res, error, 'Failed to update payment.');
  }
});

router.delete("/:paymentId", middlewares.adminOnly, async (req, res) => {
  try {
    const existing = await db.getPaymentById(req.params.paymentId);
    if (!existing) {
      return clientError(res, 404, 'Payment not found');
    }

    await db.deletePayment(req.params.paymentId);
    await services.logActivity({
      type: "payment.deleted",
      actorId: req.user?.userId || null,
      entityId: req.params.paymentId,
      entityType: "payment",
      message: `Payment ${existing.id || req.params.paymentId} was deleted`,
    });
    return res.status(200).json({
      success: true,
      message: "Payment deleted successfully",
    });
  } catch (error) {
    logger("DELETE_PAYMENT").error(error);
    return serverError(res, error, 'Failed to delete payment.');
  }
});

module.exports = router;
