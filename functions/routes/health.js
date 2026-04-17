const express = require("express");
const middlewares = require("../middlewares");
const router = express.Router();

const { health: healthLimiter } = middlewares.rateLimiters;

/**
 * @swagger
 * tags:
 * name: Misc
 * description: Miscellaneous utility endpoints (Health checks, etc.)
 */

/**
 * @swagger
 * /api/health:
 * get:
 * summary: Check API health status
 * tags: [Misc]
 * responses:
 * 200:
 * description: Atlas Admin Server is healthy
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * success:
 * type: boolean
 * example: true
 * message:
 * type: string
 * example: Atlas Admin Server is healthy
 * timestamp:
 * type: string
 * format: date-time
 * example: "2026-04-17T18:10:19.000Z"
 * uptime:
 * type: string
 * example: "120s"
 */
router.get("/", healthLimiter, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Atlas Admin Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

module.exports = router;