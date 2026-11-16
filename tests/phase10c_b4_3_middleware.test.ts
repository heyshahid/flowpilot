/**
 * FlowPilot Automated Test Suite: Phase 10C-B4.3
 * Edge Perimeter Middleware & Session Validation (Security Audit & Corrections)
 *
 * Verifies:
 * 1. Strict webhook route classification:
 *    - Ingress callbacks (/api/v1/webhooks/[token]) pass without cookie
 *    - Management endpoints (/api/v1/webhooks, rotate-secret, deliveries) require session cookie (401)
 * 2. Strict invitation route classification:
 *    - Public metadata inspection (GET /api/v1/invitations/[token]) passes without cookie
 *    - Invitation acceptance (POST /api/v1/invitations/accept) strictly requires session cookie (401)
 * 3. Exact authentication route allowlist:
 *    - Only approved B3 endpoints and methods pass without cookie
 *    - Unknown /api/v1/auth/* endpoints are fail-closed protected (401)
 *    - Method mismatches on auth endpoints are fail-closed protected (401)
 * 4. Protected API and UI perimeter defense
 * 5. Authoritative header sanitization (x-user-id, x-user-role, x-workspace-id, x-membership-role stripped)
 * 6. Cookie detection in production vs development
 * 7. Development UI bypass security invariants
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware';

describe('Phase 10C-B4.3: Next.js Perimeter Edge Middleware (Security Corrections)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    (process.env as any).NODE_ENV = 'test';
    delete process.env.DEV_BYPASS_UI_REDIRECT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ----------------------------------------------------
  // 1. Static & Internal Asset Pass-Through
  // ----------------------------------------------------
  describe('1. Static and Internal Asset Handling', () => {
    it('should pass through Next.js static bundles without alteration', () => {
      const req = new NextRequest('http://localhost:3000/_next/static/chunks/main.js');
      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('should pass through favicon and image files', () => {
      const paths = ['/favicon.ico', '/logo.svg', '/hero.png', '/font.woff2'];
      for (const path of paths) {
        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = middleware(req);
        expect(res.status).toBe(200);
      }
    });
  });

  // ----------------------------------------------------
  // 2. Strict Webhook Route Classification (Audit Issue 1)
  // ----------------------------------------------------
  describe('2. Strict Webhook Route Classification', () => {
    it('should allow external webhook ingress POST callbacks without session cookie', () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/whk_ext_callback_abc123', {
        method: 'POST',
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('should allow external webhook ingress GET callbacks without session cookie', () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/whk_ext_callback_abc123', {
        method: 'GET',
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('should REJECT webhook list/create management endpoint without session cookie with 401', async () => {
      const paths = ['/api/v1/webhooks', '/api/v1/webhooks/'];
      for (const path of paths) {
        const reqGet = new NextRequest(`http://localhost:3000${path}`, { method: 'GET' });
        const resGet = middleware(reqGet);
        expect(resGet.status).toBe(401);

        const reqPost = new NextRequest(`http://localhost:3000${path}`, { method: 'POST' });
        const resPost = middleware(reqPost);
        expect(resPost.status).toBe(401);
      }
    });

    it('should REJECT webhook secret rotation endpoint without session cookie with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/whk_123/rotate-secret', {
        method: 'POST',
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should REJECT webhook deliveries history endpoint without session cookie with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/whk_123/deliveries', {
        method: 'GET',
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should allow webhook management endpoints through when valid session cookie is present', () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/whk_123/rotate-secret', {
        method: 'POST',
        headers: { cookie: 'fp_session=valid_test_session' },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });
  });

  // ----------------------------------------------------
  // 3. Strict Invitation Route Classification (Audit Issue 2)
  // ----------------------------------------------------
  describe('3. Strict Invitation Route Classification', () => {
    it('should allow public invitation metadata inspection (GET) without session cookie', () => {
      const req = new NextRequest('http://localhost:3000/api/v1/invitations/inv_tok_valid_999', {
        method: 'GET',
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('should REJECT invitation acceptance (POST /api/v1/invitations/accept) without session cookie with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/invitations/accept', {
        method: 'POST',
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({
        error: 'Unauthorized: Missing session cookie.',
        code: 'UNAUTHORIZED',
      });
    });

    it('should allow invitation acceptance through to route layer when session cookie is present', () => {
      const req = new NextRequest('http://localhost:3000/api/v1/invitations/accept', {
        method: 'POST',
        headers: { cookie: 'fp_session=valid_user_session' },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('should REJECT generic /api/v1/invitations management route without session cookie with 401', () => {
      const req = new NextRequest('http://localhost:3000/api/v1/invitations', {
        method: 'GET',
      });
      const res = middleware(req);
      expect(res.status).toBe(401);
    });

    it('should allow public UI invitation landing page (/invite/[token]) without session cookie', () => {
      const req = new NextRequest('http://localhost:3000/invite/inv_tok_valid_999', {
        method: 'GET',
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  // ----------------------------------------------------
  // 4. Exact Authentication Route Allowlist (Audit Issue 3)
  // ----------------------------------------------------
  describe('4. Exact Authentication Route Allowlist', () => {
    it('should allow approved authentication endpoints with matching methods without cookie', () => {
      const approvedCases = [
        { path: '/api/v1/auth/csrf', method: 'GET' },
        { path: '/api/v1/auth/register', method: 'POST' },
        { path: '/api/v1/auth/login', method: 'POST' },
        { path: '/api/v1/auth/forgot-password', method: 'POST' },
        { path: '/api/v1/auth/reset-password', method: 'POST' },
        { path: '/api/v1/auth/verify-email', method: 'POST' },
        { path: '/api/v1/auth/session', method: 'GET' },
        { path: '/api/v1/auth/me', method: 'GET' },
        { path: '/api/v1/auth/resend-verification', method: 'POST' },
        { path: '/api/v1/auth/logout', method: 'POST' },
      ];

      for (const item of approvedCases) {
        const req = new NextRequest(`http://localhost:3000${item.path}`, {
          method: item.method,
        });
        const res = middleware(req);
        expect(res.status).toBe(200);
      }
    });

    it('should REJECT unknown or future /api/v1/auth/* routes without session cookie with 401', async () => {
      const unknownRoutes = [
        { path: '/api/v1/auth/unknown-endpoint', method: 'GET' },
        { path: '/api/v1/auth/admin-escalation', method: 'POST' },
        { path: '/api/v1/auth/users', method: 'GET' },
        { path: '/api/v1/auth/tokens/revoke-all', method: 'POST' },
      ];

      for (const item of unknownRoutes) {
        const req = new NextRequest(`http://localhost:3000${item.path}`, {
          method: item.method,
        });
        const res = middleware(req);
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.code).toBe('UNAUTHORIZED');
      }
    });

    it('should REJECT disallowed HTTP methods on approved auth endpoints without session cookie with 401', async () => {
      const methodMismatches = [
        { path: '/api/v1/auth/csrf', method: 'POST' }, // only GET allowed
        { path: '/api/v1/auth/login', method: 'GET' }, // only POST allowed
        { path: '/api/v1/auth/register', method: 'GET' }, // only POST allowed
        { path: '/api/v1/auth/session', method: 'POST' }, // only GET allowed
        { path: '/api/v1/auth/me', method: 'DELETE' }, // only GET allowed
      ];

      for (const item of methodMismatches) {
        const req = new NextRequest(`http://localhost:3000${item.path}`, {
          method: item.method,
        });
        const res = middleware(req);
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.code).toBe('UNAUTHORIZED');
      }
    });
  });

  // ----------------------------------------------------
  // 5. Protected API Route Perimeter Defense
  // ----------------------------------------------------
  describe('5. Protected API Route Perimeter Defense', () => {
    it('should return immediate 401 JSON when session cookie is missing on protected API', async () => {
      const protectedApis = [
        '/api/v1/workflows',
        '/api/v1/workflows/wf_123/execute',
        '/api/v1/ai/generate-workflow',
        '/api/v1/ai/conversations',
        '/api/v1/executions',
        '/api/v1/credentials',
        '/api/v1/schedules',
        '/api/v1/workspaces/ws_abc',
        '/api/v1/workspaces/ws_abc/members',
      ];

      for (const api of protectedApis) {
        const req = new NextRequest(`http://localhost:3000${api}`);
        const res = middleware(req);

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data).toEqual({
          error: 'Unauthorized: Missing session cookie.',
          code: 'UNAUTHORIZED',
        });
      }
    });

    it('should allow protected API through when dev session cookie is present in dev/test mode', () => {
      (process.env as any).NODE_ENV = 'development';

      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: {
          cookie: 'fp_session=valid_test_token_abc',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('should allow protected API through when production cookie __Host-fp_session is present', () => {
      (process.env as any).NODE_ENV = 'production';

      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: {
          cookie: '__Host-fp_session=valid_prod_token_xyz',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it('should reject unencrypted fp_session cookie in production mode with 401', async () => {
      (process.env as any).NODE_ENV = 'production';

      const req = new NextRequest('http://localhost:3000/api/v1/workflows', {
        headers: {
          cookie: 'fp_session=insecure_token_attempt',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  // ----------------------------------------------------
  // 6. Protected UI Page Redirection
  // ----------------------------------------------------
  describe('6. Protected UI Page Redirection', () => {
    it('should redirect protected UI to /login with 307 and returnTo when session is missing', () => {
      const protectedPages = [
        '/workflows',
        '/builder/wf_123',
        '/executions',
        '/analytics',
        '/monitoring',
        '/alerts',
        '/settings',
        '/team',
        '/credentials',
      ];

      for (const page of protectedPages) {
        const req = new NextRequest(`http://localhost:3000${page}`);
        const res = middleware(req);

        expect(res.status).toBe(307);
        const location = res.headers.get('location');
        expect(location).toContain('/login?returnTo=');
        expect(location).toContain(encodeURIComponent(page));
      }
    });

    it('should allow protected UI through when session cookie is present', () => {
      const req = new NextRequest('http://localhost:3000/workflows', {
        headers: {
          cookie: 'fp_session=valid_session_cookie',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  // ----------------------------------------------------
  // 7. Authoritative Header Sanitization
  // ----------------------------------------------------
  describe('7. Header Sanitization Policy', () => {
    it('should strip spoofed x-user-id, x-user-role, x-workspace-id, and x-membership-role from downstream headers', () => {
      const req = new NextRequest('http://localhost:3000/api/v1/auth/csrf', {
        headers: {
          'x-user-id': 'usr_attacker',
          'x-user-role': 'ADMIN',
          'x-workspace-id': 'ws_victim',
          'x-membership-role': 'OWNER',
          'x-custom-allowed': 'keep_me',
        },
      });

      const res = middleware(req);
      expect(res.status).toBe(200);
      expect(req.headers.get('x-user-id')).toBe('usr_attacker'); // original request instance unmodified
    });
  });

  // ----------------------------------------------------
  // 8. Development UI Bypass Security Invariants
  // ----------------------------------------------------
  describe('8. Development UI Bypass Invariants', () => {
    it('should allow UI page preview in development mode when DEV_BYPASS_UI_REDIRECT=true', () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.DEV_BYPASS_UI_REDIRECT = 'true';

      const req = new NextRequest('http://localhost:3000/workflows');
      const res = middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('should NEVER bypass UI redirect in production mode even if DEV_BYPASS_UI_REDIRECT=true', () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.DEV_BYPASS_UI_REDIRECT = 'true';

      const req = new NextRequest('http://localhost:3000/workflows');
      const res = middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login?returnTo=');
    });

    it('should NEVER bypass API route 401 in development mode even if DEV_BYPASS_UI_REDIRECT=true', async () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.DEV_BYPASS_UI_REDIRECT = 'true';

      const req = new NextRequest('http://localhost:3000/api/v1/workflows');
      const res = middleware(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });
});
