/**
 * FlowPilot User Registration Endpoint
 * POST /api/v1/auth/register
 *
 * Implements atomic user registration, default workspace setup,
 * single-use email verification token generation, and restricted session minting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { registerSchema } from '@/lib/auth/schemas';
import { userRepository } from '@/lib/storage/postgres/userRepository';
import { authTokenRepository } from '@/lib/storage/postgres/authTokenRepository';
import { sessionRepository } from '@/lib/storage/postgres/sessionRepository';
import { hashPassword } from '@/lib/security/argon2';
import { rateLimiterService } from '@/lib/security/rateLimiter';
import { getAuthNotificationService } from '@/lib/auth/notificationService';
import {
  getRequestClientIp,
  errorResponse,
  successResponse,
  checkOrigin,
  applyAuthCookies,
} from '@/lib/auth/requestUtils';

export async function POST(req: NextRequest) {
  try {
    // 1. Validate Origin / Referer
    if (!checkOrigin(req)) {
      return errorResponse('CSRF protection: Untrusted or missing origin.', 403, 'CSRF_ORIGIN_MISMATCH');
    }

    // 2. Rate Limiting Check (Registration: 3 requests / 1 min per IP)
    const clientIp = getRequestClientIp(req);
    const rateCheck = await rateLimiterService.getBackend().consume({
      key: `register:ip:${clientIp}`,
      windowSeconds: 60,
      maxAttempts: 3,
    });

    if (!rateCheck.allowed) {
      return errorResponse(
        'Too many registration attempts. Please try again later.',
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

    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || 'Invalid input data.';
      return errorResponse(firstError, 400, 'VALIDATION_ERROR');
    }

    const { email, name, password } = parseResult.data;

    // 4. Check for Existing Account (Anti-Enumeration Guard)
    const existingUser = await userRepository.getUserByEmail(email);
    if (existingUser) {
      // If user exists and is unverified, trigger resend in background
      if (existingUser.status === 'PENDING_VERIFICATION') {
        try {
          await authTokenRepository.revokeUserTokens(existingUser.id, 'EMAIL_VERIFICATION');
          const tokenRes = await authTokenRepository.createAuthToken({
            userId: existingUser.id,
            type: 'EMAIL_VERIFICATION',
            ttlHours: 24,
          });
          const notifier = getAuthNotificationService();
          await notifier.sendVerificationEmail(existingUser.email, existingUser.name, tokenRes.rawToken);
        } catch {
          // Ignore background resend failure to maintain identical response
        }
      }

      // Return generic 200/201 envelope to prevent account enumeration
      return successResponse(
        {
          message: 'If this email is eligible for registration, verification instructions have been sent.',
        },
        200
      );
    }

    // 5. Pre-compute Argon2id hash prior to opening DB transaction
    const passwordHash = await hashPassword(password);

    // 6. Atomic Registration Transaction (User + Workspace + Membership + AuthToken)
    const { user, rawVerificationToken } = await userRepository.registerUserAtomic({
      email,
      name,
      passwordHash,
    });

    // 7. Dispatch Verification Email (with graceful error recovery)
    let emailDispatched = true;
    try {
      const notifier = getAuthNotificationService();
      await notifier.sendVerificationEmail(user.email, user.name, rawVerificationToken);
    } catch (emailErr) {
      emailDispatched = false;
      console.warn(`[AUTH] Verification email dispatch deferred for user ${user.id}: ${(emailErr as Error).message}`);
    }

    // 8. Mint Restricted Session for Onboarding
    const { session, rawToken: rawSessionToken } = await sessionRepository.createSession({
      userId: user.id,
      userAgent: req.headers.get('user-agent') || undefined,
      ipAddress: clientIp,
    });

    // 9. Build Response and Apply Auth Cookies
    const responseMessage = emailDispatched
      ? 'Account created. Please check your email to verify your account.'
      : 'Account created. There was an issue delivering your verification email; please use "Resend Verification" to receive a new link.';

    const res = successResponse(
      {
        message: responseMessage,
        ...(emailDispatched ? {} : { emailDeliveryStatus: 'FAILED_RETRYABLE' }),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          isPendingVerification: true,
        },
      },
      201
    );

    applyAuthCookies(res, rawSessionToken, session.id);
    return res;
  } catch (error) {
    return errorResponse((error as Error).message || 'Internal server error.', 500);
  }
}
