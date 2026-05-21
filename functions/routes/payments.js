const express = require("express");
const { z } = require("zod");

const middlewares = require("../middlewares");
const { logger, generateToken } = require("../helpers");
const db = require("../db");
const models = require("../models");
const services = require("../services");

const router = express.Router();
const { payments: paymentsRateLimiter } = middlewares.rateLimiters;

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

function normalizePaymentPayload(body = {}) {
  return {
    ...body,
    projectName: body.projectName || body.project,
    source: body.source || null,
    notes: body.notes || "",
  };
}

function formatPayment(payment) {
  return {
    id: payment.id,
    clientId: payment.clientId || null,
    client: payment.clientName,
    clientName: payment.clientName,
    projectId: payment.projectId || null,
    project: payment.projectName,
    projectName: payment.projectName,
    amount: payment.amount,
    status: payment.status,
    date: payment.date,
    source: payment.source || null,
    notes: payment.notes || "",
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

async function enrichPaymentData(payload) {
  const data = { ...payload };

  if (data.clientId) {
    const client = await db.getClientById(data.clientId);
    if (!client) return { error: "Client not found" };
    if (!data.clientName) data.clientName = client.companyName || client.fullName;
  }

  if (data.projectId) {
    const project = await db.getProjectById(data.projectId);
    if (!project) return { error: "Project not found" };
    if (!data.projectName) data.projectName = project.name;
    if (!data.clientId && project.clientId) data.clientId = project.clientId;

    if (!data.clientName && project.clientId) {
      const client = await db.getClientById(project.clientId);
      if (client) data.clientName = client.companyName || client.fullName;
    }
  }

  return { data };
}

router.get("/", paymentsRateLimiter, async (req, res) => {
  try {
    const parsed = paymentListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        data: { errors: parsed.error.issues.map((issue) => issue.message) },
      });
    }

    const from = parseDateQuery(parsed.data.from);
    const to = parseDateQuery(parsed.data.to, true);
    if (from === null || to === null) {
      return res.status(400).json({ success: false, message: "Invalid date range" });
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
    return res.status(500).json({ success: false, message: "An unknown error occurred" });
  }
});

router.post("/", middlewares.adminOnly, paymentsRateLimiter, async (req, res) => {
  try {
    const parsed = models.payment.createPaymentSchema.safeParse(normalizePaymentPayload(req.body));
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Couldn't complete create payment request",
        data: { errors: parsed.error.issues.map((issue) => issue.message) },
      });
    }

    const enriched = await enrichPaymentData(parsed.data);
    if (enriched.error) {
      return res.status(404).json({ success: false, message: enriched.error });
    }

    const now = Date.now();
    const payment = {
      id: generateToken(),
      clientId: enriched.data.clientId || null,
      clientName: enriched.data.clientName,
      projectId: enriched.data.projectId || null,
      projectName: enriched.data.projectName,
      amount: Number(enriched.data.amount),
      status: enriched.data.status,
      date: enriched.data.date,
      source: enriched.data.source || null,
      notes: enriched.data.notes || "",
      createdAt: now,
      updatedAt: now,
    };

    const newPayment = await db.addPayment(payment);
    await services.logActivity({
      type: "payment.created",
      actorId: req.user?.userId || null,
      entityId: payment.id,
      entityType: "payment",
      message: `${payment.clientName} payment was created`,
      meta: { amount: payment.amount, status: payment.status },
    });

    return res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: { payment: formatPayment(newPayment) },
    });
  } catch (error) {
    logger("NEW_PAYMENT").error(error);
    return res.status(500).json({ success: false, message: "An unknown error occurred" });
  }
});

router.get("/:paymentId", paymentsRateLimiter, async (req, res) => {
  try {
    const payment = await db.getPaymentById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Fetch payment success",
      data: { payment: formatPayment(payment) },
    });
  } catch (error) {
    logger("GET_PAYMENT").error(error);
    return res.status(500).json({ success: false, message: "An unknown error occurred" });
  }
});

router.patch("/:paymentId", middlewares.adminOnly, paymentsRateLimiter, async (req, res) => {
  try {
    const existing = await db.getPaymentById(req.params.paymentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    const parsed = models.payment.updatePaymentSchema.safeParse(normalizePaymentPayload(req.body));
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid update payload data",
        data: { errors: parsed.error.issues.map((issue) => issue.message) },
      });
    }

    const enriched = await enrichPaymentData(parsed.data);
    if (enriched.error) {
      return res.status(404).json({ success: false, message: enriched.error });
    }

    const updateData = {
      ...enriched.data,
      updatedAt: Date.now(),
    };
    delete updateData.project;

    const updatedPayment = await db.updatePayment(req.params.paymentId, updateData);
    await services.logActivity({
      type: "payment.updated",
      actorId: req.user?.userId || null,
      entityId: req.params.paymentId,
      entityType: "payment",
      message: `${existing.clientName || "Payment"} payment was updated`,
      meta: { fields: Object.keys(updateData) },
    });

    return res.status(200).json({
      success: true,
      message: "Payment updated successfully",
      data: { payment: formatPayment(updatedPayment) },
    });
  } catch (error) {
    logger("UPDATE_PAYMENT").error(error);
    return res.status(500).json({ success: false, message: "An unknown error occurred" });
  }
});

router.delete("/:paymentId", middlewares.adminOnly, paymentsRateLimiter, async (req, res) => {
  try {
    const existing = await db.getPaymentById(req.params.paymentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    await db.deletePayment(req.params.paymentId);
    await services.logActivity({
      type: "payment.deleted",
      actorId: req.user?.userId || null,
      entityId: req.params.paymentId,
      entityType: "payment",
      message: `${existing.clientName || "Payment"} payment was deleted`,
    });

    return res.status(200).json({
      success: true,
      message: "Payment deleted successfully",
    });
  } catch (error) {
    logger("DELETE_PAYMENT").error(error);
    return res.status(500).json({ success: false, message: "An unknown error occurred" });
  }
});

module.exports = router;
