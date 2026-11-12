import { WorkflowExecutionRecord } from './types';

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 500,
  backoffFactor: 2,
  maxDelayMs: 10000,
};

export class RetryManager {
  /**
   * Calculates exponential backoff delay with jitter.
   */
  public static calculateDelay(
    attempt: number,
    policy: RetryPolicy = DEFAULT_RETRY_POLICY
  ): number {
    const rawDelay = policy.initialDelayMs * Math.pow(policy.backoffFactor, attempt - 1);
    const clampedDelay = Math.min(rawDelay, policy.maxDelayMs);
    // Add 10% random jitter to avoid thundering herd
    const jitter = clampedDelay * 0.1 * Math.random();
    return Math.floor(clampedDelay + jitter);
  }

  /**
   * Checks whether a failed or cancelled workflow execution is eligible for retry.
   */
  public static isEligibleForRetry(record: WorkflowExecutionRecord): boolean {
    if (record.status !== 'FAILED' && record.status !== 'CANCELLED') {
      return false;
    }
    return record.retryCount < record.maxRetries;
  }

  /**
   * Checks whether a single node failure is eligible for immediate retry within worker loop.
   */
  public static shouldRetryNode(
    attempt: number,
    maxAttempts: number = 1
  ): boolean {
    return attempt < maxAttempts;
  }
}
