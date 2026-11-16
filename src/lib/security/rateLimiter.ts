/**
 * FlowPilot Rate Limiting & Anti-Lockout Defense
 * Phase 10C-B1: Security Foundation
 *
 * Implements the approved multi-tier rate limiting policy:
 * - Up to 10 attempts / min per IP: immediate execution (0ms delay)
 * - 11 to 20 attempts / 15 min per IP: progressive delays (1s, 2s, 4s backoff)
 * - > 20 attempts / 15 min per IP: HTTP 429 Too Many Requests
 * - Account protection: 5 consecutive failures challenges requesting IP; no global lockout
 * - Password reset & email resend: max 3 requests / 1 hour per account
 * - Forwarded IP resolution: validates against trusted proxy CIDRs
 * - Memory bounding: strict capacity limit with automatic pruning
 * - Security event emission: decoupled interface for B3 email adapter
 */

import { getSecurityConfig } from './config';

export interface SecurityAlertEvent {
  type: 'BRUTE_FORCE_IP' | 'ACCOUNT_CHALLENGE' | 'RATE_LIMIT_EXCEEDED';
  ip: string;
  identifier?: string;
  attemptCount: number;
  timestamp: number;
  details?: Record<string, unknown>;
}

export type SecurityAlertCallback = (event: SecurityAlertEvent) => void | Promise<void>;

export interface RateLimitCheckParams {
  key: string;
  windowSeconds: number;
  maxAttempts: number;
}

export interface RateLimitResult {
  allowed: boolean;
  status: 200 | 429;
  remaining: number;
  retryAfterSeconds: number;
  resetTime: number;
}

export interface LoginRateLimitResult {
  allowed: boolean;
  status: 200 | 429;
  delayMs: number;
  retryAfterSeconds: number;
  isChallenged: boolean;
  message?: string;
}

/**
 * Common interface for Rate Limiting backends.
 * Enables zero-code-change drop-in of Redis in Phase 10D.
 */
export interface DistributedRateLimiter {
  consume(params: RateLimitCheckParams, now?: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/**
 * Checks if an IPv4 address is within a given CIDR block (e.g. '192.168.0.0/16').
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    // Normalize IPv6-mapped IPv4 (e.g. "::ffff:127.0.0.1" -> "127.0.0.1")
    const cleanIp = ip.replace(/^::ffff:/, '').trim();

    // Exact IP match (e.g. "::1" or "127.0.0.1")
    if (cidr === cleanIp || (cleanIp === '::1' && (cidr === '::1' || cidr === '::1/128'))) {
      return true;
    }

    const [range, bitsStr] = cidr.split('/');
    const cleanRange = range.replace(/^::ffff:/, '').trim();
    const bits = bitsStr ? parseInt(bitsStr, 10) : 32;

    const ipParts = cleanIp.split('.').map(Number);
    const rangeParts = cleanRange.split('.').map(Number);

    if (ipParts.length !== 4 || rangeParts.length !== 4) {
      return cleanIp === cleanRange;
    }

    const ipNum =
      ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
    const rangeNum =
      ((rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3]) >>> 0;

    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : ((-1 << (32 - bits)) >>> 0);

    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

/**
 * Checks whether an IP address matches any of the configured trusted proxy CIDRs.
 */
export function isTrustedProxy(ip: string, trustedCidrs: string[]): boolean {
  if (!ip || !trustedCidrs || trustedCidrs.length === 0) {
    return false;
  }
  return trustedCidrs.some((cidr) => isIpInCidr(ip, cidr));
}

/**
 * Resolves the genuine client IP address using trusted proxy validation.
 *
 * Security Rule:
 * If the immediate connection peer (`socketRemoteAddress`) is NOT in `trustedProxyCidrs`,
 * any `x-forwarded-for` header is untrusted and IGNORED.
 *
 * If `socketRemoteAddress` is a trusted proxy, walks the `x-forwarded-for` chain
 * from right to left, stopping at the first untrusted address (the actual client).
 */
export function resolveClientIp(
  socketRemoteAddress: string | null | undefined,
  xForwardedForHeader: string | null | undefined,
  trustedProxyCidrs?: string[]
): string {
  const peer = (socketRemoteAddress || '127.0.0.1').trim();
  const cidrs = trustedProxyCidrs || getSecurityConfig().trustedProxyCidrs;

  // If immediate peer is not a trusted proxy, use peer directly
  if (!isTrustedProxy(peer, cidrs)) {
    return peer;
  }

  // If peer is trusted and x-forwarded-for is supplied, resolve real client
  if (xForwardedForHeader && xForwardedForHeader.trim().length > 0) {
    const ips = xForwardedForHeader
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Walk right-to-left
    for (let i = ips.length - 1; i >= 0; i--) {
      const candidate = ips[i];
      if (!isTrustedProxy(candidate, cidrs)) {
        return candidate;
      }
    }

    // If all are proxies, return the leftmost client
    return ips[0] || peer;
  }

  return peer;
}

/**
 * In-memory sliding-window rate limiter with memory bounding and automatic pruning.
 */
export class InMemoryRateLimiter implements DistributedRateLimiter {
  private store = new Map<string, number[]>();
  private readonly maxEntries = 10000;
  private lastPruneTime = Date.now();

  public async consume(params: RateLimitCheckParams, now = Date.now()): Promise<RateLimitResult> {
    this.maybePrune(now);

    const windowMs = params.windowSeconds * 1000;
    const windowStart = now - windowMs;

    let timestamps = this.store.get(params.key) || [];
    // Keep only timestamps within window
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= params.maxAttempts) {
      const oldestInWindow = timestamps[0];
      const resetTime = oldestInWindow + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));

      this.store.set(params.key, timestamps);
      return {
        allowed: false,
        status: 429,
        remaining: 0,
        retryAfterSeconds,
        resetTime,
      };
    }

    // Record new attempt
    timestamps.push(now);
    this.store.set(params.key, timestamps);

    const remaining = Math.max(0, params.maxAttempts - timestamps.length);
    const resetTime = now + windowMs;

    return {
      allowed: true,
      status: 200,
      remaining,
      retryAfterSeconds: 0,
      resetTime,
    };
  }

  public async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  public size(): number {
    return this.store.size;
  }

  private maybePrune(now: number): void {
    // Prune periodically (every 5 minutes) or when map size exceeds capacity
    if (this.store.size > this.maxEntries || now - this.lastPruneTime > 300000) {
      this.lastPruneTime = now;
      const oneHourAgo = now - 3600000;

      for (const [key, timestamps] of this.store.entries()) {
        const fresh = timestamps.filter((t) => t > oneHourAgo);
        if (fresh.length === 0) {
          this.store.delete(key);
        } else {
          this.store.set(key, fresh);
        }
      }

      // If still overflowing, drop oldest entries
      if (this.store.size > this.maxEntries) {
        const keysToDelete = Array.from(this.store.keys()).slice(0, this.store.size - this.maxEntries);
        for (const k of keysToDelete) {
          this.store.delete(k);
        }
      }
    }
  }
}

/**
 * High-Level Rate Limiter Service implementing the FlowPilot security policy.
 */
export class RateLimiterService {
  private alertCallbacks: SecurityAlertCallback[] = [];
  private backend: DistributedRateLimiter;
  private accountFailures = new Map<string, { count: number; lastFailed: number }>();

  constructor(backend?: DistributedRateLimiter) {
    this.backend = backend || new InMemoryRateLimiter();
  }

  /**
   * Register a security alert listener (decoupled B1 interface, connected to B3 email adapter).
   */
  public onSecurityAlert(callback: SecurityAlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Emits a security alert event to all registered listeners.
   */
  private async emitAlert(event: SecurityAlertEvent): Promise<void> {
    for (const cb of this.alertCallbacks) {
      try {
        await cb(event);
      } catch {
        // Silently prevent listener error from crashing auth flow
      }
    }
  }

  /**
   * Evaluates login rate limits for an IP and account according to the approved policy.
   */
  public async checkLoginAttempt(
    ip: string,
    accountIdentifier?: string,
    now = Date.now()
  ): Promise<LoginRateLimitResult> {
    const ip15MinKey = `login:ip:15m:${ip}`;
    const ip1MinKey = `login:ip:1m:${ip}`;

    // 1. IP 15-minute window check (hard block > 20 attempts)
    const result15m = await this.backend.consume(
      { key: ip15MinKey, windowSeconds: 15 * 60, maxAttempts: 20 },
      now
    );

    if (!result15m.allowed) {
      await this.emitAlert({
        type: 'BRUTE_FORCE_IP',
        ip,
        identifier: accountIdentifier,
        attemptCount: 21,
        timestamp: now,
      });

      return {
        allowed: false,
        status: 429,
        delayMs: 0,
        retryAfterSeconds: result15m.retryAfterSeconds,
        isChallenged: true,
        message: 'Too many login attempts from this IP address. Please wait 15 minutes before trying again.',
      };
    }

    // 2. Progressive delay calculation (attempts 11 through 20 in 15 minutes)
    const attemptCount15m = 20 - result15m.remaining;
    let progressiveDelayMs = 0;

    if (attemptCount15m >= 18) {
      progressiveDelayMs = 4000; // 4s delay
    } else if (attemptCount15m >= 14) {
      progressiveDelayMs = 2000; // 2s delay
    } else if (attemptCount15m >= 11) {
      progressiveDelayMs = 1000; // 1s delay
    }

    // 3. IP 1-minute window check (up to 10 attempts/min)
    const result1m = await this.backend.consume(
      { key: ip1MinKey, windowSeconds: 60, maxAttempts: 10 },
      now
    );

    if (!result1m.allowed) {
      return {
        allowed: false,
        status: 429,
        delayMs: 0,
        retryAfterSeconds: result1m.retryAfterSeconds,
        isChallenged: false,
        message: 'Too many login attempts in a short period. Please wait 1 minute.',
      };
    }

    // 4. Account protection: consecutive failed attempts
    let isChallenged = false;
    if (accountIdentifier) {
      const normalizedAccount = accountIdentifier.toLowerCase().trim();
      const failRecord = this.accountFailures.get(normalizedAccount);

      if (failRecord && failRecord.count >= 5) {
        isChallenged = true;
        // Increase delay for challenged requests, but DO NOT lockout globally
        progressiveDelayMs = Math.max(progressiveDelayMs, 2000);
      }
    }

    return {
      allowed: true,
      status: 200,
      delayMs: progressiveDelayMs,
      retryAfterSeconds: 0,
      isChallenged,
    };
  }

  /**
   * Records a failed login attempt for an account and checks for consecutive failures.
   */
  public async recordLoginFailure(
    ip: string,
    accountIdentifier?: string,
    now = Date.now()
  ): Promise<void> {
    if (!accountIdentifier) return;

    const normalizedAccount = accountIdentifier.toLowerCase().trim();
    const existing = this.accountFailures.get(normalizedAccount);
    const newCount = (existing ? existing.count : 0) + 1;

    this.accountFailures.set(normalizedAccount, {
      count: newCount,
      lastFailed: now,
    });

    if (newCount === 5) {
      await this.emitAlert({
        type: 'ACCOUNT_CHALLENGE',
        ip,
        identifier: accountIdentifier,
        attemptCount: 5,
        timestamp: now,
        details: { reason: '5 consecutive failed password attempts' },
      });
    }
  }

  /**
   * Clears consecutive failed attempts for an account on successful authentication.
   */
  public async recordLoginSuccess(accountIdentifier: string): Promise<void> {
    const normalizedAccount = accountIdentifier.toLowerCase().trim();
    this.accountFailures.delete(normalizedAccount);
  }

  /**
   * Checks rate limit for password reset requests (3 requests / 1 hour per account).
   */
  public async checkPasswordResetLimit(
    accountIdentifier: string,
    now = Date.now()
  ): Promise<RateLimitResult> {
    const normalized = accountIdentifier.toLowerCase().trim();
    const key = `pwd_reset:account:${normalized}`;
    return this.backend.consume({ key, windowSeconds: 3600, maxAttempts: 3 }, now);
  }

  /**
   * Checks rate limit for email verification resends (3 requests / 1 hour per account).
   */
  public async checkEmailResendLimit(
    accountIdentifier: string,
    now = Date.now()
  ): Promise<RateLimitResult> {
    const normalized = accountIdentifier.toLowerCase().trim();
    const key = `email_resend:account:${normalized}`;
    return this.backend.consume({ key, windowSeconds: 3600, maxAttempts: 3 }, now);
  }

  /**
   * Resets all internal tracking state (for testing).
   */
  public resetForTesting(): void {
    if (this.backend instanceof InMemoryRateLimiter) {
      this.backend.clear();
    }
    this.accountFailures.clear();
    this.alertCallbacks = [];
  }
}

// Global default rate limiter service singleton
export const rateLimiterService = new RateLimiterService();
