/**
 * FlowPilot Resend Verification Email Endpoint
 * POST /api/v1/auth/resend-verification
 *
 * Implements token reissue for unverified accounts, invalidation of stale tokens,
 * per-account rate-limiting (3/hr), and strict anti-enumeration envelopes.
 */

import { NextRequest } from 'next/server';
import { resendVerificationSchema } from '@/lib/auth/schemas';
import { userRepository } from '@/lib/storage/postgres/userRepository';
import { authTokenRepository } from '@/lib/storage/postgres/authTokenRepository';
import { sessionRepository } from '@/lib/storage/postgres/sessionRepository';
import { rateLimiterService } from '@/lib/security/rateLimiter';
import { getAuthNotificationService } from '@/lib/auth/notificationService';
import { extractSessionToken, extractCsrfToken } from '@/lib/security/cookies';
import { validateCsrfProtection } from '@/lib/security/csrf';
import { getSecurityConfig } from '@/lib/security/config';
import {
  getRequestClientIp,
  errorResponse,
  successResponse,
  checkOrigin,
} from '@/lib/auth/requestUtils';

export async function POST(req: NextRequest) {
  try {
    const config = getSecurityConfig();

    // 1. Origin / Referer Validation
    if (!checkOrigin(req)) {
      return errorResponse('CSRF protection: Untrusted or missing origin.', 403, 'CSRF_ORIGIN_MISMATCH');
    }

    const clientIp = getRequestClientIp(req);
    const cookieHeader = req.headers.get('cookie');
    const rawSessionToken = extractSessionToken(cookieHeader, config.isProduction);

    let targetUser: any = null;

    // 2. Identify Target User (via Active Session OR via Request Body)
    if (rawSessionToken) {
      const sessionValidation = await sessionRepository.validateSession(rawSessionToken);
      if (sessionValidation.valid && sessionValidation.session) {
        // Authenticated mutation: Validate CSRF
        const csrfHeaderToken = req.headers.get('x-csrf-token') || extractCsrfToken(cookieHeader);
        const origin = req.headers.get('origin');
        const referer = req.headers.get('referer');

        const csrfResult = validateCsrfProtection({
          method: 'POST',
          sessionId: sessionValidation.session.id,
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

        targetUser = sessionValidation.user;
      }
    }

    if (!targetUser) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        body = {};
      }

      const parseResult = resendVerificationSchema.safeParse(body);
      if (parseResult.success && parseResult.data.email) {
        targetUser = await userRepository.getUserByEmail(parseResult.data.email);
      }
    }

    // Generic response message to prevent account enumeration
    const genericSuccessMessage =
      'If an unverified account with this email exists, a new verification link has been sent.';

    // 3. User Does Not Exist: Return Generic Success
    if (!targetUser) {
      // IP Rate Limit check
      await rateLimiterService.getBackend().consume({
        key: `resend:ip:${clientIp}`,
        windowSeconds: 60,
        maxAttempts: 5,
      });
      return successResponse({ message: genericSuccessMessage }, 200);
    }

    // 4. Rate Limit Check for User Account (Max 3 / 1 hour)
    const rateCheck = await rateLimiterService.checkEmailResendLimit(targetUser.email);
    if (!rateCheck.allowed) {
      return errorResponse(
        'Too many resend requests for this account. Please wait before requesting another link.',
        429,
        'RATE_LIMIT_EXCEEDED',
        { 'Retry-After': String(rateCheck.retryAfterSeconds) }
      );
    }

    // 5. If User is Already ACTIVE: Do Nothing, Return Generic Success (Anti-Enumeration)
    if (targetUser.status === 'ACTIVE') {
      return successResponse({ message: genericSuccessMessage }, 200);
    }

    // 6. User is PENDING_VERIFICATION: Invalidate Stale Tokens and Reissue
    await authTokenRepository.revokeUserTokens(targetUser.id, 'EMAIL_VERIFICATION');

    const tokenRecord = await authTokenRepository.createAuthToken({
      userId: targetUser.id,
      type: 'EMAIL_VERIFICATION',
      ttlHours: 24,
    });

    // 7. Dispatch Email
    try {
      const notifier = getAuthNotificationService();
      await notifier.sendVerificationEmail(targetUser.email, targetUser.name, tokenRecord.rawToken);
    } catch (err) {
      console.warn(`[AUTH] Resend verification email failed for ${targetUser.id}: ${(err as Error).message}`);
    }

    return successResponse({ message: genericSuccessMessage }, 200);
  } catch (error) {
    return errorResponse((error as Error).message || 'Internal server error.', 500);
  }
}
