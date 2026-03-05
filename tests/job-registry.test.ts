/**
 * Tests for job registry
 */

import { jobRegistry } from '../src/models/job-registry.js';
import { JobPriority } from '../src/types/job.types.js';
import { JobContext } from '../src/types/job.types.js';
import { JobValidationError } from '../src/utils/errors.js';

describe('JobRegistry', () => {
  beforeEach(() => {
    jobRegistry.clear();
  });

  describe('register', () => {
    it('should register a job with minimal options', () => {
      const handler = async (context: JobContext) => {
        return { success: true };
      };

      jobRegistry.register({
        name: 'minimal-job',
        handler,
      });

      expect(jobRegistry.has('minimal-job')).toBe(true);
      const job = jobRegistry.get('minimal-job');
      expect(job?.name).toBe('minimal-job');
      expect(job?.priority).toBe(JobPriority.MEDIUM);
      expect(job?.maxRetries).toBe(3);
    });

    it('should register a job with all options', () => {
      const handler = async (context: JobContext) => {
        return { success: true };
      };

      jobRegistry.register({
        name: 'full-job',
        handler,
        cronPattern: '0 * * * *',
        priority: JobPriority.HIGH,
        maxRetries: 5,
        retryDelay: 2000,
        concurrency: 3,
        timeout: 30000,
        data: { test: 'data' },
      });

      const job = jobRegistry.get('full-job');
      expect(job?.priority).toBe(JobPriority.HIGH);
      expect(job?.maxRetries).toBe(5);
      expect(job?.concurrency).toBe(3);
    });

    it('should throw error for invalid job definition', () => {
      expect(() => {
        jobRegistry.register({
          name: '', // Invalid: empty name
          handler: async () => {},
        });
      }).toThrow(JobValidationError);
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent job', () => {
      expect(jobRegistry.get('non-existent')).toBeUndefined();
    });

    it('should return registered job', () => {
      const handler = async (context: JobContext) => {
        return {};
      };

      jobRegistry.register({
        name: 'get-test',
        handler,
      });

      const job = jobRegistry.get('get-test');
      expect(job).toBeDefined();
      expect(job?.name).toBe('get-test');
    });
  });

  describe('has', () => {
    it('should return false for non-existent job', () => {
      expect(jobRegistry.has('non-existent')).toBe(false);
    });

    it('should return true for registered job', () => {
      jobRegistry.register({
        name: 'has-test',
        handler: async () => {},
      });

      expect(jobRegistry.has('has-test')).toBe(true);
    });
  });

  describe('getAllNames', () => {
    it('should return empty array when no jobs registered', () => {
      expect(jobRegistry.getAllNames()).toEqual([]);
    });

    it('should return all registered job names', () => {
      jobRegistry.register({
        name: 'job-1',
        handler: async () => {},
      });
      jobRegistry.register({
        name: 'job-2',
        handler: async () => {},
      });

      const names = jobRegistry.getAllNames();
      expect(names).toContain('job-1');
      expect(names).toContain('job-2');
      expect(names.length).toBe(2);
    });
  });

  describe('unregister', () => {
    it('should remove a registered job', () => {
      jobRegistry.register({
        name: 'unregister-test',
        handler: async () => {},
      });

      expect(jobRegistry.has('unregister-test')).toBe(true);
      const removed = jobRegistry.unregister('unregister-test');
      expect(removed).toBe(true);
      expect(jobRegistry.has('unregister-test')).toBe(false);
    });

    it('should return false when unregistering non-existent job', () => {
      expect(jobRegistry.unregister('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all registered jobs', () => {
      jobRegistry.register({
        name: 'job-1',
        handler: async () => {},
      });
      jobRegistry.register({
        name: 'job-2',
        handler: async () => {},
      });

      expect(jobRegistry.getAllNames().length).toBe(2);
      jobRegistry.clear();
      expect(jobRegistry.getAllNames().length).toBe(0);
    });
  });
});
