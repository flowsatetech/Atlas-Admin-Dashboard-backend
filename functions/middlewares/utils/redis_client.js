const { createClient } = require('redis');
const { logger } = require('../../helpers');

const redisUrl =
  process.env.NODE_ENV === 'production'
    ? process.env.REDIS_URL_PROD
    : process.env.REDIS_URL || 'redis://127.0.0.1:6379';

console.log('[REDIS_URL_USED]', redisUrl);

const redisClient = createClient({
  url: redisUrl,
});

redisClient.on('error', (err) => {
  logger('REDIS_CLIENT').error(err);
});

redisClient.connect().catch((err) => logger('REDIS_CLIENT').error(err));

module.exports = redisClient;