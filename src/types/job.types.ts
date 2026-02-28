/**
 * Core type definitions for the job scheduler system
 */

import { z } from 'zod';

/**
 * Job priority levels
 * Higher numbers = higher priority
 */
export enum JobPriority {
  LOW = 1,
  MEDIUM = 5,
  HIGH = 10,
  CRITICAL = 20,
}

/**
 * Job status throughout lifecycle
 */
export enum JobStatus {
  SCHEDULED = 'scheduled',
  QUEUED = 'queued',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  CANCELLED = 'cancelled',
}

/**
 * Retry delay strategies
 */
export enum RetryDelayType {
  FIXED = 'fixed',
  EXPONENTIAL = 'exponential',
  LINEAR = 'linear',
}

/**
 * Job lifecycle event types
 */
export enum JobEventType {
  CREATED = 'created',
  SCHEDULED = 'scheduled',
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRY = 'retry',
  CANCELLED = 'cancelled',
  PROGRESS = 'progress',
}

/**
 * Job event payload
 */
export interface JobEvent {
  jobId: string;
  jobName: string;
  eventType: JobEventType;
  timestamp: Date;
  data?: Record<string, unknown>;
  error?: Error;
  attempt?: number;
}

/**
 * Job definition schema for validation
 */
export const JobDefinitionSchema = z.object({
  name: z.string().min(1),
  handler: z.function(),
  cronPattern: z.string().optional(),
  delay: z.number().optional(), // milliseconds
  priority: z.nativeEnum(JobPriority).default(JobPriority.MEDIUM),
  maxRetries: z.number().int().min(0).default(3),
  retryDelay: z.number().int().min(0).default(1000),
  retryDelayType: z.nativeEnum(RetryDelayType).default(RetryDelayType.EXPONENTIAL),
  concurrency: z.number().int().min(1).optional(),
  timeout: z.number().int().min(0).optional(), // milliseconds
  removeOnComplete: z.boolean().default(true),
  removeOnFail: z.boolean().default(false),
  data: z.record(z.unknown()).optional(),
});

export type JobDefinition = z.infer<typeof JobDefinitionSchema>;

/**
 * Job execution context passed to handlers
 */
export interface JobContext {
  jobId: string;
  jobName: string;
  attempt: number;
  maxAttempts: number;
  data: Record<string, unknown>;
  progress: (progress: number) => Promise<void>;
  log: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Job result
 */
export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: Error;
  duration: number;
}

/**
 * Scheduled job metadata
 */
export interface ScheduledJob {
  id: string;
  name: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  attempts: number;
  maxRetries: number;
  data?: Record<string, unknown>;
  error?: string;
  cronPattern?: string;
  nextRunAt?: Date;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    url?: string;
  };
  concurrency: number;
  maxRetries: number;
  retryDelay: number;
  retryDelayType: RetryDelayType;
  gracefulShutdownTimeout: number;
}
