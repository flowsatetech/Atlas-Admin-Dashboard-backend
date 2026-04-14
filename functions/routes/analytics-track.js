const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");

const middlewares = require("../middlewares");
const { logger } = require("../helpers");
const { recordAnalyticsEvent, detectSourceFromReferrer } = require("../services/analytics-ingestion");

const router = express.Router();
const { analytics: analyticsRateLimiter } = middlewares.rateLimiters;

const trackSchema = z.object({
  page: z.string().trim().min(1).max(2048).default("/"),
  referrer: z.string().trim().max(2048).optional(),
  trafficSource: z.enum(["Google", "Social", "Direct", "Referral", "Email"]).optional(),
  isConversion: z.boolean().default(false),
  conversionCount: z.coerce.number().int().min(1).max(100).default(1),
});

function getOrSetAnalyticsVisitorId(req, res) {
  let visitorId = req.cookies?.aid;
  if (visitorId && typeof visitorId === "string" && visitorId.trim()) return visitorId;

  visitorId = crypto.randomUUID();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  res.cookie("aid", visitorId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: oneYearMs,
  });

  return visitorId;
}

router.post("/track", analyticsRateLimiter, async (req, res) => {
  try {
    const parsed = trackSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => issue.message);
      return res.status(400).json({
        message: "Invalid analytics payload",
        data: { details },
      });
    }

    const visitorId = getOrSetAnalyticsVisitorId(req, res);
    const payload = parsed.data;
    const referrer = payload.referrer || req.get("referer") || "";
    const source = payload.trafficSource || detectSourceFromReferrer(referrer);

    const result = await recordAnalyticsEvent({
      visitorId,
      pageViewsDelta: 1,
      conversionsDelta: payload.isConversion ? payload.conversionCount : 0,
      trafficSource: source,
      referrer,
      timestamp: Date.now(),
    });

    return res.status(201).json({
      message: "Analytics event tracked",
      data: {
        page: payload.page,
        trafficSource: result.source,
        isNewVisitor: result.isNewVisitor,
        visitors: result.visitors,
        pageViews: result.pageViews,
        conversions: result.conversions,
      },
    });
  } catch (error) {
    logger("ANALYTICS_TRACK").error(error);
    return res.status(500).json({
      message: "Failed to track analytics event",
      data: null,
    });
  }
});

module.exports = router;
