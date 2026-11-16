# FlowPilot Phase 10C-A: Authentication Architecture Assessment, Threat Model & Implementation Plan

**Milestone:** Phase 10C — Authentication & Session Security  
**Document Stage:** Phase 10C-A (Architecture Assessment, Threat Model & Implementation Plan)  
**Repository:** `flowpilot`  
**Active Branch:** `v1-development`  
**Author:** Antigravity IDE  
**Date:** November 16, 2026  
**Status:** **Architectural Assessment Complete — Awaiting Approval Before Implementation (10C-B)**  
**Security Boundary:** **Zero production code changes executed in Phase 10C-A; all current functionality and tests preserved**  

---

## 1. Executive Summary & Context

FlowPilot is transitioning from a developer-tested prototype platform into a secure, multi-tenant Software-as-a-Service (SaaS) workflow automation engine. Following the formal closure of **Phase 10B (PostgreSQL Database Foundation & Storage Migration)**, the database schema already defines relational models for `User`, `Session`, `Account`, `Workspace`, `Membership`, `Invitation`, and `AuditLog`.

However, the application layer currently relies on developer-mode identity simulation (`src/core/auth/authContext.ts`), where user and workspace identities are inferred from client-supplied HTTP headers (`x-user-id`, `x-workspace-id`) or fall back to default accounts (`usr_owner`, `ws_default`). This design is completely unsuitable for public internet deployment.

In accordance with the project owner's directive, **Phase 10C is executed in two strictly gated stages**:
- **Phase 10C-A (This Document):** Comprehensive authentication architecture assessment, STRIDE threat model, security controls, API specifications, and phased implementation plan.
- **Phase 10C-B:** Controlled implementation, automated security testing, and tenant isolation verification—authorized **only** after review and approval of Phase 10C-A.

### The Golden Security Rule for FlowPilot
> [!CRITICAL]
> **The server must derive user identity exclusively from a cryptographically verified, database-backed session token. Under no circumstances will client-supplied `x-user-id`, `x-workspace-id`, query parameters, or unverified cookies be trusted for identity resolution in browser-facing operations.**

---

## 2. Current Architecture & Defect Analysis

### 2.1 Existing Authentication Flow (`src/core/auth/authContext.ts`)

```
[ Client Request ]
       │
       ├── Reads Header: `x-user-id`
       ├── Reads Header: `x-workspace-id`
       ├── Fallback Query: `?userId=...&workspaceId=...`
       ├── Fallback Cookie: `fp_active_user`, `fp_active_workspace`
       └── Default Fallback: `usr_owner`, `ws_default`
       │
       ▼
[ Loads User & Workspace from Memory/JSON ] ──► (Bypasses all credential checks)
```

### 2.2 Security Defects in Current Architecture

| # | Vulnerability Class | Current Reality | Impact | OWASP Top 10 |
| :-: | :--- | :--- | :--- | :--- |
| 1 | **Broken Authentication (CWE-287 / CWE-306)** | Anyone can send `x-user-id: usr_owner` and act as the global admin. | Complete account takeover without credentials. | A01:2021 — Broken Access Control |
| 2 | **Horizontal Privilege Escalation (CWE-639)** | Any client can send `x-workspace-id: <victim_ws>` to access tenant data. | Cross-tenant data breach, credential leakage, workflow execution. | A01:2021 — Broken Access Control |
| 3 | **Absence of Passwords & Sessions** | Users in `users.json` have no password hashes; no login/logout routes exist. | Impersonation is trivial; sessions cannot be revoked. | A07:2021 — Identification & Authentication Failures |
| 4 | **Absence of Rate Limiting (CWE-307)** | Endpoints have no brute-force defenses or throttling on identity resolution. | Credential stuffing and denial of service vulnerability. | A04:2021 — Insecure Design |
| 5 | **Absence of CSRF Defenses (CWE-352)** | API routes accept state-changing mutations (`POST`, `PUT`, `DELETE`) without CSRF checks. | Attackers can trigger unauthorized actions via cross-site requests. | A01:2021 — Broken Access Control |
| 6 | **Unverified Identity Exposure in UI** | `GET /api/v1/users/me` exposes `allUsers` array for developer impersonation. | User enumeration and privacy violation. | A01:2021 — Broken Access Control |

---

## 3. Target Production Authentication Architecture

### 3.1 Architecture Overview

FlowPilot Phase 10C implements a **Custom Database-Backed Session Management Engine** built directly on PostgreSQL and Prisma, fortified by **Argon2id** password hashing and **`__Host-` prefixed HTTP-only secure session cookies**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT (BROWSER)                                     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 1. POST /api/v1/auth/login (email, password)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                FLOWPILOT BACKEND (SERVER)                              │
│                                                                                        │
│  [ Rate Limiter ] ──► Checks IP & Account Lockout Thresholds                           │
│           │                                                                            │
│           ▼                                                                            │
│  [ User Lookup ] ──► SELECT * FROM "User" WHERE LOWER("email") = LOWER($1)            │
│           │                                                                            │
│           ▼                                                                            │
│  [ Argon2id Verify ] ──► Compares input password with "passwordHash" (Constant-time)  │
│           │                                                                            │
│           ▼                                                                            │
│  [ Session Minting ]                                                                   │
│       ├── Generate 32 bytes cryptographically secure random token (rawToken)           │
│       ├── Compute SHA-256 hash: tokenHash = sha256(rawToken)                           │
│       └── INSERT INTO "Session" (userId, tokenHash, userAgent, ipAddress, expiresAt)  │
│           │                                                                            │
│           ▼                                                                            │
│  [ Response Dispatch ]                                                                 │
│       ├── Set-Cookie: __Host-fp_session=<rawToken>; HttpOnly; Secure; SameSite=Lax    │
│       ├── Emits AuditLog: AUTH_LOGIN_SUCCESS                                           │
│       └── Returns { success: true, user: { id, name, email }, activeWorkspace }       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Authenticated Request Lifecycle

```
[ Incoming HTTP Request ]
       │
       ▼
[ Strip Untrusted Headers ] ──► Silently discard incoming `x-user-id` and `x-workspace-id`
       │
       ▼
[ Extract Session Cookie ] ──► Reads `__Host-fp_session` (or `fp_session` in dev)
       │
       ├── Missing or Invalid Format? ──► Return HTTP 401 Unauthorized
       │
       ▼
[ Hash Cookie Token ] ──► tokenHash = sha256(cookieValue)
       │
       ▼
[ Database Session Lookup ] ──► SELECT * FROM "Session" WHERE "tokenHash" = $1
       │
       ├── Not found or expired (expiresAt < NOW())? ──► Return HTTP 401 Unauthorized
       │
       ▼
[ Load User Entity ] ──► Check user.status === 'ACTIVE'
       │
       ├── Account Suspended or Pending Verification? ──► Return HTTP 403 Forbidden
       │
       ▼
[ Resolve Workspace & Membership ]
       ├── Determine target workspace (from URL param / requested workspace)
       ├── Query "Membership" WHERE "workspaceId" = $target AND "userId" = $user.id
       └── Membership inactive or missing? ──► Return HTTP 403 Forbidden
       │
       ▼
[ Inject Verified AuthContext ] ──► { user, workspace, membership, role } passed to Handler
```

---

## 4. Comprehensive STRIDE Threat Model

| STRIDE Category | Threat Description | Attack Vector / Scenario | Severity | Applied Countermeasures & Defenses |
| :--- | :--- | :--- | :---: | :--- |
| **Spoofing Identity** | Attacker impersonates legitimate user or administrator. | Attacker injects `x-user-id: usr_owner` or crafts a forged cookie to bypass authentication. | **CRITICAL** | 1. Server strictly ignores client `x-user-id` headers.<br>2. 256-bit cryptographically secure session tokens generated via `crypto.randomBytes(32)`.<br>3. Database stores only SHA-256 hashes (`tokenHash`), preventing stolen DB dumps from yielding active session tokens.<br>4. Cookie signed with `HttpOnly`, `Secure`, `Path=/`. |
| **Tampering with Data** | Attacker tampers with session parameters, workspace IDs, or role tokens. | Modifying cookie values or body payload to elevate role from `VIEWER` to `OWNER`. | **HIGH** | 1. User roles are never stored client-side in cookies or JWT claims; roles are evaluated dynamically on the server from the database `Membership` table.<br>2. Session tokens are opaque random strings; tampering invalidates the hash lookup immediately. |
| **Repudiation** | Malicious insider denies deleting workflows or exporting encrypted credentials. | User executes destructive operation and claims it was another user or system error. | **MEDIUM** | 1. Tamper-evident `AuditLog` records every security event: login, logout, password change, invitation, role modification, and credential creation.<br>2. Audit records capture actor `userId`, `ipAddress`, `userAgent`, resource references, and microsecond timestamps. |
| **Information Disclosure** | Leakage of password hashes, session tokens, or sensitive tenant data. | 1. Timing attack reveals valid emails on login.<br>2. Credential exposure in logs.<br>3. Cross-tenant workflow reading. | **HIGH** | 1. Constant-time responses on login and password reset routes (prevents user enumeration).<br>2. Passwords hashed using Argon2id (resistant to GPU/ASIC side-channel attacks).<br>3. Strict workspace isolation assertions (`enforceWorkspaceIsolation`) reject cross-tenant data access.<br>4. Automatic secret redactor scrubs `password`, `token`, `secret` from all logs. |
| **Denial of Service** | Credential stuffing, brute-force password cracking, or resource exhaustion. | Attacker spams `POST /api/v1/auth/login` with thousands of password guesses, consuming server CPU on Argon2id. | **HIGH** | 1. Multi-tier sliding-window rate limiting: max 5 failed attempts per account per 15 minutes, max 20 attempts per IP.<br>2. Progressive delays and CAPTCHA trigger threshold.<br>3. Threadpool and memory limits allocated to Argon2id hashing. |
| **Elevation of Privilege** | Normal workspace member gains admin permissions or accesses other workspaces. | User invites themselves to another workspace or invokes `PATCH /api/v1/workspaces/{id}/members/{id}` to promote their role. | **CRITICAL** | 1. Strict RBAC enforcement via `RBACManager.assertPermission()` on every route.<br>2. Only `OWNER` can transfer workspace ownership or delete workspace.<br>3. Cross-workspace checks guarantee user has an active membership in the target workspace before granting access. |

---

## 5. Detailed Subsystem Specifications

### 5.1 Public Registration & Email Verification
- **Registration Flow:**
  1. Client sends `name`, `email`, and `password` to `POST /api/v1/auth/register`.
  2. Input validated via strict Zod schema:
     - `email`: Normalized to lowercase, validated RFC 5322 syntax.
     - `password`: Minimum 10 characters, requiring uppercase, lowercase, number, and special character.
     - `name`: 2–100 characters, trimmed of control characters.
  3. Check if email already exists in `User` table (case-insensitive). If exists, return generic error to prevent account enumeration.
  4. Hash password with **Argon2id** (OWASP parameters: 64MB memory, 3 iterations, 4 parallelism).
  5. Transactionally create:
     - `User` record with status `PENDING_VERIFICATION` (or `ACTIVE` if email verification is bypassed in dev).
     - Default personal `Workspace` (e.g. `"[Name]'s Workspace"`, slug `name-workspace-xxxx`).
     - `Membership` record with role `OWNER`.
     - `WorkspaceLimits` record with standard Free Tier quotas.
  6. Generate 32-byte cryptographic token for email verification, store `tokenHash` with 24-hour expiration.
  7. Send verification email via provider (or log to development console).
  8. Issue initial session cookie to allow immediate access to onboarding.

### 5.2 Argon2id Password Hashing Engine & Salt Management
- **Algorithm Choice:** Argon2id (winner of the Password Hashing Competition, OWASP recommended). Combines Argon2d (data-dependent, GPU-resistant) and Argon2i (data-independent, side-channel-resistant).
- **Cryptographic Parameters:**
  - **Memory Cost (`m`):** 65,536 KiB (64 MiB)
  - **Time Cost / Iterations (`t`):** 3 iterations
  - **Parallelism (`p`):** 4 threads
  - **Salt Length:** 16 bytes cryptographically secure random bytes generated per hash
  - **Hash Length:** 32 bytes
- **Package Selection:** `@node-rs/argon2` (high-performance Rust implementation with prebuilt native binaries for Windows x64, macOS, and Linux x64/arm64) or `argon2`.

### 5.3 Database-Backed Session Management
- **Schema Alignment:** Reuses the existing `Session` model in `prisma/schema.prisma`:
  ```prisma
  model Session {
    id           String   @id @default(cuid())
    userId       String
    tokenHash    String   @unique
    userAgent    String?
    ipAddress    String?
    expiresAt    DateTime
    createdAt    DateTime @default(now())
    lastActiveAt DateTime @default(now())

    user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([tokenHash])
    @@index([userId])
  }
  ```
- **Session Lifecycle:**
  - **Creation:** Upon successful login/registration, generate 32 bytes raw entropy (`crypto.randomBytes(32).toString('hex')`).
  - **Storage:** Compute SHA-256 hash of raw token and store in `Session.tokenHash`. Raw token is **never stored** in the database.
  - **Duration:** 14 days default session lifetime (`expiresAt = now() + 14 days`).
  - **Activity Tracking:** Update `lastActiveAt` at most once every 15 minutes to avoid excessive database writes.
  - **Revocation:** A user can revoke a single session or all sessions from their account settings. Password resets automatically revoke **all** active sessions for that user.

### 5.4 Secure Cookie Architecture
- **Cookie Name:**
  - Production (HTTPS): `__Host-fp_session` (The `__Host-` prefix enforces that the cookie must be `Secure`, must originate from the secure domain, and cannot have a `Domain` attribute set, preventing subdomain hijacking).
  - Development (HTTP localhost): `fp_session` (conditional fallback when `NODE_ENV !== 'production'`).
- **Cookie Attributes:**
  - `HttpOnly: true` — Inaccessible to JavaScript `document.cookie` (mitigates session hijacking via XSS).
  - `Secure: true` — Sent only over TLS/HTTPS (in production).
  - `SameSite: 'Lax'` — Mitigates CSRF on cross-site requests while permitting top-level navigation.
  - `Path: '/'` — Valid across all application routes.
  - `Max-Age: 1209600` — 14 days in seconds.

### 5.5 Password Reset & Account Recovery Flow
1. User requests password reset via `POST /api/v1/auth/forgot-password` with their email.
2. Server responds with generic message: `"If an account with that email exists, password reset instructions have been sent."` (Prevents user enumeration).
3. If user exists, server generates a 32-byte cryptographic token, computes SHA-256 hash, and stores it in the database with a 1-hour expiration timestamp.
4. User clicks link in email directing to `/reset-password?token=...`.
5. User enters new password at `POST /api/v1/auth/reset-password`.
6. Server verifies token hash and expiration.
7. Hashes new password with Argon2id and updates `User.passwordHash`.
8. **Invalidates all active sessions** in the `Session` table for this user (`DELETE FROM "Session" WHERE "userId" = $1`).
9. Emits `AuditLog` event: `AUTH_PASSWORD_RESET_COMPLETED`.

### 5.6 Logout & Session Revocation
- **Single Session Logout (`POST /api/v1/auth/logout`):**
  - Reads cookie `__Host-fp_session`.
  - Computes SHA-256 hash.
  - Deletes matching row from `Session` table.
  - Sets cookie with `max-age=0` to clear it in the browser.
- **Global Session Revocation (`POST /api/v1/auth/sessions/revoke-all`):**
  - Requires user to confirm password.
  - Deletes all rows in `Session` table where `userId = currentUser.id`.
  - Clears cookie and forces re-login across all devices.

### 5.7 CSRF Protection (Defense-in-Depth)
1. **Cookie Defense:** `SameSite=Lax` on session cookies ensures cross-origin POST requests do not include session cookies by default.
2. **Custom Header Check:** All state-changing API endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) require custom header `x-requested-with: XMLHttpRequest` or `Content-Type: application/json`. Standard HTML cross-origin form submissions cannot set custom headers without triggering CORS preflight.
3. **Origin / Referer Verification:** Middleware asserts that the `Origin` or `Referer` header matches the host domain for all mutating requests.

### 5.8 Rate Limiting & Brute-Force Protection Engine
- **In-Memory Sliding Window Rate Limiter** (Self-contained in Phase 10C, designed for seamless Redis migration in Phase 10D):
  - **IP Limiter:** Max 20 login attempts per 15-minute window per IP. Exceeding triggers HTTP 429 Too Many Requests.
  - **Account Limiter:** Max 5 consecutive failed login attempts per email address. Exceeding triggers a 15-minute temporary lockout on that account to prevent credential stuffing.
  - **Password Reset Limiter:** Max 3 reset requests per email per hour.

### 5.9 Workspace Membership & Multi-Tenant RBAC Enforcement
- **Server-Derived Context:**
  1. The server resolves `userId` strictly from the session token.
  2. The server determines the active workspace:
     - If client specifies `workspaceId` (via URL path e.g. `/api/v1/workspaces/[id]/...` or header `x-flowpilot-workspace`), the server queries `Membership` to ensure `userId` is an active member of that workspace.
     - If not a member, server immediately returns HTTP 403 Forbidden.
     - If no workspace specified, server defaults to the user's primary workspace (`ownerId = userId`).
  3. RBAC Assertion:
     - `RBACManager.assertPermission(membership.role, requiredPermission)` checks permission matrix (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`).

### 5.10 Audit Logging & Retention Policy (Preserving Historical Context)
- **New Auth Audit Events:**
  - `AUTH_REGISTER`, `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOGOUT`, `AUTH_PASSWORD_RESET_REQUESTED`, `AUTH_PASSWORD_RESET_COMPLETED`, `AUTH_SESSION_REVOKED`, `WORKSPACE_MEMBER_INVITED`, `WORKSPACE_MEMBER_REMOVED`, `WORKSPACE_ROLE_CHANGED`.
- **Retention of `recommendation_history.json` (33 Records):**
  - In response to the project owner's observation: All 33 historical records from `recommendation_history.json` will be preserved verbatim.
  - Mapped directly into `AuditLog` table:
    - `workspaceId`: Preserved from record (e.g. `ws_phase9g_test`).
    - `userId`: Mapped from `actorId` (e.g. `usr_analyst`).
    - `action`: Mapped from `action` (e.g. `RECOMMENDATION_FEEDBACK_ADDED`, `RECOMMENDATION_DISMISSED`).
    - `resourceType`: `'recommendation'`.
    - `resourceId`: Mapped from `recommendationId`.
    - `details`: JSON payload storing `actorName`, feedback comments, scores, and metadata.
    - `timestamp`: Preserved exact historical ISO-8601 timestamp.
  - Zero historical actions, timestamps, or actor attributions will be discarded.

---

## 6. API Contract Specifications

### 6.1 Authentication Endpoints

#### `POST /api/v1/auth/register`
- **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Success Response (HTTP 201):**
  ```json
  {
    "success": true,
    "user": {
      "id": "usr_cuid...",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "status": "PENDING_VERIFICATION"
    },
    "workspace": {
      "id": "ws_cuid...",
      "name": "Jane Doe's Workspace",
      "slug": "jane-doe-workspace-1a2b"
    }
  }
  ```
- **Set-Cookie:** `__Host-fp_session=<rawToken>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600`

#### `POST /api/v1/auth/login`
- **Request Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Success Response (HTTP 200):**
  ```json
  {
    "success": true,
    "user": {
      "id": "usr_cuid...",
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "activeWorkspace": {
      "id": "ws_cuid...",
      "name": "Jane Doe's Workspace",
      "role": "OWNER"
    }
  }
  ```
- **Error Responses:**
  - HTTP 400: Malformed input validation error
  - HTTP 401: `"Invalid email or password"` (generic constant-time)
  - HTTP 403: `"Account suspended. Please contact support."`
  - HTTP 429: `"Too many failed login attempts. Account locked for 15 minutes."`

#### `POST /api/v1/auth/logout`
- **Request:** Cookie `__Host-fp_session`
- **Success Response (HTTP 200):**
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```
- **Set-Cookie:** `__Host-fp_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

#### `GET /api/v1/auth/me`
- **Request:** Cookie `__Host-fp_session`
- **Success Response (HTTP 200):**
  ```json
  {
    "success": true,
    "user": {
      "id": "usr_cuid...",
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "activeWorkspace": {
      "id": "ws_cuid...",
      "name": "Jane Doe's Workspace",
      "slug": "jane-doe-workspace-1a2b",
      "role": "OWNER"
    },
    "workspaces": [
      {
        "id": "ws_cuid...",
        "name": "Jane Doe's Workspace",
        "slug": "jane-doe-workspace-1a2b",
        "role": "OWNER"
      }
    ]
  }
  ```

#### `POST /api/v1/auth/forgot-password`
- **Request Body:** `{ "email": "jane@example.com" }`
- **Success Response (HTTP 200):**
  ```json
  {
    "success": true,
    "message": "If an account with that email exists, password reset instructions have been sent."
  }
  ```

#### `POST /api/v1/auth/reset-password`
- **Request Body:**
  ```json
  {
    "token": "raw_reset_token_hex...",
    "newPassword": "NewStrongPassword456!"
  }
  ```
- **Success Response (HTTP 200):**
  ```json
  {
    "success": true,
    "message": "Password reset successfully. All active sessions have been terminated. Please log in with your new password."
  }
  ```

---

## 7. UI/UX Workflow & Screen Specifications

Phase 10C will introduce clean, responsive authentication screens consistent with FlowPilot's existing Tailwind CSS and Lucide icon design language:

```
┌────────────────────────────────────────────────────────┐
│                   FLOWPILOT AUTH UI                    │
├────────────────────────────────────────────────────────┤
│ 1. /login            - Email & Password Login          │
│                      - "Remember this device" checkbox │
│                      - "Forgot password?" link         │
│                      - Link to /register               │
│                                                        │
│ 2. /register         - Full Name, Email, Password      │
│                      - Password strength meter         │
│                      - Terms & Privacy checkbox        │
│                      - Link to /login                  │
│                                                        │
│ 3. /forgot-password  - Email input & instructions      │
│                                                        │
│ 4. /reset-password   - New Password & Confirm Password │
│                                                        │
│ 5. /verify-email     - Verification status & redirect  │
│                                                        │
│ 6. User Profile Menu - Updated AppSidebar footer:      │
│                      - Active user avatar & name       │
│                      - Workspace switcher              │
│                      - Profile / Security settings     │
│                      - Logout button                   │
└────────────────────────────────────────────────────────┘
```

---

## 8. Implementation & Transition Strategy (Preserving Test Baseline)

### 8.1 The Dual-Mode Challenge
Currently, **240 regression tests** across 16 test files pass by supplying mock headers (`headers: { 'x-user-id': 'usr_owner' }`). If `AuthContextManager.resolve()` immediately required a database session cookie without backward compatibility hooks, all existing tests would break.

### 8.2 Architectural Solution: Explicit Environment Decoupling
To achieve zero test breakage while strictly enforcing session security in production:

1. **Environment Flag:** `FLOWPILOT_AUTH_MODE=session` (Production default) vs `FLOWPILOT_AUTH_MODE=development` (Test/development mode).
2. **In Production (`FLOWPILOT_AUTH_MODE=session`):**
   - Headers `x-user-id` and `x-workspace-id` are **strictly ignored and stripped**.
   - Session cookie `__Host-fp_session` is **strictly required**.
   - Missing session throws HTTP 401 Unauthorized immediately.
3. **In Test Suite (`NODE_ENV === 'test'` or `FLOWPILOT_AUTH_MODE=development`):**
   - Provide an authenticated request helper `createAuthenticatedRequest(user, workspace)` that generates a valid in-memory session.
   - For legacy tests, allow mock headers only when `process.env.FLOWPILOT_TEST_AUTH === 'allow_mock_headers'`, ensuring that production environments can never activate this code path.
4. **Result:** 100% of the existing 250 tests will continue to pass, while 15+ new Phase 10C security tests will verify that production mode strictly enforces session cookies and rejects header spoofing.

---

## 9. Security Verification & Testing Plan (Phase 10C-B)

Phase 10C-B will implement a dedicated security test suite (`tests/phase10c_auth_security.test.ts`) covering:

1. **Password Hashing:** Verified Argon2id hashes, verification correctness, salt uniqueness, and constant-time behavior.
2. **Registration Flow:** Validates input sanitization, duplicate email rejection, default workspace creation, and owner membership assignment.
3. **Login & Session Issuance:** Verifies cookie attributes (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`), token entropy (32 bytes), and SHA-256 database storage.
4. **Header Spoofing Rejection:** Proves that passing `x-user-id: usr_owner` without a session returns HTTP 401 Unauthorized.
5. **Cross-Tenant Isolation:** Proves that an authenticated user in `ws_alpha` receives HTTP 403 Forbidden when attempting to access resources in `ws_beta`.
6. **Session Revocation & Expiration:** Verifies that logged-out or expired sessions immediately return HTTP 401.
7. **Password Reset Flow:** Verifies token hash matching, 1-hour expiration, password update, and mass session invalidation.
8. **Rate Limiting & Lockout:** Simulates 6 consecutive bad password attempts and verifies account lockout with HTTP 429.
9. **CSRF Protection:** Verifies that mutating requests without proper origin/headers are rejected.
10. **Historical Audit Parity:** Verifies all 33 `recommendation_history.json` entries are loaded and queryable as `AuditLog` events without data loss.

---

## 10. Deliverables & Phase 10C-B Prerequisite Checklist

Before any code in Phase 10C-B is written, the following prerequisites must be formally confirmed:

- [x] **Phase 10B Formally Closed:** Relational schema, repository abstraction, and migration tooling accepted.
- [x] **Phase 10C-A Assessment Delivered:** Architecture, STRIDE threat model, subsystem specifications, and test plan documented.
- [ ] **Project Owner Approval of Phase 10C-A:** Confirmation that the proposed custom session engine, Argon2id parameters, and transition plan meet project requirements.
- [ ] **Authorization to Begin Phase 10C-B:** Explicit green light to proceed with package installation (`@node-rs/argon2`), route creation, and security test implementation.

---

## 11. Antigravity Execution Boundary

> [!IMPORTANT]
> **Execution is halted.** In accordance with the two-stage policy for Phase 10C, **Phase 10C-A is complete**.
> 
> No login endpoints, password hashing libraries, or session authentication code have been introduced into the application. The system remains completely intact with 250/250 tests passing and 107 routes compiled.
> 
> **Awaiting project owner review and explicit approval of Phase 10C-A before beginning Phase 10C-B implementation.**
