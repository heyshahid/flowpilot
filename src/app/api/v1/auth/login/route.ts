/**
 * FlowPilot User Authentication Endpoint
 * POST /api/v1/auth/login
 *
 * Implements password verification with timing normalization (dummy hash verification),
 * uniform anti-enumeration envelopes, progressive rate-limiting, and session minting.
 */

import { NextRequest } from 'next/server';
import { loginSchema } from '@/lib/auth/schemas';
import { userRepository } from '@/lib/storage/postgres/userRepository';
import { sessionRepository } from '@/lib/storage/postgres/sessionRepository';
import { verifyPassword, verifyDummyPassword, needsRehash, hashPassword } from '@/lib/security/argon2';
import { rateLimiterService } from '@/lib/security/rateLimiter';
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

    // 2. Parse and Validate Body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON request body.', 400, 'INVALID_JSON');
    }

    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse('Invalid email or password format.', 400, 'VALIDATION_ERROR');
    }

    const { email, password } = parseResult.data;
    const clientIp = getRequestClientIp(req);

    // 3. Multi-tier Rate Limiting Check
    const rateCheck = await rateLimiterService.checkLoginAttempt(clientIp, email);
    if (!rateCheck.allowed) {
      return errorResponse(
        'Too many login attempts. Please try again later.',
        429,
        'RATE_LIMIT_EXCEEDED',
        { 'Retry-After': String(rateCheck.retryAfterSeconds) }
      );
    }

    // Enforce progressive backoff delay if requested by rate limiter
    if (rateCheck.delayMs > 0) {
      await new Promise((r) => setTimeout(r, rateCheck.delayMs));
    }

    // 4. Look up User
    const user = await userRepository.getUserByEmail(email);

    // Anti-Enumeration Guard: Unknown user
    if (!user) {
      await verifyDummyPassword(password);
      await rateLimiterService.recordLoginFailure(clientIp, email);
      return errorResponse('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // Anti-Enumeration Guard: Suspended account
    // Strictly returns generic 401 without exposing account existence or suspension state
    if (user.status === 'SUSPENDED') {
      await verifyDummyPassword(password);
      await rateLimiterService.recordLoginFailure(clientIp, email);
      console.warn(`[AUTH_AUDIT] Login attempted on suspended account: ${user.id} from IP ${clientIp}`);
      return errorResponse('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.passwordHash) {
      await verifyDummyPassword(password);
      await rateLimiterService.recordLoginFailure(clientIp, email);
      return errorResponse('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // 5. Verify Password
    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      await rateLimiterService.recordLoginFailure(clientIp, email);
      return errorResponse('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // 6. Reset Failed Attempts Counter on Success
    await rateLimiterService.recordLoginSuccess(email);

    // 7. Background Password Rehash if Parameters Evolved
    if (needsRehash(user.passwordHash)) {
      hashPassword(password)
        .then((newHash) => userRepository.updatePassword(user.id, newHash))
        .catch(() => {});
    }

    // 8. Mint Fresh Session
    const { session, rawToken: rawSessionToken } = await sessionRepository.createSession({
      userId: user.id,
      userAgent: req.headers.get('user-agent') || undefined,
      ipAddress: clientIp,
    });

    // 9. Build Success Response with Auth Cookies
    const isPending = user.status === 'PENDING_VERIFICATION';
    const res = successResponse(
      {
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

    applyAuthCookies(res, rawSessionToken, session.id);
    return res;
  } catch (error) {
    return errorResponse((error as Error).message || 'Internal server error.', 500);
  }
}
