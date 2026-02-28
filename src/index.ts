/**
 * Main entry point for the cron job scheduler application
 */

import 'dotenv/config';
import { Scheduler } from './scheduler/scheduler.js';
import { createServer } from './api/server.js';
import { registerExampleJobs } from './jobs/example-jobs.js';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';
import { JobPriority } from './types/job.types.js';

/**
 * Main application function
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting cron job scheduler...');

    // Initialize scheduler
    const scheduler = new Scheduler();

    // Register example jobs (in production, register your own jobs)
    registerExampleJobs();

    // Set up job event listeners
    scheduler.on('jobEvent', (event) => {
      logger.debug(
        {
          jobId: event.jobId,
          jobName: event.jobName,
          eventType: event.eventType,
          attempt: event.attempt,
        },
        'Job event'
      );
    });

    // Schedule example cron jobs
    await scheduler.scheduleCron('data-cleanup', '0 2 * * *');
    await scheduler.scheduleCron('api-polling', '*/5 * * * *');
    await scheduler.scheduleCron('report-generation', '0 3 * * *');

    // Schedule a one-time delayed job (runs in 10 seconds)
    await scheduler.scheduleOnce('email-batch', { emails: ['test@example.com'] }, { delay: 10000 });

    // Create and start Express server
    const app = createServer(scheduler);
    const server = app.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          dashboard: config.dashboard.enabled
            ? `http://localhost:${config.port}${config.dashboard.path}`
            : 'disabled',
          health: `http://localhost:${config.port}/health`,
        },
        'Server started'
      );
    });

    // Graceful shutdown for HTTP server
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down server...');
      server.close(async () => {
        await scheduler.close();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    logger.info('Cron job scheduler is running');
  } catch (error) {
    logger.error({ error }, 'Failed to start application');
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  logger.error({ error }, 'Unhandled error in main');
  process.exit(1);
});
