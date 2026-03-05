/**
 * Tests for the scheduler service
 */

import { Scheduler } from '../src/scheduler/scheduler.js';
import { jobRegistry } from '../src/models/job-registry.js';
import { JobPriority, JobStatus } from '../src/types/job.types.js';
import { JobContext } from '../src/types/job.types.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeAll(() => {
    scheduler = new Scheduler();
  });

  afterAll(async () => {
    await scheduler.close();
  });

  beforeEach(() => {
    jobRegistry.clear();
  });

  describe('Job Registration', () => {
    it('should register a job successfully', () => {
      const handler = async (context: JobContext) => {
        return { success: true };
      };

      jobRegistry.register({
        name: 'test-job',
        handler,
      });

      expect(jobRegistry.has('test-job')).toBe(true);
      expect(jobRegistry.get('test-job')).toBeDefined();
    });

    it('should throw error when scheduling unregistered job', async () => {
      await expect(
        scheduler.scheduleOnce('non-existent-job')
      ).rejects.toThrow('Job "non-existent-job" is not registered');
    });
  });

  describe('One-time Jobs', () => {
    it('should schedule a one-time job', async () => {
      const handler = async (context: JobContext) => {
        return { message: 'Hello' };
      };

      jobRegistry.register({
        name: 'one-time-test',
        handler,
      });

      const jobId = await scheduler.scheduleOnce('one-time-test', { test: 'data' });
      expect(jobId).toBeDefined();

      // Wait a bit for job to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const job = await scheduler.getJobStatus('one-time-test', jobId);
      expect(job).toBeDefined();
    }, 10000);

    it('should schedule a delayed job', async () => {
      const handler = async (context: JobContext) => {
        return { delayed: true };
      };

      jobRegistry.register({
        name: 'delayed-test',
        handler,
      });

      const jobId = await scheduler.scheduleOnce('delayed-test', {}, { delay: 2000 });
      expect(jobId).toBeDefined();

      const job = await scheduler.getJobStatus('delayed-test', jobId);
      expect(job?.status).toBe(JobStatus.DELAYED);
    }, 10000);
  });

  describe('Cron Jobs', () => {
    it('should schedule a cron job', async () => {
      const handler = async (context: JobContext) => {
        return { cron: true };
      };

      jobRegistry.register({
        name: 'cron-test',
        handler,
        cronPattern: '*/1 * * * *', // Every minute
      });

      const jobId = await scheduler.scheduleCron('cron-test', '*/1 * * * *');
      expect(jobId).toBeDefined();

      const job = await scheduler.getJobStatus('cron-test', jobId);
      expect(job).toBeDefined();
    }, 10000);
  });

  describe('Job Status', () => {
    it('should get job status', async () => {
      const handler = async (context: JobContext) => {
        return { status: 'ok' };
      };

      jobRegistry.register({
        name: 'status-test',
        handler,
      });

      const jobId = await scheduler.scheduleOnce('status-test');
      const job = await scheduler.getJobStatus('status-test', jobId);

      expect(job).toBeDefined();
      expect(job?.name).toBe('status-test');
      expect(job?.id).toBe(jobId);
    }, 10000);
  });

  describe('Job Cancellation', () => {
    it('should cancel a scheduled job', async () => {
      const handler = async (context: JobContext) => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { cancelled: false };
      };

      jobRegistry.register({
        name: 'cancel-test',
        handler,
      });

      const jobId = await scheduler.scheduleOnce('cancel-test');
      const cancelled = await scheduler.cancelJob('cancel-test', jobId);

      expect(cancelled).toBe(true);
    }, 10000);
  });

  describe('Statistics', () => {
    it('should get scheduler statistics', async () => {
      const stats = await scheduler.getStats();

      expect(stats).toHaveProperty('queues');
      expect(stats).toHaveProperty('workers');
      expect(stats).toHaveProperty('activeJobs');
      expect(stats).toHaveProperty('waitingJobs');
      expect(stats).toHaveProperty('completedJobs');
      expect(stats).toHaveProperty('failedJobs');
    });
  });
});
