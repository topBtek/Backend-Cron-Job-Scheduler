/**
 * Main scheduler service using BullMQ
 * Handles job scheduling, queue management, and lifecycle events
 */

import { Queue, QueueOptions, Worker, WorkerOptions, Job as BullJob, RepeatOptions } from 'bullmq';
import IORedis from 'ioredis';
import {
  JobDefinition,
  JobContext,
  JobEvent,
  JobEventType,
  JobPriority,
  JobStatus,
  RetryDelayType,
  ScheduledJob,
} from '../types/job.types.js';
import { jobRegistry } from '../models/job-registry.js';
import { logger } from '../utils/logger.js';
import { calculateRetryDelay } from '../utils/retry.js';
import { JobError, NonRetryableJobError } from '../utils/errors.js';
import { config } from '../config/index.js';
import { EventEmitter } from 'events';

/**
 * Main scheduler class
 */
export class Scheduler extends EventEmitter {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private redis: IORedis;
  private isShuttingDown = false;

  constructor() {
    super();
    this.redis = this.createRedisConnection();
    this.setupGracefulShutdown();
  }

  /**
   * Create Redis connection
   */
  private createRedisConnection(): IORedis {
    const redisConfig: IORedis.RedisOptions = config.redis.url
      ? { enableReadyCheck: true, maxRetriesPerRequest: null }
      : {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
          enableReadyCheck: true,
          maxRetriesPerRequest: null,
        };

    const connection = config.redis.url
      ? new IORedis(config.redis.url, redisConfig)
      : new IORedis(redisConfig);

    connection.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    connection.on('connect', () => {
      logger.info('Redis connected');
    });

    return connection;
  }

  /**
   * Get or create a queue for a job type
   */
  private getOrCreateQueue(jobName: string, jobDef: JobDefinition): Queue {
    if (this.queues.has(jobName)) {
      return this.queues.get(jobName)!;
    }

    const queueOptions: QueueOptions = {
      connection: this.redis,
      defaultJobOptions: {
        attempts: jobDef.maxRetries + 1, // +1 for initial attempt
        backoff: {
          type: jobDef.retryDelayType === RetryDelayType.EXPONENTIAL ? 'exponential' : 'fixed',
          delay: jobDef.retryDelay,
        },
        removeOnComplete: jobDef.removeOnComplete ? { count: 100 } : false,
        removeOnFail: jobDef.removeOnFail ? { count: 50 } : false,
        priority: jobDef.priority,
      },
    };

    const queue = new Queue(jobName, queueOptions);

    // Set up queue event listeners
    this.setupQueueEvents(queue, jobName);

    this.queues.set(jobName, queue);
    logger.info({ jobName }, 'Queue created');

    return queue;
  }

  /**
   * Set up queue event listeners
   */
  private setupQueueEvents(queue: Queue, jobName: string): void {
    queue.on('added', (job: BullJob) => {
      this.emitJobEvent({
        jobId: job.id!,
        jobName,
        eventType: JobEventType.CREATED,
        timestamp: new Date(),
        data: { data: job.data },
      });
    });

    queue.on('completed', (job: BullJob, result: unknown) => {
      this.emitJobEvent({
        jobId: job.id!,
        jobName,
        eventType: JobEventType.COMPLETED,
        timestamp: new Date(),
        data: { result, attempts: job.attemptsMade },
      });
    });

    queue.on('failed', (job: BullJob | undefined, error: Error) => {
      if (job) {
        this.emitJobEvent({
          jobId: job.id!,
          jobName,
          eventType: JobEventType.FAILED,
          timestamp: new Date(),
          error,
          attempt: job.attemptsMade,
          data: { willRetry: job.attemptsMade < job.opts.attempts! },
        });
      }
    });

    queue.on('progress', (job: BullJob, progress: number | object) => {
      this.emitJobEvent({
        jobId: job.id!,
        jobName,
        eventType: JobEventType.PROGRESS,
        timestamp: new Date(),
        data: { progress },
      });
    });
  }

  /**
   * Get or create a worker for a job type
   */
  private getOrCreateWorker(jobName: string, jobDef: JobDefinition): Worker {
    if (this.workers.has(jobName)) {
      return this.workers.get(jobName)!;
    }

    const concurrency = jobDef.concurrency || config.scheduler.concurrency;

    const workerOptions: WorkerOptions = {
      connection: this.redis,
      concurrency,
      limiter: {
        max: concurrency,
        duration: 1000,
      },
    };

    const worker = new Worker(
      jobName,
      async (job: BullJob) => {
        return this.processJob(job, jobDef);
      },
      workerOptions
    );

    // Set up worker event listeners
    this.setupWorkerEvents(worker, jobName);

    this.workers.set(jobName, worker);
    logger.info({ jobName, concurrency }, 'Worker created');

    return worker;
  }

  /**
   * Set up worker event listeners
   */
  private setupWorkerEvents(worker: Worker, jobName: string): void {
    worker.on('active', (job: BullJob) => {
      this.emitJobEvent({
        jobId: job.id!,
        jobName,
        eventType: JobEventType.STARTED,
        timestamp: new Date(),
        attempt: job.attemptsMade + 1,
      });
    });

    worker.on('completed', (job: BullJob) => {
      logger.info(
        {
          jobId: job.id,
          jobName,
          attempts: job.attemptsMade,
          duration: Date.now() - job.timestamp,
        },
        'Job completed successfully'
      );
    });

    worker.on('failed', (job: BullJob | undefined, error: Error) => {
      if (job) {
        const willRetry = job.attemptsMade < job.opts.attempts!;
        logger.warn(
          {
            jobId: job.id,
            jobName,
            attempt: job.attemptsMade,
            willRetry,
            error: error.message,
          },
          'Job failed'
        );

        if (willRetry) {
          const delay = calculateRetryDelay(
            job.attemptsMade + 1,
            config.scheduler.retryDelay,
            config.scheduler.retryDelayType
          );
          this.emitJobEvent({
            jobId: job.id!,
            jobName,
            eventType: JobEventType.RETRY,
            timestamp: new Date(),
            error,
            attempt: job.attemptsMade + 1,
            data: { retryDelay: delay },
          });
        }
      }
    });

    worker.on('error', (error: Error) => {
      logger.error({ error, jobName }, 'Worker error');
    });
  }

  /**
   * Process a job
   */
  private async processJob(job: BullJob, jobDef: JobDefinition): Promise<unknown> {
    const startTime = Date.now();
    const jobData = (job.data || {}) as Record<string, unknown>;

    const context: JobContext = {
      jobId: job.id!,
      jobName: jobDef.name,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts || 1,
      data: jobData,
      progress: async (progress: number) => {
        await job.updateProgress(progress);
      },
      log: (message: string, meta?: Record<string, unknown>) => {
        logger.info({ jobId: job.id, jobName: jobDef.name, ...meta }, message);
      },
    };

    try {
      // Handle timeout if specified
      let result: unknown;
      if (jobDef.timeout) {
        result = await Promise.race([
          jobDef.handler(context),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Job timeout after ${jobDef.timeout}ms`)),
              jobDef.timeout
            )
          ),
        ]);
      } else {
        result = await jobDef.handler(context);
      }

      const duration = Date.now() - startTime;
      logger.info(
        {
          jobId: job.id,
          jobName: jobDef.name,
          duration,
          attempt: context.attempt,
        },
        'Job handler completed'
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const jobError =
        error instanceof JobError
          ? error
          : new JobError(
              error instanceof Error ? error.message : 'Unknown error',
              job.id,
              jobDef.name
            );

      // If error is non-retryable, throw it to prevent retries
      if (error instanceof NonRetryableJobError) {
        logger.error(
          {
            jobId: job.id,
            jobName: jobDef.name,
            duration,
            attempt: context.attempt,
            error: jobError.message,
          },
          'Job failed (non-retryable)'
        );
        throw error;
      }

      // Otherwise, let BullMQ handle retries
      logger.error(
        {
          jobId: job.id,
          jobName: jobDef.name,
          duration,
          attempt: context.attempt,
          error: jobError.message,
          willRetry: context.attempt < context.maxAttempts,
        },
        'Job handler failed'
      );

      throw error;
    }
  }

  /**
   * Schedule a recurring job with cron pattern
   */
  async scheduleCron(
    jobName: string,
    cronPattern: string,
    data?: Record<string, unknown>,
    options?: { priority?: JobPriority; startDate?: Date; endDate?: Date }
  ): Promise<string> {
    const jobDef = jobRegistry.get(jobName);
    if (!jobDef) {
      throw new Error(`Job "${jobName}" is not registered`);
    }

    const queue = this.getOrCreateQueue(jobName, jobDef);
    this.getOrCreateWorker(jobName, jobDef);

    const repeatOptions: RepeatOptions = {
      pattern: cronPattern,
      tz: 'UTC',
    };

    if (options?.startDate) {
      repeatOptions.startDate = options.startDate;
    }
    if (options?.endDate) {
      repeatOptions.endDate = options.endDate;
    }

    const job = await queue.add(
      `${jobName}-repeat`,
      data || jobDef.data || {},
      {
        repeat: repeatOptions,
        priority: options?.priority || jobDef.priority,
        jobId: `cron-${jobName}-${Date.now()}`,
      }
    );

    logger.info(
      {
        jobId: job.id,
        jobName,
        cronPattern,
      },
      'Cron job scheduled'
    );

    this.emitJobEvent({
      jobId: job.id!,
      jobName,
      eventType: JobEventType.SCHEDULED,
      timestamp: new Date(),
      data: { cronPattern, data },
    });

    return job.id!;
  }

  /**
   * Schedule a one-time job with optional delay
   */
  async scheduleOnce(
    jobName: string,
    data?: Record<string, unknown>,
    options?: { delay?: number; priority?: JobPriority }
  ): Promise<string> {
    const jobDef = jobRegistry.get(jobName);
    if (!jobDef) {
      throw new Error(`Job "${jobName}" is not registered`);
    }

    const queue = this.getOrCreateQueue(jobName, jobDef);
    this.getOrCreateWorker(jobName, jobDef);

    const jobOptions: { delay?: number; priority?: number; jobId?: string } = {
      priority: options?.priority || jobDef.priority,
      jobId: `once-${jobName}-${Date.now()}`,
    };

    if (options?.delay) {
      jobOptions.delay = options.delay;
    }

    const job = await queue.add(jobName, data || jobDef.data || {}, jobOptions);

    logger.info(
      {
        jobId: job.id,
        jobName,
        delay: options?.delay,
      },
      'One-time job scheduled'
    );

    this.emitJobEvent({
      jobId: job.id!,
      jobName,
      eventType: JobEventType.SCHEDULED,
      timestamp: new Date(),
      data: { delay: options?.delay, data },
    });

    return job.id!;
  }

  /**
   * Cancel a scheduled job
   */
  async cancelJob(jobName: string, jobId: string): Promise<boolean> {
    const queue = this.queues.get(jobName);
    if (!queue) {
      return false;
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return false;
    }

    await job.remove();
    logger.info({ jobId, jobName }, 'Job cancelled');

    this.emitJobEvent({
      jobId,
      jobName,
      eventType: JobEventType.CANCELLED,
      timestamp: new Date(),
    });

    return true;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobName: string, jobId: string): Promise<ScheduledJob | null> {
    const queue = this.queues.get(jobName);
    if (!queue) {
      return null;
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const repeatJobKey = await job.getRepeatJobKey();

    return {
      id: job.id!,
      name: jobName,
      status: this.mapBullMQStateToStatus(state),
      priority: (job.opts.priority as JobPriority) || JobPriority.MEDIUM,
      scheduledAt: job.timestamp ? new Date(job.timestamp) : undefined,
      startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      attempts: job.attemptsMade,
      maxRetries: (job.opts.attempts || 1) - 1,
      data: job.data as Record<string, unknown>,
      error: job.failedReason || undefined,
      cronPattern: repeatJobKey ? await this.getCronPattern(queue, repeatJobKey) : undefined,
      nextRunAt: repeatJobKey ? await this.getNextRunTime(queue, repeatJobKey) : undefined,
    };
  }

  /**
   * Get all jobs for a queue
   */
  async getJobs(jobName: string, status?: JobStatus): Promise<ScheduledJob[]> {
    const queue = this.queues.get(jobName);
    if (!queue) {
      return [];
    }

    let jobs: BullJob[] = [];
    if (status) {
      const state = this.mapStatusToBullMQState(status);
      jobs = await queue.getJobs([state], 0, 100);
    } else {
      jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'], 0, 100);
    }

    return Promise.all(jobs.map((job) => this.getJobStatus(jobName, job.id!)));
  }

  /**
   * Get all queues (for dashboard)
   */
  getQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<{
    queues: number;
    workers: number;
    activeJobs: number;
    waitingJobs: number;
    completedJobs: number;
    failedJobs: number;
  }> {
    let activeJobs = 0;
    let waitingJobs = 0;
    let completedJobs = 0;
    let failedJobs = 0;

    for (const queue of this.queues.values()) {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);

      waitingJobs += waiting;
      activeJobs += active;
      completedJobs += completed;
      failedJobs += failed;
    }

    return {
      queues: this.queues.size,
      workers: this.workers.size,
      activeJobs,
      waitingJobs,
      completedJobs,
      failedJobs,
    };
  }

  /**
   * Emit job event
   */
  private emitJobEvent(event: JobEvent): void {
    this.emit('jobEvent', event);
    logger.debug({ event }, 'Job event emitted');
  }

  /**
   * Map BullMQ state to JobStatus
   */
  private mapBullMQStateToStatus(state: string): JobStatus {
    switch (state) {
      case 'completed':
        return JobStatus.COMPLETED;
      case 'failed':
        return JobStatus.FAILED;
      case 'active':
        return JobStatus.ACTIVE;
      case 'waiting':
        return JobStatus.QUEUED;
      case 'delayed':
        return JobStatus.DELAYED;
      default:
        return JobStatus.SCHEDULED;
    }
  }

  /**
   * Map JobStatus to BullMQ state
   */
  private mapStatusToBullMQState(status: JobStatus): string {
    switch (status) {
      case JobStatus.COMPLETED:
        return 'completed';
      case JobStatus.FAILED:
        return 'failed';
      case JobStatus.ACTIVE:
        return 'active';
      case JobStatus.QUEUED:
        return 'waiting';
      case JobStatus.DELAYED:
        return 'delayed';
      default:
        return 'waiting';
    }
  }

  /**
   * Get cron pattern for a repeat job
   */
  private async getCronPattern(queue: Queue, repeatJobKey: string): Promise<string | undefined> {
    const repeat = await queue.getRepeatableJobs();
    const repeatJob = repeat.find((r) => r.key === repeatJobKey);
    return repeatJob?.pattern;
  }

  /**
   * Get next run time for a repeat job
   */
  private async getNextRunTime(queue: Queue, repeatJobKey: string): Promise<Date | undefined> {
    const repeat = await queue.getRepeatableJobs();
    const repeatJob = repeat.find((r) => r.key === repeatJobKey);
    return repeatJob?.next ? new Date(repeatJob.next) : undefined;
  }

  /**
   * Set up graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        return;
      }

      this.isShuttingDown = true;
      logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

      // Close workers (allow current jobs to finish)
      const workerClosePromises = Array.from(this.workers.values()).map((worker) =>
        worker.close(true, config.scheduler.gracefulShutdownTimeout)
      );

      // Close queues
      const queueClosePromises = Array.from(this.queues.values()).map((queue) => queue.close());

      try {
        await Promise.all([...workerClosePromises, ...queueClosePromises]);
        await this.redis.quit();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    for (const worker of this.workers.values()) {
      await worker.close();
    }

    for (const queue of this.queues.values()) {
      await queue.close();
    }

    await this.redis.quit();
    logger.info('Scheduler closed');
  }
}
