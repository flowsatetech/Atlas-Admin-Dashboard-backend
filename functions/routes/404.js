/** IMPORT */
const express = require('express');
const rateLimiters = require('../middlewares/rate_limiters');

/** SETUP */
const router = express.Router();

/** MAIN 404 ROUTE 
 * Removing the path string entirely prevents the Regex crash.
 * This function will now run for any request that enters this router.
 */
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `The route ${req.originalUrl} does not exist on this server.`,
  });
});

/** EXPORTS */
module.exports = router;