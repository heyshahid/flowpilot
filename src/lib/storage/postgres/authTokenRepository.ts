/**
 * FlowPilot AuthToken Repository (PostgreSQL)
 * Phase 10C-B2: Database & Session Engine
 *
 * Implements single-use cryptographic token lifecycle for:
 * - Email verification (24-hour expiration)
 * - Password reset (1-hour expiration)
 *
 * CRITICAL SECURITY REQUIREMENT:
 * consumeAuthToken() enforces token existence, expected type, expiration,
 * and unused status in ONE ATOMIC database operation, guaranteeing that
 * concurrent requests can NEVER consume the same token twice.
 */

import { PrismaClient, AuthToken, AuthTokenType } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import { generateSecureToken, hashToken } from '../../security/tokens';

export interface CreateAuthTokenParams {
  userId: string;
  type: AuthTokenType;
  ttlHours: number;
}

export interface AuthTokenConsumeResult {
  valid: boolean;
  reason?:
    | 'TOKEN_NOT_FOUND'
    | 'INVALID_TOKEN_TYPE'
    | 'TOKEN_ALREADY_USED'
    | 'TOKEN_EXPIRED'
    | 'TOKEN_CONSUMPTION_FAILED';
  userId?: string;
  tokenRecord?: AuthToken;
}

export class AuthTokenRepository {
  constructor(private client: PrismaClient = defaultPrisma) {}

  /**
   * Generates and stores a cryptographic single-use token.
   * Only the SHA-256 hash is persisted.
   */
  public async createAuthToken(
    params: CreateAuthTokenParams,
    now = new Date()
  ): Promise<{ tokenRecord: AuthToken; rawToken: string }> {
    if (!params.userId || typeof params.userId !== 'string') {
      throw new Error('Cannot create auth token: userId is required.');
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + params.ttlHours * 60 * 60 * 1000);

    const tokenRecord = await this.client.authToken.create({
      data: {
        userId: params.userId,
        tokenHash,
        type: params.type,
        expiresAt,
        createdAt: now,
        usedAt: null,
      },
    });

    return { tokenRecord, rawToken };
  }

  /**
   * Atomically validates and consumes a single-use authentication token.
   *
   * Enforces:
   * - Matching tokenHash
   * - Matching expected type
   * - Unused status (usedAt IS NULL)
   * - Expiration (expiresAt > now)
   *
   * In a single atomic conditional database update. Concurrent requests
   * racing to consume the same token will result in exactly ONE success.
   */
  public async consumeAuthToken(
    rawToken: string,
    expectedType: AuthTokenType,
    now = new Date()
  ): Promise<AuthTokenConsumeResult> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { valid: false, reason: 'TOKEN_NOT_FOUND' };
    }

    const tokenHash = hashToken(rawToken);

    // ATOMIC CONDITIONAL UPDATE:
    // Only updates if usedAt IS NULL, expiresAt > now, and type matches
    const updated = await this.client.authToken.updateMany({
      where: {
        tokenHash,
        type: expectedType,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    });

    // If 0 rows updated, atomic consumption failed
    if (updated.count === 0) {
      // Diagnostic check to determine reason for caller
      const existing = await this.client.authToken.findUnique({
        where: { tokenHash },
      });

      if (!existing) {
        return { valid: false, reason: 'TOKEN_NOT_FOUND' };
      }
      if (existing.type !== expectedType) {
        return { valid: false, reason: 'INVALID_TOKEN_TYPE' };
      }
      if (existing.usedAt !== null) {
        return { valid: false, reason: 'TOKEN_ALREADY_USED' };
      }
      if (existing.expiresAt.getTime() <= now.getTime()) {
        return { valid: false, reason: 'TOKEN_EXPIRED' };
      }
      return { valid: false, reason: 'TOKEN_CONSUMPTION_FAILED' };
    }

    // Fetch the successfully consumed record
    const consumed = await this.client.authToken.findUnique({
      where: { tokenHash },
    });

    return {
      valid: true,
      userId: consumed!.userId,
      tokenRecord: consumed!,
    };
  }

  /**
   * Revokes all active, unused tokens of a given type for a user.
   */
  public async revokeUserTokens(userId: string, type: AuthTokenType): Promise<number> {
    if (!userId) return 0;
    const result = await this.client.authToken.deleteMany({
      where: {
        userId,
        type,
        usedAt: null,
      },
    });
    return result.count;
  }

  /**
   * Prunes expired or used tokens older than 7 days.
   */
  public async cleanupStaleTokens(now = new Date()): Promise<number> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.client.authToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { usedAt: { lte: sevenDaysAgo } },
        ],
      },
    });

    return result.count;
  }
}

export const authTokenRepository = new AuthTokenRepository();

