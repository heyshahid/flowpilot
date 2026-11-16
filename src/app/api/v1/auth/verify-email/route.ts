/**
 * FlowPilot Email Verification Endpoint
 * POST /api/v1/auth/verify-email
 *
 * Implements atomic single-use verification token consumption,
 * account status transition to ACTIVE, and safe session rotation.
 */

import { NextRequest } from 'next/server';
import { verifyEmailSchema } from '@/lib/auth/schemas';
import { userRepository } from '@/lib/storage/postgres/userRepository';
import { sessionRepository } from '@/lib/storage/postgres/sessionRepository';
import { rateLimiterService } from '@/lib/security/rateLimiter';
import { extractSessionToken } from '@/lib/security/cookies';
import { getSecurityConfig } from '@/lib/security/config';
import {
  getRequestClientIp,
  errorResponse,
  successResponse,
  checkOrigin,
  applyAuthCookies,
} from '@/lib/auth/requestUtils';

export async function POST(req: NextRequest) {
  try {
    // 1. Origin / Referer Validation
    if (!checkOrigin(req)) {
      return errorResponse('CSRF protection: Untrusted or missing origin.', 403, 'CSRF_ORIGIN_MISMATCH');
    }

    // 2. Rate Limiting Check (10 requests / 1 min per IP)
    const clientIp = getRequestClientIp(req);
    const rateCheck = await rateLimiterService.getBackend().consume({
      key: `verify_email:ip:${clientIp}`,
      windowSeconds: 60,
      maxAttempts: 10,
    });

    if (!rateCheck.allowed) {
      return errorResponse(
        'Too many verification attempts. Please try again later.',
        429,
        'RATE_LIMIT_EXCEEDED',
        { 'Retry-After': String(rateCheck.retryAfterSeconds) }
      );
    }

    // 3. Parse and Validate Body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON request body.', 400, 'INVALID_JSON');
    }

    const parseResult = verifyEmailSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse('Invalid verification token format.', 400, 'VALIDATION_ERROR');
    }

    const { token } = parseResult.data;

    // 4. Atomic Verification Transaction (Token Consumption + Status Update to ACTIVE)
    const verificationResult = await userRepository.verifyEmailAtomic(token);

    if (!verificationResult) {
      return errorResponse('Invalid or expired verification link.', 400, 'INVALID_TOKEN');
    }

    const res = successResponse({
      message: 'Email verified successfully. Welcome to FlowPilot!',
      user: {
        id: verificationResult.user.id,
        email: verificationResult.user.email,
        name: verificationResult.user.name,
        status: 'ACTIVE',
        isPendingVerification: false,
      },
    });

    // 5. Safe Session Rotation if restricted session cookie is present on this client
    try {
      const config = getSecurityConfig();
      const cookieHeader = req.headers.get('cookie');
      const currentRawToken = extractSessionToken(cookieHeader, config.isProduction);

      if (currentRawToken) {
        const rotated = await sessionRepository.rotateSession(currentRawToken);
        applyAuthCookies(res, rotated.rawToken, rotated.session.id);
      }
    } catch {
      // If session rotation fails (e.g. link opened on a different browser),
      // the account is still ACTIVE and the user can simply log in.
    }

    return res;
  } catch (error) {
    return errorResponse((error as Error).message || 'Internal server error.', 500);
  }
}
