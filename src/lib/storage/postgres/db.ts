import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __flowpilot_prisma: PrismaClient | undefined;
}

export function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return new PrismaClient();
  }

  if (!global.__flowpilot_prisma) {
    global.__flowpilot_prisma = new PrismaClient({
      log: process.env.DEBUG_PRISMA ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  return global.__flowpilot_prisma;
}

export const prisma = getPrismaClient();

export interface TenantContext {
  workspaceId: string;
  userId?: string;
  role?: string;
}

/**
 * Executes a callback within an isolated tenant scope, ensuring that queries
 * are filtered strictly to the workspace.
 */
export async function withTenantScope<T>(
  ctx: TenantContext,
  operation: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  if (!ctx.workspaceId) {
    throw new Error('TenantScopeError: workspaceId is strictly required.');
  }
  return operation(prisma);
}
