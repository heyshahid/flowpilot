/**
 * FlowPilot CSRF Bootstrap Endpoint
 * GET /api/v1/auth/csrf
 *
 * Mints an initial CSRF token and cookie for clients loading initial forms.
 */

import { NextRequest } from 'next/server';
import { generateCsrfToken } from '@/lib/security/csrf';
import { buildCsrfCookie } from '@/lib/security/cookies';
import { getSecurityConfig } from '@/lib/security/config';
import { successResponse } from '@/lib/auth/requestUtils';

export async function GET(req: NextRequest) {
  const config = getSecurityConfig();
  const anonymousSessionId = 'bootstrap_' + Math.random().toString(36).substring(2);

  const csrfToken = generateCsrfToken(anonymousSessionId, config.sessionSecret);

  const res = successResponse({ csrfToken }, 200);
  res.headers.append(
    'Set-Cookie',
    buildCsrfCookie(csrfToken, { isProduction: config.isProduction })
  );

  return res;
}
