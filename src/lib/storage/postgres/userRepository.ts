/**
 * FlowPilot User & Authentication Storage Repository (PostgreSQL)
 * Phase 10C-B3: Authentication Backend Routes
 *
 * Implements atomic transactional workflows:
 * - Atomic registration: User + Personal Workspace + Owner Membership + Verification Token
 * - Atomic email verification: Single-use token consumption + account activation
 * - Atomic password reset: Pre-computed hash + token consumption + password update + all-device session revocation
 * - Database-level case-insensitive email normalization
 */

import { PrismaClient, User, AccountStatus, Workspace, Membership } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import { generateSecureToken, hashToken } from '../../security/tokens';
import { normalizeEmail } from '../../auth/schemas';

export interface RegisterUserParams {
  email: string;
  name: string;
  passwordHash: string;
}

export interface RegisterUserResult {
  user: User;
  workspace: Workspace;
  membership: Membership;
  rawVerificationToken: string;
}

export interface ResetPasswordResult {
  userId: string;
  revokedSessionCount: number;
}

export class UserRepository {
  constructor(private client: PrismaClient = defaultPrisma) {}

  /**
   * Look up user by email with case-insensitive normalization.
   */
  public async getUserByEmail(email: string): Promise<User | null> {
    if (!email) return null;
    const normalized = normalizeEmail(email);

    return this.client.user.findFirst({
      where: {
        email: {
          equals: normalized,
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Look up user by ID.
   */
  public async getUserById(id: string): Promise<User | null> {
    if (!id) return null;
    return this.client.user.findUnique({
      where: { id },
    });
  }

  /**
   * Creates a user record directly.
   */
  public async createUser(data: {
    email: string;
    name: string;
    passwordHash?: string;
    status?: AccountStatus;
  }): Promise<User> {
    const normalized = normalizeEmail(data.email);
    return this.client.user.create({
      data: {
        email: normalized,
        name: data.name.trim(),
        passwordHash: data.passwordHash || null,
        status: data.status || 'PENDING_VERIFICATION',
      },
    });
  }

  /**
   * Updates user account status (e.g. ACTIVE, SUSPENDED, PENDING_VERIFICATION).
   */
  public async updateAccountStatus(userId: string, status: AccountStatus): Promise<User> {
    return this.client.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  /**
   * Updates user password hash.
   */
  public async updatePassword(userId: string, passwordHash: string): Promise<User> {
    return this.client.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Atomic Registration:
   * Creates User (PENDING_VERIFICATION), default personal Workspace,
   * Owner Membership, and single-use email verification token in one transaction.
   *
   * Raw token is held in memory only to pass to the email dispatcher.
   */
  public async registerUserAtomic(
    params: RegisterUserParams,
    now = new Date()
  ): Promise<RegisterUserResult> {
    const normalizedEmail = normalizeEmail(params.email);
    const trimmedName = params.name.trim();

    const rawVerificationToken = generateSecureToken(32);
    const tokenHash = hashToken(rawVerificationToken);
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    // Generate safe workspace slug
    const safeSlugBase = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20) || 'workspace';
    const workspaceSlug = `${safeSlugBase}-${generateSecureToken(4).toLowerCase()}`;

    return this.client.$transaction(async (tx) => {
      // 1. Insert user
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: trimmedName,
          passwordHash: params.passwordHash,
          status: 'PENDING_VERIFICATION',
          createdAt: now,
          updatedAt: now,
        },
      });

      // 2. Insert default workspace
      const workspace = await tx.workspace.create({
        data: {
          name: `${trimmedName}'s Workspace`,
          slug: workspaceSlug,
          ownerId: user.id,
          createdAt: now,
          updatedAt: now,
        },
      });

      // 3. Insert membership
      const membership = await tx.membership.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'OWNER',
          status: 'active',
          createdAt: now,
        },
      });

      // 4. Insert verification AuthToken
      await tx.authToken.create({
        data: {
          userId: user.id,
          tokenHash,
          type: 'EMAIL_VERIFICATION',
          expiresAt,
          createdAt: now,
        },
      });

      return {
        user,
        workspace,
        membership,
        rawVerificationToken,
      };
    });
  }

  /**
   * Atomic Email Verification:
   * Consumes verification token and activates the account in a single transaction.
   * If token is invalid, expired, or already used, rolls back and returns null.
   */
  public async verifyEmailAtomic(
    rawToken: string,
    now = new Date()
  ): Promise<{ user: User } | null> {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const tokenHash = hashToken(rawToken);

    return this.client.$transaction(async (tx) => {
      // Conditional atomic token consumption
      const tokens = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
        UPDATE "AuthToken"
        SET "usedAt" = ${now}
        WHERE "tokenHash" = ${tokenHash}
          AND "type" = 'EMAIL_VERIFICATION'::"AuthTokenType"
          AND "usedAt" IS NULL
          AND "expiresAt" > ${now}
        RETURNING "id", "userId";
      `;

      if (!tokens || tokens.length === 0) {
        return null;
      }

      const userId = tokens[0].userId;

      // Update user status to ACTIVE
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          status: 'ACTIVE',
          updatedAt: now,
        },
      });

      return { user };
    });
  }

  /**
   * Atomic Password Reset:
   * Consumes password reset token, updates user passwordHash,
   * and revokes ALL active user sessions across all devices in a single transaction.
   *
   * Note: The newPasswordHash must be pre-computed before calling this method.
   */
  public async resetPasswordAtomic(
    rawToken: string,
    newPasswordHash: string,
    now = new Date()
  ): Promise<ResetPasswordResult | null> {
    if (!rawToken || !newPasswordHash) return null;
    const tokenHash = hashToken(rawToken);

    return this.client.$transaction(async (tx) => {
      // 1. Conditional atomic token consumption
      const tokens = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
        UPDATE "AuthToken"
        SET "usedAt" = ${now}
        WHERE "tokenHash" = ${tokenHash}
          AND "type" = 'PASSWORD_RESET'::"AuthTokenType"
          AND "usedAt" IS NULL
          AND "expiresAt" > ${now}
        RETURNING "id", "userId";
      `;

      if (!tokens || tokens.length === 0) {
        return null;
      }

      const userId = tokens[0].userId;

      // 2. Update user password
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          updatedAt: now,
        },
      });

      // 3. Revoke all user sessions across all devices
      const deletedSessions = await tx.session.deleteMany({
        where: { userId },
      });

      return {
        userId,
        revokedSessionCount: deletedSessions.count,
      };
    });
  }
}

export const userRepository = new UserRepository();
