/**
 * Tests for retry utilities
 */

import { calculateRetryDelay, formatDelay } from '../src/utils/retry.js';
import { RetryDelayType } from '../src/types/job.types.js';

describe('Retry Utilities', () => {
  describe('calculateRetryDelay', () => {
    it('should calculate fixed delay', () => {
      const delay = calculateRetryDelay(3, 1000, RetryDelayType.FIXED);
      expect(delay).toBe(1000);
    });

    it('should calculate linear delay', () => {
      const delay1 = calculateRetryDelay(1, 1000, RetryDelayType.LINEAR);
      const delay2 = calculateRetryDelay(2, 1000, RetryDelayType.LINEAR);
      const delay3 = calculateRetryDelay(3, 1000, RetryDelayType.LINEAR);

      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(3000);
    });

    it('should calculate exponential delay', () => {
      const delay1 = calculateRetryDelay(1, 1000, RetryDelayType.EXPONENTIAL);
      const delay2 = calculateRetryDelay(2, 1000, RetryDelayType.EXPONENTIAL);
      const delay3 = calculateRetryDelay(3, 1000, RetryDelayType.EXPONENTIAL);

      expect(delay1).toBe(1000); // 1000 * 2^0
      expect(delay2).toBe(2000); // 1000 * 2^1
      expect(delay3).toBe(4000); // 1000 * 2^2
    });

    it('should cap exponential delay at 5 minutes', () => {
      const delay = calculateRetryDelay(20, 1000, RetryDelayType.EXPONENTIAL);
      expect(delay).toBeLessThanOrEqual(300000); // 5 minutes
    });
  });

  describe('formatDelay', () => {
    it('should format milliseconds', () => {
      expect(formatDelay(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(formatDelay(5000)).toBe('5.0s');
    });

    it('should format minutes', () => {
      expect(formatDelay(120000)).toBe('2.0m');
    });

    it('should format hours', () => {
      expect(formatDelay(7200000)).toBe('2.0h');
    });
  });
});
