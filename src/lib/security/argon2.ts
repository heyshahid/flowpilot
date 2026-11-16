/**
 * FlowPilot Argon2id Password Hashing & Concurrency Semaphore
 * Phase 10C-B1: Security Foundation
 *
 * Implements OWASP-recommended Argon2id password hashing with bounded
 * concurrency to prevent CPU/memory exhaustion and Denial-of-Service attacks.
 */

import * as argon2 from '@node-rs/argon2';

/**
 * Standard OWASP-recommended Argon2id parameters
 * - Memory: 65,536 KiB (64 MiB)
 * - Time Cost (Iterations): 3
 * - Parallelism: 4 threads
 * - Output Length: 32 bytes (256-bit derived key)
 */
export const ARGON2ID_OPTIONS = {
  algorithm: 2, // Argon2id (default in @node-rs/argon2)
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

/**
 * Precomputed valid Argon2id hash for nonexistent-account login timing protection.
 * Generated with the identical parameters: m=65536, t=3, p=4, outputLen=32.
 * Used during login when a user email is not found to prevent timing-based
 * account enumeration attacks (CWE-208).
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$iZHBTBZK/aC/tpH0NUzk7Q$uItYqdlYISqNAijuctbJrMpfUac5OJdqBKhf0EpvGVU';

export class SecurityOverloadError extends Error {
  public readonly code = 'SECURITY_OVERLOAD';
  public readonly statusCode = 503;
  constructor(message = 'Authentication service is overloaded. Please try again shortly.') {
    super(message);
    this.name = 'SecurityOverloadError';
  }
}

export class SecurityTimeoutError extends Error {
  public readonly code = 'SECURITY_TIMEOUT';
  public readonly statusCode = 504;
  constructor(message = 'Authentication request timed out. Please try again.') {
    super(message);
    this.name = 'SecurityTimeoutError';
  }
}

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  enqueueTime: number;
  timer: NodeJS.Timeout;
}

/**
 * Bounded Concurrency Semaphore for CPU/Memory Intensive Cryptographic Operations
 * - Maximum concurrent operations: 4
 * - Maximum FIFO queue depth: 16
 * - Maximum queue wait timeout: 3,000 ms
 */
export class CryptographicSemaphore {
  private running = 0;
  private queue: QueuedTask<unknown>[] = [];

  constructor(
    public readonly maxConcurrent: number = 4,
    public readonly maxQueueDepth: number = 16,
    public readonly queueTimeoutMs: number = 3000
  ) {}

  public getStatus(): { running: number; queued: number; maxConcurrent: number; maxQueueDepth: number } {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueDepth: this.maxQueueDepth,
    };
  }

  public reset(): void {
    for (const task of this.queue) {
      clearTimeout(task.timer);
      task.reject(new SecurityTimeoutError('Semaphore reset'));
    }
    this.queue = [];
    this.running = 0;
  }

  public run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // If we have an available execution slot and no waiting queue, run immediately
      if (this.running < this.maxConcurrent && this.queue.length === 0) {
        this.running++;
        this.executeTask(fn, resolve, reject);
        return;
      }

      // Check if queue is full
      if (this.queue.length >= this.maxQueueDepth) {
        reject(
          new SecurityOverloadError(
            `Authentication queue full (${this.queue.length}/${this.maxQueueDepth}). Request rejected.`
          )
        );
        return;
      }

      // Enqueue with timeout
      const enqueueTime = Date.now();
      let timer: NodeJS.Timeout;

      const queuedTask: QueuedTask<unknown> = {
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueueTime,
        // eslint-disable-next-line prefer-const
        timer: null as unknown as NodeJS.Timeout,
      };

      timer = setTimeout(() => {
        const index = this.queue.indexOf(queuedTask);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(
            new SecurityTimeoutError(
              `Authentication request exceeded queue wait timeout of ${this.queueTimeoutMs}ms.`
            )
          );
        }
      }, this.queueTimeoutMs);

      queuedTask.timer = timer;
      this.queue.push(queuedTask);
    });
  }

  private executeTask<T>(
    fn: () => Promise<T>,
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: unknown) => void
  ): void {
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.running--;
        this.processNext();
      });
  }

  private processNext(): void {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const nextTask = this.queue.shift();
    if (!nextTask) return;

    clearTimeout(nextTask.timer);
    this.running++;
    this.executeTask(nextTask.fn, nextTask.resolve, nextTask.reject);
  }
}

// Global singleton semaphore for Argon2 operations
export const argon2Semaphore = new CryptographicSemaphore(4, 16, 3000);

/**
 * Hashes a plaintext password using Argon2id with OWASP parameters.
 * Automatically generates a cryptographically secure random 16-byte salt.
 * Governed by the concurrency semaphore.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  return argon2Semaphore.run(async () => {
    return argon2.hash(password, ARGON2ID_OPTIONS);
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Governed by the concurrency semaphore.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (typeof hash !== 'string' || typeof password !== 'string') {
    return false;
  }
  if (!hash.startsWith('$argon2id$')) {
    return false;
  }

  return argon2Semaphore.run(async () => {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  });
}

/**
 * Executes a simulated password check against the precomputed dummy hash.
 * Used when a requested user or account is not found during login.
 * Guarantees that nonexistent account checks consume the exact same
 * computational time (~80-120ms) as real accounts, eliminating timing leaks.
 */
export async function verifyDummyPassword(password: string): Promise<boolean> {
  // Always resolves false after full Argon2id computation
  await verifyPassword(DUMMY_PASSWORD_HASH, password);
  return false;
}
