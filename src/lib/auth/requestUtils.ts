/**
 * FlowPilot Authentication Request Utilities
 * Phase 10C-B3: Authentication Backend Routes
 *
 * Provides request helpers for:
 * - Client IP resolution using trusted proxy validation
 * - Standardized JSON success and error response formatting
 * - Origin / Referer validation and CSRF enforcement
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSecurityConfig } from '../security/config';
import { resolveClientIp } from '../security/rateLimiter';
import { validateOriginAndReferer, validateCsrfProtection, generateCsrfToken } from '../security/csrf';
import { extractSessionToken, extractCsrfToken, buildSessionCookie, buildCsrfCookie } from '../security/cookies';
import { sessionRepository } from '../storage/postgres/sessionRepository';

/**
 * Extracts genuine client IP from incoming NextRequest.
 */
export function getRequestClientIp(req: NextRequest): string {
  const config = getSecurityConfig();
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');

  // Next.js standard IP lookup fallback
  const socketIp = (req as any).ip || realIp || '127.0.0.1';

  return resolveClientIp(socketIp, forwardedFor, config.trustedProxyCidrs);
}

/**
 * Standardized JSON error response envelope.
 */
export function errorResponse(
  error: string,
  status = 400,
  code?: string,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(code ? { code } : {}),
    },
    {
      status,
      headers: extraHeaders,
    }
  );
}

/**
 * Standardized JSON success response envelope.
 */
export function successResponse(
  data: Record<string, unknown> = {},
  status = 200,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      ...data,
    },
    {
      status,
      headers: extraHeaders,
    }
  );
}

/**
 * Validates Origin/Referer header against configured allowlist for mutating requests.
 * Returns true if valid, false if rejected.
 */
export function checkOrigin(req: NextRequest): boolean {
  const config = getSecurityConfig();
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // If both are missing, check if it's a browser request
  if (!origin && !referer) {
    // In local dev without browser origin (e.g. curl), allow if dev mode, otherwise reject
    if (!config.isProduction) {
      return true;
    }
    return false;
  }

  return validateOriginAndReferer(origin, referer, config.allowedOrigins);
}

/**
 * Helper to build auth cookies (session + csrf) and apply them to a response.
 */
export function applyAuthCookies(
  res: NextResponse,
  rawSessionToken: string,
  sessionId: string
): void {
  const config = getSecurityConfig();

  // 1. Build session cookie
  const sessionCookie = buildSessionCookie(rawSessionToken, {
    isProduction: config.isProduction,
  });

  // 2. Generate signed CSRF token bound to this session ID
  const csrfToken = generateCsrfToken(sessionId, config.sessionSecret);

  // 3. Build readable CSRF cookie
  const csrfCookie = buildCsrfCookie(csrfToken, {
    isProduction: config.isProduction,
  });

  res.headers.append('Set-Cookie', sessionCookie);
  res.headers.append('Set-Cookie', csrfCookie);
}
