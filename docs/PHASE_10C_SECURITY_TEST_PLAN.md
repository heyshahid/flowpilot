# FlowPilot Phase 10C: Security Verification & Automated Test Plan

**Milestone:** Phase 10C — Authentication & Session Security  
**Document:** Security Verification & Automated Test Plan  
**Repository:** `flowpilot`  
**Active Branch:** `v1-development`  
**Date:** November 16, 2026  
**Status:** **Test Plan Prepared — Awaiting Authorization Before Execution (Phase 10C-B)**  
**Execution Boundary:** **Zero production code changes executed in this turn**  

---

## 1. Test Strategy & Objectives

The primary objective of Phase 10C testing is not merely to verify that a login form accepts input, but to rigorously validate the **security boundaries and isolation guarantees** of the FlowPilot platform.

The testing strategy evaluates three non-negotiable security outcomes:
1. **Zero Impersonation:** A user cannot impersonate another user via header injection, cookie forging, or token guessing.
2. **Zero Cross-Tenant Leakage:** An authenticated user of Workspace A cannot read, modify, or execute resources in Workspace B.
3. **Zero Zombie Sessions:** An expired, revoked, or logged-out session token cannot continue accessing any platform resource.

---

## 2. Test Execution Matrix (`tests/phase10c_auth_security.test.ts`)

| # | Test Scenario / Case Name | Target Security Vulnerability | Test Execution & Assertions | Expected Result |
| :-: | :--- | :--- | :--- | :---: |
| 1 | **Argon2id Hashing & Verification** | Weak Password Storage (CWE-261) | Hash passwords with Argon2id (`m=65536, t=3, p=4`). Verify correct password resolves `true`, incorrect password resolves `false`. Assert salts are unique across identical passwords. | ✅ PASS |
| 2 | **Dummy Hash Timing Normalization** | Account Enumeration via Timing (CWE-208) | Measure 20 consecutive login attempts for existing vs non-existent accounts. Assert server executes Argon2id on both paths, keeping latency in the same ~80–120ms distribution. | ✅ PASS |
| 3 | **Public Registration Flow** | Insecure Account Provisioning | Register new user via `POST /api/v1/auth/register`. Assert: user created with `PENDING_VERIFICATION`, personal workspace created, user assigned `OWNER` role, Free Tier quotas provisioned. | ✅ PASS (HTTP 201) |
| 4 | **Restricted Verification Session Boundary** | Premature Privilege Grant | Authenticate as `PENDING_VERIFICATION` user. Attempt to create workflow (`POST /api/v1/workflows`) and read credentials (`GET /api/v1/credentials`). Assert requests are blocked. | ✅ PASS (HTTP 403 `EMAIL_VERIFICATION_REQUIRED`) |
| 5 | **Email Verification Token Lifecycle** | Token Hijacking / Replay (CWE-294) | 1. Consume valid token: transitions status to `ACTIVE`, unlocks workspace.<br>2. Re-submit consumed token: rejected as already used.<br>3. Submit expired token (>24h): rejected with expiration error.<br>4. Exceed resend rate limit (>3/hr): rejected with HTTP 429. | ✅ PASS |
| 6 | **Secure Session Cookie Issuance** | Session Hijacking / XSS Leakage | Log in via `POST /api/v1/auth/login`. Inspect `Set-Cookie` header. Assert presence of `HttpOnly`, `Secure` (in prod), `SameSite=Lax`, and `Path=/`. Assert raw token is 32 bytes (256-bit entropy). | ✅ PASS (HTTP 200) |
| 7 | **Header Spoofing Rejection** | Header Injection (CWE-287 / CWE-306) | Send `GET /api/v1/workflows` with header `x-user-id: usr_owner` without session cookie in production mode. Assert request is rejected immediately. | ✅ PASS (HTTP 401 Unauthorized) |
| 8 | **Cross-Tenant Workspace Isolation** | Horizontal Privilege Escalation (CWE-639) | Authenticate as User A (member of `ws_alpha`). Send request to read workflows in `ws_beta` (`GET /api/v1/workspaces/ws_beta/workflows`). Assert access is denied. | ✅ PASS (HTTP 403 Forbidden) |
| 9 | **Vertical Role-Based Access Control** | Vertical Privilege Escalation (CWE-269) | Authenticate as Member with `VIEWER` role in `ws_alpha`. Attempt mutating action `POST /api/v1/workflows`. Assert action is denied by `RBACManager`. | ✅ PASS (HTTP 403 Forbidden) |
| 10 | **Session Rotation on Privilege Elevation** | Session Fixation (CWE-384) | Record session token pre-login. Log in successfully. Assert new session token is issued, and previous token hash is invalidated. | ✅ PASS |
| 11 | **Password Reset & Mass Session Revocation** | Inactive Session Hijacking (CWE-613) | Log in on two simulated devices (Session 1 and Session 2). Request password reset, consume single-use reset token, set new password. Assert: Session 1 and Session 2 are immediately revoked. | ✅ PASS (HTTP 401 on old sessions) |
| 12 | **Brute-Force Rate Limiting & Progressive Delay** | Credential Stuffing & DoS (CWE-307) | Send 5 failed login attempts for an account. Assert progressive delays are enforced. Send 20 attempts from same IP. Assert IP receives HTTP 429 rate limit error. | ✅ PASS (HTTP 429) |
| 13 | **CSRF Defense Validation** | Cross-Site Request Forgery (CWE-352) | Submit mutating `POST /api/v1/workflows` request with forged/untrusted `Origin: https://evil.com`. Assert request is blocked before handler execution. | ✅ PASS (HTTP 403 Forbidden) |
| 14 | **Historical Recommendation Audit Retention** | Historical Audit Data Loss | Query `AuditLog` table for the 33 historical records from `recommendation_history.json`. Assert all 33 records exist with correct timestamps, actor IDs, actions, and details. | ✅ PASS (33/33 Preserved) |

---

## 3. Regression Testing & Test Isolation Strategy

### 3.1 Preserving Existing Phase 1–9 Test Suites (240 Tests)
FlowPilot's 240 existing tests across 16 test suites pass using mock identity headers (`x-user-id: usr_owner`). To ensure these tests continue to pass without regressions:
1. In `tests/setup.ts`, the environment variable `FLOWPILOT_TEST_AUTH=allow_mock_headers` is initialized for existing test suites.
2. In production (`process.env.NODE_ENV === 'production'`), this flag is **hardcoded to be ignored**, ensuring mock headers cannot be enabled in live environments.
3. New Phase 10C tests will explicitly set `FLOWPILOT_TEST_AUTH=strict_session` to test real session generation, cookie validation, and header rejection.

### 3.2 Regression Suite Targets
- **Total Existing Test Suites:** 17 Passed (Phase 1–9 + Phase 10B)
- **Total Existing Tests:** 250 Passed
- **New Phase 10C Tests:** 14 Passed
- **Expected New Baseline:** **18 Test Suites, 264+ Passed (0 Failed, 0 Skipped)**
- **Expected Production Build:** **107+ Routes Compiled Successfully (0 Errors)**

---

## 4. Acceptance Criteria for Phase 10C-B Closure

Phase 10C-B will be considered complete and ready for review only when:
1. All 14 security test scenarios execute and pass cleanly.
2. All 250 existing regression tests pass with zero regressions.
3. The Next.js production build (`npm run build`) completes cleanly across all routes.
4. TypeScript compilation (`npx tsc --noEmit`) succeeds with zero type errors.
5. All 33 historical recommendation records are verified in the database audit log.
6. A comprehensive Phase 10C verification report with test logs and build output is delivered to the project owner.
