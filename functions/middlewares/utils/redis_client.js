if (process.env.NODE_ENV === 'staging') {
  module.exports = require('./staging_redis');
} else {
  const { createClient } = require('redis');
  const { logger } = require('../../helpers');

  const redisUrl = process.env.NODE_ENV === 'production'
    ? process.env.REDIS_URL_PROD
    : process.env.REDIS_URL;

  const redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err) => logger('REDIS_CLIENT').error(err));
  redisClient.connect().catch((err) => logger('REDIS_CLIENT').error(err));

  module.exports = redisClient;
}