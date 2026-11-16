/**
 * FlowPilot Forgot Password Endpoint
 * POST /api/v1/auth/forgot-password
 *
 * Implements password reset initiation, single-use token issuance,
 * per-account rate-limiting (3/hr), and strict anti-enumeration envelopes.
 */

import { NextRequest } from 'next/server';
import { forgotPasswordSchema } from '@/lib/auth/schemas';
import { userRepository } from '@/lib/storage/postgres/userRepository';
import { authTokenRepository } from '@/lib/storage/postgres/authTokenRepository';
import { rateLimiterService } from '@/lib/security/rateLimiter';
import { getAuthNotificationService } from '@/lib/auth/notificationService';
import {
  getRequestClientIp,
  errorResponse,
  successResponse,
  checkOrigin,
} from '@/lib/auth/requestUtils';

export async function POST(req: NextRequest) {
  try {
    // 1. Origin / Referer Validation
    if (!checkOrigin(req)) {
      return errorResponse('CSRF protection: Untrusted or missing origin.', 403, 'CSRF_ORIGIN_MISMATCH');
    }

    // 2. Parse and Validate Body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON request body.', 400, 'INVALID_JSON');
    }

    const parseResult = forgotPasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse('Invalid email address format.', 400, 'VALIDATION_ERROR');
    }

    const { email } = parseResult.data;
    const clientIp = getRequestClientIp(req);

    // Standard generic message to prevent account enumeration
    const genericSuccessMessage =
      'If an account with that email exists, password reset instructions have been sent.';

    // 3. Look up User
    const user = await userRepository.getUserByEmail(email);

    if (!user) {
      // Consume general rate limit to prevent IP flooding
      await rateLimiterService.getBackend().consume({
        key: `forgot_pwd:ip:${clientIp}`,
        windowSeconds: 60,
        maxAttempts: 5,
      });
      return successResponse({ message: genericSuccessMessage }, 200);
    }

    // 4. Check Per-Account Rate Limit (Max 3 / 1 hour)
    const rateCheck = await rateLimiterService.checkPasswordResetLimit(user.email);
    if (!rateCheck.allowed) {
      return errorResponse(
        'Too many password reset requests for this account. Please wait before requesting another link.',
        429,
        'RATE_LIMIT_EXCEEDED',
        { 'Retry-After': String(rateCheck.retryAfterSeconds) }
      );
    }

    // 5. Invalidate Any Existing Unused Reset Tokens for this User
    await authTokenRepository.revokeUserTokens(user.id, 'PASSWORD_RESET');

    // 6. Create Fresh Single-Use Reset Token (1-hour window)
    const tokenRecord = await authTokenRepository.createAuthToken({
      userId: user.id,
      type: 'PASSWORD_RESET',
      ttlHours: 1,
    });

    // 7. Dispatch Password Reset Email
    try {
      const notifier = getAuthNotificationService();
      await notifier.sendPasswordResetEmail(user.email, user.name, tokenRecord.rawToken);
    } catch (err) {
      console.warn(`[AUTH] Password reset email failed for ${user.id}: ${(err as Error).message}`);
    }

    return successResponse({ message: genericSuccessMessage }, 200);
  } catch (error) {
    return errorResponse((error as Error).message || 'Internal server error.', 500);
  }
}
