/**
 * FlowPilot User Logout & Session Revocation Endpoint
 * POST /api/v1/auth/logout
 *
 * Implements single-session revocation, double-submit CSRF enforcement,
 * and secure cookie invalidation.
 */

import { NextRequest } from 'next/server';
import { sessionRepository } from '@/lib/storage/postgres/sessionRepository';
import { getSecurityConfig } from '@/lib/security/config';
import { validateCsrfProtection } from '@/lib/security/csrf';
import {
  extractSessionToken,
  extractCsrfToken,
  buildClearSessionCookie,
  buildClearCsrfCookie,
} from '@/lib/security/cookies';
import { errorResponse, successResponse, checkOrigin } from '@/lib/auth/requestUtils';

export async function POST(req: NextRequest) {
  try {
    const config = getSecurityConfig();

    // 1. Origin / Referer Check
    if (!checkOrigin(req)) {
      return errorResponse('CSRF protection: Untrusted or missing origin.', 403, 'CSRF_ORIGIN_MISMATCH');
    }

    // 2. Extract Session Token
    const cookieHeader = req.headers.get('cookie');
    const rawSessionToken = extractSessionToken(cookieHeader, config.isProduction);

    // If no session exists, simply ensure cookies are cleared and return 200
    if (!rawSessionToken) {
      const res = successResponse({ message: 'Logged out successfully.' });
      res.headers.append('Set-Cookie', buildClearSessionCookie({ isProduction: config.isProduction }));
      res.headers.append('Set-Cookie', buildClearCsrfCookie({ isProduction: config.isProduction }));
      return res;
    }

    // 3. Validate Session
    const validation = await sessionRepository.validateSession(rawSessionToken);

    if (validation.valid && validation.session) {
      // 4. Validate CSRF Protection for Authenticated Mutation
      const csrfHeaderToken = req.headers.get('x-csrf-token') || extractCsrfToken(cookieHeader);
      const origin = req.headers.get('origin');
      const referer = req.headers.get('referer');

      const csrfResult = validateCsrfProtection({
        method: 'POST',
        sessionId: validation.session.id,
        csrfToken: csrfHeaderToken,
        origin,
        referer,
        authType: 'cookie',
        allowedOrigins: config.allowedOrigins,
        activeSecret: config.sessionSecret,
        previousSecret: config.sessionSecretPrevious,
      });

      if (!csrfResult.allowed) {
        return errorResponse(
          csrfResult.errorMessage || 'Invalid or missing CSRF token.',
          csrfResult.statusCode,
          csrfResult.errorCode
        );
      }

      // 5. Revoke Session from PostgreSQL
      await sessionRepository.revokeSession(rawSessionToken);
    }

    // 6. Build Response and Clear Cookies
    const res = successResponse({ message: 'Logged out successfully.' });
    res.headers.append('Set-Cookie', buildClearSessionCookie({ isProduction: config.isProduction }));
    res.headers.append('Set-Cookie', buildClearCsrfCookie({ isProduction: config.isProduction }));
    return res;
  } catch (error) {
    return errorResponse((error as Error).message || 'Internal server error.', 500);
  }
}
