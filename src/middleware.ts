/**
 * FlowPilot Perimeter Edge Middleware
 * Phase 10C-B4.3: Edge Middleware & Session Validation
 *
 * Implements stateless perimeter defense for FlowPilot:
 * 1. Early rejection: 401 JSON for protected APIs, 307 redirect for protected UI pages when session cookie is missing.
 * 2. Authoritative header sanitization: Strips untrusted identity headers (x-user-id, x-user-role, x-workspace-id, x-membership-role).
 * 3. Route classification: Public auth and ingress routes pass through to specialized handlers.
 * 4. 100% Edge-runtime compatible: Zero database or heavy crypto dependencies.
 */

import { NextRequest, NextResponse } from 'next/server';

const UNTRUSTED_IDENTITY_HEADERS = [
  'x-user-id',
  'x-user-role',
  'x-workspace-id',
  'x-membership-role',
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
 * Checks if a pathname represents a public authentication or self-management API endpoint.
 */
function isPublicAuthApi(pathname: string): boolean {
  return (
    pathname === '/api/v1/auth/csrf' ||
    pathname === '/api/v1/auth/register' ||
    pathname === '/api/v1/auth/login' ||
    pathname === '/api/v1/auth/forgot-password' ||
    pathname === '/api/v1/auth/reset-password' ||
    pathname === '/api/v1/auth/verify-email' ||
    pathname === '/api/v1/auth/session' ||
    pathname === '/api/v1/auth/me' ||
    pathname === '/api/v1/auth/resend-verification' ||
    pathname === '/api/v1/auth/logout'
  );
}

/**
 * Checks if a pathname represents a public webhook or external ingress endpoint.
 */
function isPublicIngressApi(pathname: string): boolean {
  return (
    pathname.startsWith('/api/v1/webhooks/') ||
    pathname.startsWith('/api/v1/invitations/') ||
    pathname === '/api/v1/health'
  );
}

/**
 * Checks if a pathname represents a public UI page.
 */
function isPublicUiPage(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/invite' ||
    pathname.startsWith('/invite/')
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
  const cleanPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  // 1. Static and Internal Next.js Assets pass through directly
  if (isStaticAsset(cleanPath)) {
    return NextResponse.next();
  }

  // 2. Prepare sanitized headers for downstream consumption
  const sanitizedHeaders = sanitizeHeaders(request);

  // 3. Route Classification
  const isAuthApi = isPublicAuthApi(cleanPath);
  const isIngressApi = isPublicIngressApi(cleanPath);
  const isPublicUi = isPublicUiPage(cleanPath);

  // Public routes pass through perimeter defense with headers sanitized
  if (isAuthApi || isIngressApi || isPublicUi) {
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

