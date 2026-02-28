/**
 * Job registry for managing job definitions
 */

import { JobDefinition, JobDefinitionSchema, JobPriority } from '../types/job.types.js';
import { logger } from '../utils/logger.js';
import { JobValidationError } from '../utils/errors.js';

/**
 * Registry for storing and retrieving job definitions
 */
export class JobRegistry {
  private jobs = new Map<string, JobDefinition>();

  /**
   * Register a new job definition
   */
  register(definition: Partial<JobDefinition> & { name: string; handler: () => Promise<unknown> }): void {
    try {
      const validated = JobDefinitionSchema.parse({
        priority: JobPriority.MEDIUM,
        maxRetries: 3,
        retryDelay: 1000,
        retryDelayType: 'exponential',
        removeOnComplete: true,
        removeOnFail: false,
        ...definition,
      });

      if (this.jobs.has(validated.name)) {
        logger.warn({ jobName: validated.name }, 'Overwriting existing job definition');
      }

      this.jobs.set(validated.name, validated);
      logger.info({ jobName: validated.name }, 'Job registered successfully');
    } catch (error) {
      throw new JobValidationError(
        `Failed to register job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        definition.name,
        error
      );
    }
  }

  /**
   * Get a job definition by name
   */
  get(name: string): JobDefinition | undefined {
    return this.jobs.get(name);
  }

  /**
   * Check if a job is registered
   */
  has(name: string): boolean {
    return this.jobs.has(name);
  }

  /**
   * Get all registered job names
   */
  getAllNames(): string[] {
    return Array.from(this.jobs.keys());
  }

  /**
   * Get all job definitions
   */
  getAll(): JobDefinition[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Remove a job definition
   */
  unregister(name: string): boolean {
    const removed = this.jobs.delete(name);
    if (removed) {
      logger.info({ jobName: name }, 'Job unregistered');
    }
    return removed;
  }

  /**
   * Clear all job definitions
   */
  clear(): void {
    this.jobs.clear();
    logger.info('All jobs unregistered');
  }
}

// Singleton instance
export const jobRegistry = new JobRegistry();
