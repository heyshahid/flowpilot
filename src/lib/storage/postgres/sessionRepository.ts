/**
 * FlowPilot Session Repository (PostgreSQL)
 * Phase 10C-B2: Database & Session Engine
 *
 * Implements server-side session management strictly enforcing:
 * - 14-day absolute session lifetime (capped against any override)
 * - 2-hour idle timeout with immediate deletion upon expiration
 * - 15-minute throttled conditional lastActiveAt updates (concurrency safe)
 * - Atomic session rotation on privilege change (mitigating CWE-384)
 * - Single and multi-session revocation (post-password-reset security)
 */

import { PrismaClient, Session, User } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import { generateSecureToken, hashToken } from '../../security/tokens';

export const MAX_SESSION_LIFETIME_DAYS = 14;
export const MAX_SESSION_LIFETIME_MS = MAX_SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000; // 14 days
export const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
export const THROTTLE_TOUCH_MS = 15 * 60 * 1000; // 15 minutes

export interface CreateSessionParams {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  ttlDays?: number;
}

export interface SessionWithUser extends Session {
  user: User;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED_ABSOLUTE' | 'SESSION_EXPIRED_IDLE';
  session?: Session;
  user?: User;
}

export class SessionRepository {
  constructor(private client: PrismaClient = defaultPrisma) {}

  /**
   * Creates a new session record in PostgreSQL.
   * Generates a 32-byte CSPRNG token and persists only its SHA-256 hash.
   * The absolute lifetime is strictly capped at MAX_SESSION_LIFETIME_DAYS (14 days).
   */
  public async createSession(
    params: CreateSessionParams,
    now = new Date()
  ): Promise<{ session: Session; rawToken: string }> {
    if (!params.userId || typeof params.userId !== 'string') {
      throw new Error('Cannot create session: userId is required.');
    }

    // Security Rule: Cap any optional TTL override to the approved 14-day absolute maximum
    const safeTtlDays = params.ttlDays
      ? Math.min(Math.max(1, params.ttlDays), MAX_SESSION_LIFETIME_DAYS)
      : MAX_SESSION_LIFETIME_DAYS;

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + safeTtlDays * 24 * 60 * 60 * 1000);

    const session = await this.client.session.create({
      data: {
        userId: params.userId,
        tokenHash,
        userAgent: params.userAgent || null,
        ipAddress: params.ipAddress || null,
        expiresAt,
        createdAt: now,
        lastActiveAt: now,
      },
    });

    return { session, rawToken };
  }

  /**
   * Validates an incoming raw session token against PostgreSQL.
   * Enforces dual expiration:
   * 1. Absolute lifetime: expiresAt > NOW()
   * 2. Idle timeout: NOW() - lastActiveAt <= 2 hours
   *
   * Expired sessions are deleted immediately from the database and rejected.
   * Throttles lastActiveAt updates to at most once every 15 minutes via
   * conditional atomic database update.
   */
  public async validateSession(
    rawToken: string,
    now = new Date()
  ): Promise<SessionValidationResult> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { valid: false, reason: 'SESSION_NOT_FOUND' };
    }

    const tokenHash = hashToken(rawToken);

    const session = await this.client.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      return { valid: false, reason: 'SESSION_NOT_FOUND' };
    }

    const nowMs = now.getTime();

    // 1. Check absolute expiration (14 days)
    if (session.expiresAt.getTime() <= nowMs) {
      // Immediate database deletion
      await this.client.session.delete({ where: { id: session.id } }).catch(() => {});
      return { valid: false, reason: 'SESSION_EXPIRED_ABSOLUTE' };
    }

    // 2. Check idle timeout (2 hours)
    const idleAge = nowMs - session.lastActiveAt.getTime();
    if (idleAge > IDLE_TIMEOUT_MS) {
      // Immediate database deletion
      await this.client.session.delete({ where: { id: session.id } }).catch(() => {});
      return { valid: false, reason: 'SESSION_EXPIRED_IDLE' };
    }

    // 3. Conditional throttled activity update (at most once every 15 minutes)
    // Concurrency safe: only updates if lastActiveAt is actually older than 15 minutes
    if (idleAge > THROTTLE_TOUCH_MS) {
      const touchThreshold = new Date(nowMs - THROTTLE_TOUCH_MS);
      await this.client.session.updateMany({
        where: {
          id: session.id,
          lastActiveAt: { lt: touchThreshold },
        },
        data: {
          lastActiveAt: now,
        },
      }).catch(() => {});
    }

    return {
      valid: true,
      session,
      user: session.user,
    };
  }

  /**
   * Atomically rotates a session token upon privilege elevation or login.
   * Invalidates (deletes) the old session and issues a fresh session record.
   */
  public async rotateSession(
    oldRawToken: string,
    params?: { userAgent?: string; ipAddress?: string },
    now = new Date()
  ): Promise<{ session: Session; rawToken: string }> {
    const oldHash = hashToken(oldRawToken);

    return this.client.$transaction(async (tx) => {
      const existing = await tx.session.findUnique({
        where: { tokenHash: oldHash },
      });

      if (!existing) {
        throw new Error('Cannot rotate session: existing session not found.');
      }

      // Check if old session was expired
      if (existing.expiresAt.getTime() <= now.getTime()) {
        await tx.session.delete({ where: { id: existing.id } }).catch(() => {});
        throw new Error('Cannot rotate session: existing session has expired.');
      }

      // Delete old session
      await tx.session.delete({ where: { id: existing.id } });

      // Create new session
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(now.getTime() + MAX_SESSION_LIFETIME_MS);

      const session = await tx.session.create({
        data: {
          userId: existing.userId,
          tokenHash,
          userAgent: params?.userAgent ?? existing.userAgent,
          ipAddress: params?.ipAddress ?? existing.ipAddress,
          expiresAt,
          createdAt: now,
          lastActiveAt: now,
        },
      });

      return { session, rawToken };
    });
  }

  /**
   * Revokes a single session on user logout.
   */
  public async revokeSession(rawToken: string): Promise<boolean> {
    if (!rawToken || typeof rawToken !== 'string') return false;

    const tokenHash = hashToken(rawToken);
    try {
      const deleted = await this.client.session.deleteMany({
        where: { tokenHash },
      });
      return deleted.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Revokes ALL sessions for a user.
   * Mandatory after password reset or detected account compromise.
   */
  public async revokeAllUserSessions(userId: string): Promise<number> {
    if (!userId || typeof userId !== 'string') return 0;

    const result = await this.client.session.deleteMany({
      where: { userId },
    });
    return result.count;
  }

  /**
   * Prunes all expired or idle sessions across the platform.
   */
  public async cleanupExpiredSessions(now = new Date()): Promise<number> {
    const nowMs = now.getTime();
    const idleThreshold = new Date(nowMs - IDLE_TIMEOUT_MS);

    const result = await this.client.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { lastActiveAt: { lte: idleThreshold } },
        ],
      },
    });

    return result.count;
  }
}

export const sessionRepository = new SessionRepository();
