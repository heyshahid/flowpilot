/**
 * FlowPilot Perimeter Edge Middleware
 * Phase 10C-B4.3: Edge Middleware & Session Validation (Security Hardened)
 *
 * Implements strict stateless perimeter defense for FlowPilot:
 * 1. Early rejection: 401 JSON for protected APIs, 307 redirect for protected UI pages when session cookie is missing.
 * 2. Strict webhook route classification: External ingress callbacks bypass perimeter, while webhook management endpoints are strictly protected.
 * 3. Strict invitation route classification: Public metadata inspection passes, while invitation acceptance requires an authenticated session.
 * 4. Explicit authentication allowlist: Only approved auth endpoints and HTTP methods pass through; unknown auth routes are fail-closed protected.
 * 5. Authoritative header sanitization: Strips untrusted identity headers (x-user-id, x-user-role, x-workspace-id, x-membership-role).
 * 6. 100% Edge-runtime compatible: Zero database or heavy crypto dependencies.
 */

import { NextRequest, NextResponse } from 'next/server';

const UNTRUSTED_IDENTITY_HEADERS = [
  'x-user-id',
  'x-user-role',
  'x-workspace-id',
  'x-membership-role',
];

interface AllowedEndpoint {
  path: string;
  methods: string[];
}

/**
 * Strict allowlist of approved public authentication and self-management endpoints.
 * Explicitly binds each permitted path to its valid HTTP method(s).
 */
const APPROVED_AUTH_ENDPOINTS: AllowedEndpoint[] = [
  { path: '/api/v1/auth/csrf', methods: ['GET'] },
  { path: '/api/v1/auth/register', methods: ['POST'] },
  { path: '/api/v1/auth/login', methods: ['POST'] },
  { path: '/api/v1/auth/forgot-password', methods: ['POST'] },
  { path: '/api/v1/auth/reset-password', methods: ['POST'] },
  { path: '/api/v1/auth/verify-email', methods: ['POST'] },
  { path: '/api/v1/auth/session', methods: ['GET'] },
  { path: '/api/v1/auth/me', methods: ['GET'] },
  { path: '/api/v1/auth/resend-verification', methods: ['POST'] },
  { path: '/api/v1/auth/logout', methods: ['POST'] },
];

/**
 * Checks if a pathname represents a static asset or Next.js internal path.
 */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|eot)$/i.test(pathname)
  );
}

/**
 * Validates that an authentication request matches an approved path and permitted HTTP method.
 * Any unknown route under /api/v1/auth/* or unexpected HTTP method is fail-closed.
 */
function isApprovedAuthRoute(pathname: string, method: string): boolean {
  const normMethod = method.toUpperCase();
  const endpoint = APPROVED_AUTH_ENDPOINTS.find((e) => e.path === pathname);
  if (!endpoint) {
    return false;
  }
  return endpoint.methods.includes(normMethod);
}

/**
 * Identifies external webhook ingress callbacks:
 * - Matches: /api/v1/webhooks/<token> (single segment, GET or POST)
 * - Excludes: /api/v1/webhooks (management list/create)
 * - Excludes: /api/v1/webhooks/<token>/rotate-secret (management)
 * - Excludes: /api/v1/webhooks/<token>/deliveries (management)
 */
function isExternalWebhookIngress(pathname: string, method: string): boolean {
  const normMethod = method.toUpperCase();
  if (normMethod !== 'POST' && normMethod !== 'GET') {
    return false;
  }

  const webhookIngressRegex = /^\/api\/v1\/webhooks\/([^/]+)$/;
  const match = pathname.match(webhookIngressRegex);
  if (!match) {
    return false;
  }

  const tokenOrSubpath = match[1];
  // Sub-actions are management operations and must be protected
  if (tokenOrSubpath === 'rotate-secret' || tokenOrSubpath === 'deliveries') {
    return false;
  }

  return true;
}

/**
 * Identifies public invitation metadata inspection:
 * - Matches: GET /api/v1/invitations/<token>
 * - Excludes: POST /api/v1/invitations/accept (must be authenticated)
 * - Excludes: /api/v1/invitations (management)
 */
function isPublicInvitationInspection(pathname: string, method: string): boolean {
  if (method.toUpperCase() !== 'GET') {
    return false;
  }

  const inviteRegex = /^\/api\/v1\/invitations\/([^/]+)$/;
  const match = pathname.match(inviteRegex);
  if (!match) {
    return false;
  }

  const tokenOrSubpath = match[1];
  if (tokenOrSubpath === 'accept') {
    return false;
  }

  return true;
}

/**
 * Checks if a pathname represents a public healthcheck endpoint.
 */
function isPublicHealthCheck(pathname: string, method: string): boolean {
  return pathname === '/api/v1/health' && method.toUpperCase() === 'GET';
}

/**
 * Checks if a pathname represents a public UI landing/auth page.
 */
function isPublicUiPage(pathname: string, method: string): boolean {
  const normMethod = method.toUpperCase();
  if (normMethod !== 'GET' && normMethod !== 'HEAD') {
    return false;
  }

  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/invite' ||
    /^\/invite\/[^/]+$/.test(pathname)
  );
}

/**
 * Sanitizes incoming request headers by removing spoofed identity headers.
 */
function sanitizeHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const header of UNTRUSTED_IDENTITY_HEADERS) {
    headers.delete(header);
  }
  return headers;
}

/**
 * Checks for the presence of an active session cookie according to RFC 6265bis.
 */
function hasSessionCookie(request: NextRequest): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const prodCookie = request.cookies.get('__Host-fp_session')?.value;
    return Boolean(prodCookie && prodCookie.trim().length > 0);
  }

  const prodCookie = request.cookies.get('__Host-fp_session')?.value;
  const devCookie = request.cookies.get('fp_session')?.value;
  const token = prodCookie || devCookie;
  return Boolean(token && token.trim().length > 0);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;
  const cleanPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  // 1. Static and Internal Next.js Assets pass through directly
  if (isStaticAsset(cleanPath)) {
    return NextResponse.next();
  }

  // 2. Prepare sanitized headers for downstream consumption
  const sanitizedHeaders = sanitizeHeaders(request);

  // 3. Route Classification
  const isApprovedAuth = isApprovedAuthRoute(cleanPath, method);
  const isWebhookIngress = isExternalWebhookIngress(cleanPath, method);
  const isInvitationInspection = isPublicInvitationInspection(cleanPath, method);
  const isHealth = isPublicHealthCheck(cleanPath, method);
  const isPublicUi = isPublicUiPage(cleanPath, method);

  // Public and approved self-management routes pass through perimeter defense with headers sanitized
  if (isApprovedAuth || isWebhookIngress || isInvitationInspection || isHealth || isPublicUi) {
    return NextResponse.next({
      request: {
        headers: sanitizedHeaders,
      },
    });
  }

  // 4. Protected Route Perimeter Defense: Verify Session Cookie Presence
  const authenticated = hasSessionCookie(request);

  if (!authenticated) {
    // 4A. Protected API routes fail early with 401 Unauthorized JSON
    if (cleanPath.startsWith('/api/')) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Missing session cookie.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    // 4B. Protected UI pages redirect to /login with returnTo query parameter
    // Allow development layout preview only if explicitly configured in development mode
    const isDevBypass =
      process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_UI_REDIRECT === 'true';

    if (!isDevBypass) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('returnTo', cleanPath);
      return NextResponse.redirect(loginUrl, 307);
    }
  }

  // 5. Authenticated requests pass downstream with sanitized headers
  return NextResponse.next({
    request: {
      headers: sanitizedHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder image files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
