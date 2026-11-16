# FlowPilot Phase 10C: Implementation Checklist & Controlled Execution Roadmap

**Milestone:** Phase 10C — Authentication & Session Security  
**Document:** Phase 10C-B Sub-Phased Implementation Checklist & Roadmap (Reconciled & Hardened)  
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
- [x] **Final Pre-Implementation Corrections Applied:**
  - Test count reconciled (exactly 14 security test scenarios).
  - Rate-limit policy unified (10/min normal, 11-20 progressive backoff, >20/15min hard block).
  - Dual session expiration (14-day absolute + 2-hour idle) specified in `validateSession()`.
  - CSRF terminology corrected to "signed HMAC-SHA256" with automatic rolling renewal.
  - Decoupled B1 rate limiter alert callback from B3 email adapter.
  - Re-login requirement enforced after password reset (no auto-session issuance).
  - Idempotent audit migration specified for the 33 historical recommendation records.
  - Relative timing test assertions established (non-brittle CI execution).
- [ ] **Project Owner Authorization to Begin 10C-B1:** Explicit approval to start Sub-Phase 10C-B1 only.
- [ ] **Execution Environment Verified:** Local Node.js v24.22.1 runner confirmed clean; target deployment Node 20 LTS.
- [ ] **Backup Snapshot Created:** Pre-implementation snapshot of `.data/` and codebase established.

---

## 2. Controlled Sub-Phase Execution Roadmap (6 Sub-Phases)

In accordance with the project owner's execution strategy, Phase 10C-B is divided into **six sequential sub-phases**. Each sub-phase concludes with an audit report and requires explicit approval before the next sub-phase begins.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      PHASE 10C-B EXECUTION PHASES                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Phase 10C-B1: Security Foundation                                   │
│    - Argon2id, token utilities, signed CSRF, rate limiter, env config │
│    - Review & Approval Gate ──►                                        │
│                                                                        │
│ 2. Phase 10C-B2: Database & Session Engine                             │
│    - AuthToken schema, session repository, cookies, expiry & rotation │
│    - Review & Approval Gate ──►                                        │
│                                                                        │
│ 3. Phase 10C-B3: Authentication Backend                                │
│    - Register, login, verify email, reset password, logout, API routes │
│    - Connect EmailAdapter to B1 alert callback                        │
│    - Review & Approval Gate ──►                                        │
│                                                                        │
│ 4. Phase 10C-B4: Workspace Security & Audit                            │
│    - AuthContextManager hardening, membership checks, RBAC, audit      │
│    - Review & Approval Gate ──►                                        │
│                                                                        │
│ 5. Phase 10C-B5: Frontend Integration                                  │
│    - Login, register, verify, reset screens, dynamic sidebar profile   │
│    - Review & Approval Gate ──►                                        │
│                                                                        │
│ 6. Phase 10C-B6: Security Testing & Regression                         │
│    - 14 security test scenarios, 250 regression tests, build audit     │
│    - Final Phase 10C Closure ──►                                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Sub-Phase 10C-B1: Security Foundation
- [ ] **Dependencies:** Install `@node-rs/argon2` (high-performance Rust bindings for Argon2id).
- [ ] **Environment Configuration:**
  - `FLOWPILOT_AUTH_MODE=session` (default)
  - `ALLOWED_ORIGINS=http://localhost:3000,https://app.flowpilot.dev`
  - `TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128`
  - `SESSION_SECRET` (256-bit secret, minimum 32 bytes)
  - `SESSION_SECRET_PREVIOUS` (optional secondary key for zero-downtime rotation)
- [ ] **Argon2id Utility (`src/lib/security/argon2.ts`):**
  - Configure OWASP parameters (`m=65536`, `t=3`, `p=4`).
  - Precompute static `DUMMY_HASH` for timing normalization on non-existent accounts.
  - Implement hashing semaphore limiting concurrent hashes to 4 parallel jobs per process.
- [ ] **Cryptographic Token Utilities (`src/lib/security/tokens.ts`):**
  - `generateSecureToken(bytes = 32)`: Generates 256-bit cryptographic entropy.
  - `hashToken(rawToken: string)`: Computes SHA-256 hash.
  - `timingSafeEqual(a: string, b: string)`: Constant-time comparison.
- [ ] **CSRF Protection Engine (`src/lib/security/csrf.ts`):**
  - Mint cryptographically signed HMAC-SHA256 CSRF token combining `sessionId + timestamp + nonce`.
  - Validate custom header `x-csrf-token` against active session with 24-hour timestamp freshness.
  - Implement rolling renewal: Automatically refresh CSRF cookie on authenticated `GET` requests if existing token is older than 12 hours.
  - Dual-secret rotation support (`SESSION_SECRET` and `SESSION_SECRET_PREVIOUS`).
  - Validate `Origin` and `Referer` against `ALLOWED_ORIGINS`.
- [ ] **Rate Limiting Engine (`src/lib/security/rateLimiter.ts`):**
  - Implement unified sliding-window limiter:
    - Normal: up to 10 attempts / 1 min.
    - Progressive delay: 11–20 attempts / 15 min (1s, 2s, 4s backoff).
    - Hard block: >20 attempts / 15 min returns `HTTP 429`.
    - Per-Account protection: 5 consecutive failed attempts challenges requesting IP and invokes security alert callback.
  - **Decoupled Architecture:** Rate limiter has **zero dependencies on an email library**. Emits security events via abstract callback `onSecurityAlert(callback)`.
  - Trusted reverse-proxy IP resolution via `TRUSTED_PROXY_CIDRS`.
- [ ] **Sub-Phase 10C-B1 Review:** Submit foundation report and halt for review.

---

### Sub-Phase 10C-B2: Database & Session Engine
- [ ] **Database Schema Update:**
  - Update `prisma/schema.prisma` with proposed `AuthToken` model (`EMAIL_VERIFICATION`, `PASSWORD_RESET`).
  - Generate migration `prisma/migrations/1_auth_tokens/migration.sql` via `prisma migrate diff`.
  - Regenerate Prisma Client (`npx prisma generate`).
- [ ] **Session Repository (`src/lib/storage/postgres/sessionRepository.ts`):**
  - `createSession(userId, userAgent, ipAddress, ttlDays = 14)`: Generates raw token, writes SHA-256 hash.
  - `validateSession(rawToken)`: Enforces **both** `expiresAt > NOW()` (14-day absolute lifetime) **and** `NOW() - lastActiveAt <= 2 hours` (2-hour idle timeout). Touches `lastActiveAt` at most once every 15 minutes.
  - `rotateSession(oldRawToken)`: Atomically invalidates old token and mints fresh token.
  - `revokeSession(rawToken)`: Deletes single session from database.
  - `revokeAllUserSessions(userId)`: Deletes all sessions for user.
- [ ] **Cookie Helper (`src/lib/security/cookies.ts`):**
  - Production HTTPS: `__Host-fp_session` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600`).
  - Development HTTP: `fp_session` fallback on localhost.
- [ ] **Sub-Phase 10C-B2 Review:** Submit database & session engine report and halt for review.

---

### Sub-Phase 10C-B3: Authentication Backend Routes
- [ ] **Email Provider Adapter (`src/lib/email/`):**
  - Interface `EmailAdapter`: `sendVerificationEmail`, `sendPasswordResetEmail`, `sendSecurityAlert`.
  - `DevelopmentEmailAdapter`: Logs masked recipient and verification link to debug logger; stores last token in memory fixture for tests. Zero raw secrets in production logs.
  - **Connect to Rate Limiter:** Register `EmailAdapter.sendSecurityAlert` with the B1 rate limiter callback.
- [ ] **Registration Route (`POST /api/v1/auth/register`):**
  - Input validation via Zod, Argon2id password hash, user created with `status: PENDING_VERIFICATION`.
  - Default workspace provisioned, user added as `OWNER`.
  - Verification token hash stored in `AuthToken` with 24h expiration.
  - Restricted verification session cookie issued.
- [ ] **Login Route (`POST /api/v1/auth/login`):**
  - Rate-limit check, user lookup, dummy hash fallback on missing account, Argon2id verification.
  - Rotates session token, sets `__Host-fp_session` cookie, emits `AUTH_LOGIN_SUCCESS` audit event.
- [ ] **CSRF Token Route (`GET /api/v1/auth/csrf`):**
  - Returns current signed CSRF token and sets fresh `fp_csrf_token` cookie for single-page applications.
- [ ] **Email Verification Route (`POST /api/v1/auth/verify-email`):**
  - Validates token hash, marks token used atomically (`usedAt = NOW()`).
  - Transitions `User.status` to `ACTIVE`, sets `emailVerifiedAt = NOW()`, rotates session token.
- [ ] **Resend Verification Route (`POST /api/v1/auth/resend-verification`):**
  - Rate-limited to max 3 resends per hour per email.
- [ ] **Password Reset Routes (`POST /api/v1/auth/forgot-password` & `POST /api/v1/auth/reset-password`):**
  - Forgot password returns constant-time generic response.
  - Reset password validates single-use token, updates password hash, **revokes all active sessions**, and clears session cookies.
  - **User is required to explicitly log in again with new password (no auto-session issuance).**
- [ ] **Logout Route (`POST /api/v1/auth/logout`):**
  - Deletes active session row and clears cookie (`max-age=0`).
- [ ] **Sub-Phase 10C-B3 Review:** Submit backend routes report and halt for review.

---

### Sub-Phase 10C-B4: Workspace Security & Audit Hardening
- [ ] **Harden `AuthContextManager` (`src/core/auth/authContext.ts`):**
  - Hardcode production check: `if (process.env.NODE_ENV === 'production')` -> strictly strip and reject `x-user-id` and `x-workspace-id`.
  - Validate session cookie and enforce 2-hour idle timeout.
  - Check `User.status`:
    - `PENDING_VERIFICATION`: Grant restricted session scope (verification endpoints only; reject workspace mutations with `HTTP 403 EMAIL_VERIFICATION_REQUIRED`).
    - `SUSPENDED`: Reject with `HTTP 403 Forbidden`.
    - `ACTIVE`: Full access.
  - Workspace resolution: Target workspace from URL path or `x-flowpilot-workspace` validated against `Membership` table.
  - Permission assertion: Enforce `RBACManager.assertPermission()` across all workspace routes.
- [ ] **Audit Logging Integrity:**
  - Enforce append-only permissions and trigger immutability.
  - Implement **idempotent import** of the 33 historical records from `recommendation_history.json` into `AuditLog` using `WHERE id = hist_...` to guarantee zero duplication on re-runs.
- [ ] **Sub-Phase 10C-B4 Review:** Submit workspace & audit hardening report and halt for review.

---

### Sub-Phase 10C-B5: Frontend Integration
- [ ] Create `/login` page with email & password form, error states, and progressive backoff countdown.
- [ ] Create `/register` page with name, email, password strength meter, and terms agreement.
- [ ] Create `/verify-email` page displaying verification status or resend button.
- [ ] Create `/forgot-password` and `/reset-password` pages.
- [ ] Update `AppSidebar.tsx` footer: Replace hardcoded profile with dynamic session user data, workspace switcher, and logout trigger.
- [ ] **Sub-Phase 10C-B5 Review:** Submit frontend integration report and halt for review.

---

### Sub-Phase 10C-B6: Security Testing & Regression Audit
- [ ] Implement all **14 security test scenarios** in `tests/phase10c_auth_security.test.ts`:
  1. Argon2id password hashing and verification accuracy.
  2. Dummy hash path execution and relative timing verification.
  3. Public user registration and default workspace provisioning.
  4. Restricted verification session enforcement (`EMAIL_VERIFICATION_REQUIRED`).
  5. Email verification token lifecycle (valid, expired, already-used, rate-limited resend).
  6. Login and secure session cookie issuance (`HttpOnly`, `Secure`, `SameSite=Lax`).
  7. Rejection of forged/spoofed `x-user-id` headers in production mode.
  8. Cross-workspace tenant isolation (proves User A cannot access Workspace B).
  9. Vertical RBAC enforcement (Viewers cannot mutate workflows).
  10. Session rotation on privilege elevation.
  11. Password reset, mass session revocation, and re-login enforcement.
  12. Brute-force rate limiting and progressive throttling backoff.
  13. CSRF origin and signed token validation on mutating requests.
  14. Idempotent historical recommendation audit log retention verification.
- [ ] Execute `npm test` to verify **264/264 tests pass across 18 test suites** (250 existing regression + 14 new Phase 10C security tests).
- [ ] Execute `npx tsc --noEmit` to verify type safety.
- [ ] Execute `npm run build` to verify clean production build across 107+ routes.
- [ ] **Phase 10C Final Closure:** Submit final verification report and halt for approval.
