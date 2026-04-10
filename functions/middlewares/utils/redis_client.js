const { createClient } = require('redis');
const { logger } = require('../../helpers');

const redisClient = createClient({
  url: process.env.NODE_ENV === 'production' ? process.env.REDIS_URL_PROD : process.env.REDIS_URL
});

redisClient.on('error', (err) => {
  logger('REDIS_CLIENT').error(err);
});

redisClient.connect().catch((err) => logger('REDIS_CLIENT').error(err));

module.exports = redisClient;
