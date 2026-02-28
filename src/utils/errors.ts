/**
 * Custom error classes for job processing
 */

/**
 * Base error for job-related failures
 */
export class JobError extends Error {
  constructor(
    message: string,
    public readonly jobId?: string,
    public readonly jobName?: string,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'JobError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error indicating a job should not be retried
 */
export class NonRetryableJobError extends JobError {
  constructor(
    message: string,
    jobId?: string,
    jobName?: string,
    public readonly originalError?: Error
  ) {
    super(message, jobId, jobName, false);
    this.name = 'NonRetryableJobError';
  }
}

/**
 * Error for job timeout
 */
export class JobTimeoutError extends JobError {
  constructor(
    message: string = 'Job execution timed out',
    jobId?: string,
    jobName?: string,
    public readonly timeoutMs?: number
  ) {
    super(message, jobId, jobName, true);
    this.name = 'JobTimeoutError';
  }
}

/**
 * Error for validation failures
 */
export class JobValidationError extends NonRetryableJobError {
  constructor(
    message: string,
    jobId?: string,
    jobName?: string,
    public readonly validationErrors?: unknown
  ) {
    super(message, jobId, jobName);
    this.name = 'JobValidationError';
  }
}
