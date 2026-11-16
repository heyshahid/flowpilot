/**
 * FlowPilot Reset Password Completion Endpoint
 * POST /api/v1/auth/reset-password
 *
 * Implements atomic password reset:
 * - Pre-transaction Argon2id password hashing
 * - Atomic token consumption, password update, and all-device session revocation
 * - Mandatory cookie clearing and zero auto-login policy
 */

import { NextRequest } from 'next/server';
import { resetPasswordSchema } from '@/lib/auth/schemas';
import { userRepository } from '@/lib/storage/postgres/userRepository';
import { hashPassword } from '@/lib/security/argon2';
import { rateLimiterService } from '@/lib/security/rateLimiter';
import { getSecurityConfig } from '@/lib/security/config';
import { buildClearSessionCookie, buildClearCsrfCookie } from '@/lib/security/cookies';
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

    // 2. Rate Limiting Check (5 attempts / 15 min per IP)
    const clientIp = getRequestClientIp(req);
    const rateCheck = await rateLimiterService.getBackend().consume({
      key: `reset_pwd:ip:${clientIp}`,
      windowSeconds: 900,
      maxAttempts: 5,
    });

    if (!rateCheck.allowed) {
      return errorResponse(
        'Too many password reset attempts. Please try again later.',
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

    const parseResult = resetPasswordSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || 'Invalid input data.';
      return errorResponse(firstError, 400, 'VALIDATION_ERROR');
    }

    const { token, newPassword } = parseResult.data;

    // 4. Pre-compute Argon2id hash BEFORE opening database transaction
    // (Prevents holding DB locks during 64 MiB Argon2id compute)
    const newPasswordHash = await hashPassword(newPassword);

    // 5. Execute Atomic Password Reset Transaction
    // (Consumes token + updates password + revokes ALL user sessions in 1 transaction)
    const resetResult = await userRepository.resetPasswordAtomic(token, newPasswordHash);

    if (!resetResult) {
      return errorResponse('Invalid or expired password reset link.', 400, 'INVALID_TOKEN');
    }

    // 6. Mandatory Cookie Invalidation & Zero Auto-Login
    const res = successResponse(
      {
        message: 'Password updated successfully. Please log in with your new password.',
      },
      200
    );

    res.headers.append('Set-Cookie', buildClearSessionCookie({ isProduction: config.isProduction }));
    res.headers.append('Set-Cookie', buildClearCsrfCookie({ isProduction: config.isProduction }));

    return res;
  } catch (error) {
    return errorResponse((error as Error).message || 'Internal server error.', 500);
  }
}
