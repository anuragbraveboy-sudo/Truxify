import { redisClient } from '../config/db.js';
import logger from './logger.js';

/**
 * Express middleware to cache responses in Redis.
 * Only caches 200 OK JSON responses.
 * 
 * @param {number} ttlSeconds - Time to live for the cache in seconds.
 * @returns {Function} Express middleware
 */
export const cacheRoute = (ttlSeconds = 3600) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    if (!redisClient || redisClient.status !== 'ready') {
      logger.debug('Redis client not ready, skipping cache middleware');
      return next();
    }

    const cacheKey = `route_cache:${req.originalUrl || req.url}`;

    try {
      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        logger.debug({ cacheKey }, 'Cache hit');
        return res.json(JSON.parse(cachedData));
      }

      logger.debug({ cacheKey }, 'Cache miss');

      const originalJson = res.json.bind(res);

      res.json = (body) => {
        if (res.statusCode === 200) {
          try {
            const bodyStr = JSON.stringify(body);
            redisClient.setex(cacheKey, ttlSeconds, bodyStr).catch(err => {
              logger.error({ err, cacheKey }, 'Failed to write to Redis cache');
            });
          } catch (err) {
            logger.error({ err, cacheKey }, 'Failed to stringify response for caching');
          }
        }
        
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.error({ err, cacheKey }, 'Redis cache retrieval error');
      next();
    }
  };
};
