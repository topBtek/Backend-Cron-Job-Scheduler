/**
 * Express API server with health endpoint and job monitoring
 */

import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { Scheduler } from '../scheduler/scheduler.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { jobRegistry } from '../models/job-registry.js';
import { JobStatus } from '../types/job.types.js';

/**
 * Create and configure Express server
 */
export function createServer(scheduler: Scheduler): express.Application {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    logger.info({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  // Health check endpoint
  if (config.health.enabled) {
    app.get('/health', async (req, res) => {
      try {
        const stats = await scheduler.getStats();
        const registeredJobs = jobRegistry.getAllNames();

        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          scheduler: {
            queues: stats.queues,
            workers: stats.workers,
            activeJobs: stats.activeJobs,
            waitingJobs: stats.waitingJobs,
            completedJobs: stats.completedJobs,
            failedJobs: stats.failedJobs,
          },
          registeredJobs,
          redis: {
            status: 'connected', // Could check Redis connection here
          },
        });
      } catch (error) {
        logger.error({ error }, 'Health check failed');
        res.status(503).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  // Job monitoring endpoints
  app.get('/api/jobs', async (req, res) => {
    try {
      const jobName = req.query.jobName as string | undefined;
      const status = req.query.status as JobStatus | undefined;

      if (jobName) {
        const jobs = await scheduler.getJobs(jobName, status);
        res.json({ jobs });
      } else {
        // Get jobs from all queues
        const allJobs: Record<string, unknown[]> = {};
        for (const name of jobRegistry.getAllNames()) {
          allJobs[name] = await scheduler.getJobs(name, status);
        }
        res.json({ jobs: allJobs });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get jobs');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.get('/api/jobs/:jobName/:jobId', async (req, res) => {
    try {
      const { jobName, jobId } = req.params;
      const job = await scheduler.getJobStatus(jobName, jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json({ job });
    } catch (error) {
      logger.error({ error }, 'Failed to get job status');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.delete('/api/jobs/:jobName/:jobId', async (req, res) => {
    try {
      const { jobName, jobId } = req.params;
      const cancelled = await scheduler.cancelJob(jobName, jobId);

      if (!cancelled) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json({ success: true, message: 'Job cancelled' });
    } catch (error) {
      logger.error({ error }, 'Failed to cancel job');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await scheduler.getStats();
      res.json(stats);
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.get('/api/jobs/registered', (req, res) => {
    const jobs = jobRegistry.getAll().map((job) => ({
      name: job.name,
      hasCronPattern: !!job.cronPattern,
      priority: job.priority,
      maxRetries: job.maxRetries,
      concurrency: job.concurrency,
    }));
    res.json({ jobs });
  });

  // Bull Board dashboard
  if (config.dashboard.enabled) {
    const queues = scheduler.getQueues();
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(config.dashboard.path);

    createBullBoard({
      queues: queues.map((q: any) => new BullMQAdapter(q)),
      serverAdapter,
    });

    app.use(config.dashboard.path, serverAdapter.getRouter());
    logger.info({ path: config.dashboard.path }, 'Bull Board dashboard enabled');
  }

  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({ error: err, path: req.path }, 'Unhandled error');
    res.status(500).json({
      error: 'Internal server error',
      message: config.nodeEnv === 'development' ? err.message : undefined,
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
