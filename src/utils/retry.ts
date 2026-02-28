/**
 * Retry delay calculation utilities
 */

import { RetryDelayType } from '../types/job.types.js';

/**
 * Calculate retry delay based on attempt number and strategy
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  delayType: RetryDelayType
): number {
  switch (delayType) {
    case RetryDelayType.FIXED:
      return baseDelay;

    case RetryDelayType.LINEAR:
      return baseDelay * attempt;

    case RetryDelayType.EXPONENTIAL:
      // Exponential backoff: baseDelay * 2^(attempt - 1)
      // Cap at 5 minutes to prevent excessive delays
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      return Math.min(exponentialDelay, 300000); // 5 minutes max

    default:
      return baseDelay;
  }
}

/**
 * Format delay in milliseconds to human-readable string
 */
export function formatDelay(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}
