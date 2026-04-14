const express = require('express');
const middlewares = require('../middlewares');
const router = express.Router();

const { health: healthLimiter } = middlewares.rateLimiters;

router.get('/', healthLimiter, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Atlas Admin Server is healthy",
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(process.uptime())}s`
    });
});

module.exports = router;