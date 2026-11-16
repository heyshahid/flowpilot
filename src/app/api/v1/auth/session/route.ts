/**
 * FlowPilot Canonical Session Status Endpoint
 * GET /api/v1/auth/session
 *
 * Implements session validation, restricted tier detection,
 * activity tracking, and user profile resolution.
 */

import { NextRequest } from 'next/server';
import { sessionRepository } from '@/lib/storage/postgres/sessionRepository';
import { extractSessionToken, buildCsrfCookie } from '@/lib/security/cookies';
import { generateCsrfToken } from '@/lib/security/csrf';
import { getSecurityConfig } from '@/lib/security/config';
import { errorResponse, successResponse } from '@/lib/auth/requestUtils';

export async function GET(req: NextRequest) {
  try {
    const config = getSecurityConfig();
    const cookieHeader = req.headers.get('cookie');
    const rawSessionToken = extractSessionToken(cookieHeader, config.isProduction);

    if (!rawSessionToken) {
      return errorResponse('No active session found.', 401, 'UNAUTHENTICATED');
    }

    // Validate dual expiration (14-day absolute + 2-hour idle) and touch activity
    const validation = await sessionRepository.validateSession(rawSessionToken);

    if (!validation.valid || !validation.session || !validation.user) {
      return errorResponse(
        'Session has expired or is invalid. Please log in again.',
        401,
        validation.reason || 'SESSION_INVALID'
      );
    }

    const { user, session } = validation;

    // Reject and purge suspended users
    if (user.status === 'SUSPENDED') {
      await sessionRepository.revokeSession(rawSessionToken);
      return errorResponse('Account suspended.', 403, 'ACCOUNT_SUSPENDED');
    }

    const isPending = user.status === 'PENDING_VERIFICATION';

    const res = successResponse(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          isPendingVerification: isPending,
        },
      },
      200
    );

    // Ensure CSRF token is refreshed if approaching renewal window
    const csrfToken = generateCsrfToken(session.id, config.sessionSecret);
    res.headers.append(
      'Set-Cookie',
      buildCsrfCookie(csrfToken, { isProduction: config.isProduction })
    );

    return res;
  } catch (error) {
    return errorResponse((error as Error).message || 'Internal server error.', 500);
  }
}
