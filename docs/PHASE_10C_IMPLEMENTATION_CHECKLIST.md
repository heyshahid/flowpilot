# FlowPilot Phase 10C: Implementation Checklist & Execution Roadmap

**Milestone:** Phase 10C — Authentication & Session Security  
**Document:** Phase 10C-B Implementation Checklist & Execution Roadmap  
**Repository:** `flowpilot`  
**Active Branch:** `v1-development`  
**Date:** November 16, 2026  
**Status:** **Checklist Prepared — Awaiting Authorization Before Execution (Phase 10C-B)**  
**Execution Boundary:** **Zero production code changes executed in this turn**  

---

## 1. Prerequisites & Gating Checklist

Before Phase 10C-B implementation begins, ensure the following gates are cleared:

- [x] **Phase 10B Formally Closed:** PostgreSQL foundation, repository layer, and migration utilities accepted.
- [x] **Phase 10C-A Assessment Accepted:** Architecture specification and STRIDE threat model reviewed.
- [ ] **Project Owner Approval of Corrected Architecture:** Explicit authorization to begin Phase 10C-B.
- [ ] **Execution Environment Verified:** Local Node.js v24.22.1 runner confirmed clean; target deployment Node 20 LTS.
- [ ] **Backup Snapshot Created:** Pre-implementation snapshot of `.data/` and codebase established.

---

## 2. Phase 10C-B Step-by-Step Implementation Roadmap

### Step 1: Package Installation & Environment Configuration
- [ ] Install `@node-rs/argon2` (high-performance Rust Argon2id bindings).
- [ ] Configure environment variables in `.env.example` and `.env.local`:
  - `FLOWPILOT_AUTH_MODE=session` (default)
  - `ALLOWED_ORIGINS=http://localhost:3000,https://app.flowpilot.dev`
  - `TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128`
  - `SESSION_SECRET` (256-bit encryption key for CSRF tokens)

### Step 2: Database Schema Migration (`AuthToken` Model)
- [ ] Update `prisma/schema.prisma` with proposed `AuthToken` model (`EMAIL_VERIFICATION`, `PASSWORD_RESET`).
- [ ] Run `npx prisma migrate diff` to generate SQL DDL migration `prisma/migrations/1_auth_tokens/migration.sql`.
- [ ] Regenerate Prisma Client (`npx prisma generate`).

### Step 3: Cryptography & Security Utilities (`src/lib/security/`)
- [ ] Create `src/lib/security/argon2.ts`:
  - Configure OWASP parameters (`m=65536`, `t=3`, `p=4`).
  - Precompute `DUMMY_HASH` for timing normalization on non-existent accounts.
  - Implement hashing semaphore limiting concurrent hashes to 4 parallel jobs.
- [ ] Create `src/lib/security/tokens.ts`:
  - `generateSecureToken(bytes = 32)`: Returns 256-bit hex token.
  - `hashToken(rawToken: string)`: Computes SHA-256 hash.
  - `timingSafeEqual(a: string, b: string)`: Constant-time string comparison.
- [ ] Create `src/lib/security/csrf.ts`:
  - Mint encrypted CSRF cookie token.
  - Validate custom header `x-csrf-token` against active session.
  - Validate `Origin` and `Referer` against trusted allowlist.

### Step 4: Rate Limiting Subsystem (`src/lib/security/rateLimiter.ts`)
- [ ] Implement `SlidingWindowRateLimiter`:
  - Per-IP rate limiter (20 attempts / 15 min).
  - Progressive throttling backoff (1s, 2s, 4s delay).
  - Account protection trigger (5 consecutive failed attempts challenges requesting IP, dispatches security notice email).
  - Define interface `DistributedRateLimiter` for seamless Redis upgrade in Phase 10D.

### Step 5: Session Management Engine (`src/lib/storage/postgres/sessionRepository.ts`)
- [ ] Implement session CRUD:
  - `createSession(userId, userAgent, ipAddress, ttlDays = 14)`: Generates raw token, stores SHA-256 hash.
  - `validateSession(rawToken)`: Hashes token, checks expiration (`expiresAt > NOW()`), updates `lastActiveAt`.
  - `rotateSession(oldRawToken)`: Atomically invalidates old token and mints fresh token.
  - `revokeSession(rawToken)`: Deletes single session from database.
  - `revokeAllUserSessions(userId)`: Deletes all sessions for user.
- [ ] Cookie helper (`src/lib/security/cookies.ts`):
  - Serialize `__Host-fp_session` with `HttpOnly; Secure; SameSite=Lax; Path=/`.
  - Fallback to `fp_session` when `process.env.NODE_ENV !== 'production'`.

### Step 6: Hardening `AuthContextManager` (`src/core/auth/authContext.ts`)
- [ ] Implement strict server-derived identity resolution:
  - Hardcode check: `if (process.env.NODE_ENV === 'production')` -> strictly strip and reject `x-user-id` and `x-workspace-id`.
  - Validate session cookie against `Session` table.
  - Check `User.status`:
    - If `PENDING_VERIFICATION`: Grant restricted session scope (verification endpoints only; reject workspace mutations with `HTTP 403 EMAIL_VERIFICATION_REQUIRED`).
    - If `SUSPENDED`: Reject with `HTTP 403 Forbidden`.
    - If `ACTIVE`: Full access.
  - Resolve active workspace:
    - Target workspace identified from URL path or `x-flowpilot-workspace` header.
    - Query `Membership` table for `(workspaceId, userId)`.
    - Assert `membership.status === 'active'` and `workspace.isArchived === false`.
    - Enforce permissions via `RBACManager.assertPermission()`.

### Step 7: Email Provider Adapter (`src/lib/email/`)
- [ ] Define `EmailAdapter` interface.
- [ ] Implement `DevelopmentEmailAdapter`: Logs masked email and verification URLs to debug logger without exposing raw secrets in stdout.
- [ ] Implement production adapter scaffolding (Resend / AWS SES).

### Step 8: Authentication API Routes (`src/app/api/v1/auth/`)
- [ ] `POST /api/v1/auth/register`: Zod validation, password hashing, user & workspace creation, verification token issuance, restricted session cookie.
- [ ] `POST /api/v1/auth/login`: Rate-limiting check, user lookup, dummy hash fallback, Argon2id verification, session minting, cookie dispatch.
- [ ] `POST /api/v1/auth/logout`: Single-session deletion, cookie clear.
- [ ] `GET /api/v1/auth/me`: Returns verified user profile, active workspace, memberships, and verification status.
- [ ] `POST /api/v1/auth/verify-email`: Validates token hash, marks token used, updates user status to `ACTIVE`, rotates session token.
- [ ] `POST /api/v1/auth/resend-verification`: Rate-limited resend of verification email.
- [ ] `POST /api/v1/auth/forgot-password`: Constant-time response, 1-hour reset token issuance.
- [ ] `POST /api/v1/auth/reset-password`: Validates reset token, updates password hash, revokes all active sessions for user.
- [ ] `POST /api/v1/auth/sessions/revoke-all`: Mass session revocation across all devices.

### Step 9: Historical Audit Preservation (`recommendation_history.json`)
- [ ] Update migration utility to import all 33 records from `recommendation_history.json` into `AuditLog` (`resourceType = 'recommendation'`), preserving exact historical timestamps, actor IDs, actions, and details.

### Step 10: User Interface Integration
- [ ] Create `/login` page with email & password form, error states, and rate-limit backoff countdown.
- [ ] Create `/register` page with name, email, password strength meter, and terms agreement.
- [ ] Create `/verify-email` page displaying verification status or resend button.
- [ ] Create `/forgot-password` and `/reset-password` pages.
- [ ] Update `AppSidebar.tsx` footer: Replace hardcoded profile with dynamic session user data, workspace switcher, and logout trigger.

### Step 11: Security Verification & Automated Testing (`tests/phase10c_auth_security.test.ts`)
- [ ] Test 1: Argon2id password hashing and verification accuracy.
- [ ] Test 2: Dummy hash timing normalization on non-existent accounts.
- [ ] Test 3: Public user registration and default workspace provisioning.
- [ ] Test 4: Restricted verification session enforcement (blocks workflow routes, allows verify routes).
- [ ] Test 5: Email verification token lifecycle (valid, expired, already-used, rate-limited resend).
- [ ] Test 6: Login and secure session cookie issuance (`HttpOnly`, `Secure`, `SameSite=Lax`).
- [ ] Test 7: Rejection of forged/spoofed `x-user-id` headers in production mode.
- [ ] Test 8: Cross-workspace tenant isolation (proves User A cannot access Workspace B).
- [ ] Test 9: Password reset flow and mass session revocation.
- [ ] Test 10: Brute-force rate limiting and progressive throttling backoff.
- [ ] Test 11: CSRF origin and token validation on mutating requests.
- [ ] Test 12: Historical recommendation audit log retention verification.

### Step 12: Regression & Production Build Audit
- [ ] Execute `npm test` to verify all 250 existing tests pass + 12 new Phase 10C tests pass (262+ tests total).
- [ ] Execute `npx tsc --noEmit` to verify type safety.
- [ ] Execute `npm run build` to verify clean production build across 107+ routes.
