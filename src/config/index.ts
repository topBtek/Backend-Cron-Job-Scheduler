/**
 * Application configuration from environment variables
 */

import { RetryDelayType } from '../types/job.types.js';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    url: process.env.REDIS_URL || undefined,
  },

  scheduler: {
    concurrency: parseInt(process.env.JOB_CONCURRENCY || '5', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
    retryDelayType:
      (process.env.RETRY_DELAY_TYPE as RetryDelayType) || RetryDelayType.EXPONENTIAL,
    gracefulShutdownTimeout: parseInt(
      process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || '30000',
      10
    ),
  },

  dashboard: {
    enabled: process.env.ENABLE_DASHBOARD !== 'false',
    path: process.env.DASHBOARD_PATH || '/admin/queues',
  },

  health: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
  },
};
