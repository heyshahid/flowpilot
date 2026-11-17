import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { checkRedisHealth } from '@/lib/redis/health';

/**
 * GET /api/v1/health/redis
 * Protected health check endpoint for Redis infrastructure status.
 *
 * Refinement 3:
 * Requires authentication and administrative privileges (ADMIN or OWNER).
 * Never exposes credentials, internal hostnames, or cluster topology.
 */
export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);

    // Administrative authorization check
    if (authCtx.role !== 'OWNER' && authCtx.role !== 'ADMIN') {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Redis infrastructure health metrics require administrative privileges.',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      );
    }

    const health = await checkRedisHealth('default', 2500);

    const isAvailable = health.status === 'healthy' || health.status === 'disabled';
    const statusCode = isAvailable ? 200 : 503;

    return NextResponse.json(
      {
        success: isAvailable,
        data: {
          status: health.status,
          latencyMs: health.latencyMs,
          telemetry: health.telemetry,
          error: health.error,
          timestamp: health.timestamp,
        },
      },
      { status: statusCode }
    );
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error while evaluating health.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
