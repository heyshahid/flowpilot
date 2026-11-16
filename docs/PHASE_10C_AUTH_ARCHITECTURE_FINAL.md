# FlowPilot Phase 10C: Final Authentication Architecture Specification

**Milestone:** Phase 10C — Authentication & Session Security  
**Document:** Final Authentication Architecture Specification (Reconciled & Hardened)  
**Repository:** `flowpilot`  
**Active Branch:** `v1-development`  
**Date:** November 16, 2026  
**Status:** **Architectural Corrections Applied — Ready for Sub-Phased Execution**  
**Boundary Statement:** **Zero production code changes executed; all existing functionality, 250 tests, and 107 routes preserved**  

---

## 1. Architectural Foundation & Core Security Invariant

FlowPilot is transitioning from a simulated developer identity prototype into a multi-tenant, production-grade Software-as-a-Service (SaaS) workflow platform.

### The Golden Security Rule
> [!CRITICAL]
> **The server must establish user identity exclusively from a cryptographically verified, database-backed session token. Client-supplied identity headers (`x-user-id`, `x-workspace-id`), query parameters, or unverified client cookies are strictly stripped and rejected for browser-facing operations.**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 AUTHENTICATED REQUEST PIPELINE                         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
[ 1. Strip Client Headers ] ──► Silently discard incoming `x-user-id` and `x-workspace-id`
                                            │
                                            ▼
[ 2. Validate Origin & CSRF ] ──► Verify Origin against trusted allowlist & validate CSRF token
                                            │
                                            ▼
[ 3. Extract Session Cookie ] ──► Read `__Host-fp_session` (HTTPS) or `fp_session` (dev)
                                            │
                                            ▼
[ 4. Hash Token & DB Lookup ] ──► Compute SHA-256; query `Session` table
                                            │
                                            ├── Check 1: `expiresAt > NOW()` (14-day absolute lifetime)
                                            └── Check 2: `NOW() - lastActiveAt <= 2 hours` (2-hour idle timeout)
                                            │
                                            ▼
[ 5. Check User & Session State ]
       ├── If user.status === 'PENDING_VERIFICATION' ──► Restricted Session (Onboarding/Verify ONLY)
       ├── If user.status === 'SUSPENDED'            ──► Reject HTTP 403 Forbidden
       └── If user.status === 'ACTIVE'               ──► Full SaaS Operations
                                            │
                                            ▼
[ 6. Workspace & RBAC Assertion ]
       ├── Read target workspace from URL path or `x-flowpilot-workspace`
       ├── Query database `Membership` where `userId = session.userId` AND `workspaceId = target`
       ├── Verify `membership.status === 'active'` AND `workspace.isArchived === false`
       └── Assert `RBACManager.assertPermission(membership.role, requiredPermission)`
```

---

## 2. Registration, Email Verification & Restricted Verification Sessions

### 2.1 The Registration/Verification Conflict Resolution
The previous draft contained an architectural contradiction: new users were created with `PENDING_VERIFICATION` status, while the general authentication middleware rejected any user whose status was not `ACTIVE`.

**Corrected Architecture: Two-Tier Session Capability Model**

1. **Restricted Verification Session:**
   - When a user registers (`POST /api/v1/auth/register`), a session is minted with restricted scope.
   - The user's status is set to `PENDING_VERIFICATION`.
   - The server authorizes this session **exclusively** for verification and initial setup endpoints:
     - `GET /api/v1/auth/me` (returns user profile with `isPendingVerification: true`)
     - `POST /api/v1/auth/verify-email`
     - `POST /api/v1/auth/resend-verification`
     - `POST /api/v1/auth/logout`
   - **Zero Access to Core Operations:** Any attempt by a restricted session to access workflows, credentials, webhooks, executions, AI assistance, or integrations is intercepted by `AuthContextManager` and rejected with:
     ```json
     {
       "success": false,
       "error": "Email verification required. Please verify your email address to access workspace resources.",
       "code": "EMAIL_VERIFICATION_REQUIRED"
     }
     ```
     *(HTTP 403 Forbidden)*

2. **Full Active Session:**
   - Once the user verifies their email via token link, `User.status` transitions to `ACTIVE`, and `User.emailVerifiedAt` is set to `NOW()`.
   - The session token is rotated (preventing session fixation), and full workspace capabilities are unlocked.

### 2.2 Verification Link Lifecycle & Edge Case Handling

| Scenario | Server Behavior | HTTP Status | User Message |
| :--- | :--- | :---: | :--- |
| **Valid Token** | Marks token used, sets `User.status = ACTIVE`, rotates session. | 200 OK | `"Email verified successfully. Welcome to FlowPilot!"` |
| **Expired Token (>24h)** | Rejects token; provides resend option. | 400 Bad Request | `"Verification link has expired. A new verification link has been sent to your email."` |
| **Already Used Token** | Rejects token gracefully; checks if account is already active. | 200 OK / Redirect | `"Email has already been verified. Please log in to continue."` |
| **Repeated Resend Requests** | Rate-limited: max 3 resends per hour per email. Invalidates previously issued unused tokens. | 429 Too Many Requests | `"Please wait before requesting another verification email."` |
| **Malformed / Invalid Token** | Constant-time rejection; emits warning log. | 400 Bad Request | `"Invalid verification token."` |

---

## 3. CSRF and CORS Security Architecture & Secret Design

Content-Type checks (such as `Content-Type: application/json`) alone do **not** provide complete CSRF protection against modern browser exploits or top-level navigational attacks. FlowPilot implements defense-in-depth:

### 3.1 Strict Origin Allowlist
- All mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) verified against an explicit server-side allowlist (`ALLOWED_ORIGINS` environment variable):
  - Production: `['https://app.flowpilot.dev', 'https://flowpilot.dev']`
  - Development: `['http://localhost:3000', 'http://127.0.0.1:3000']`
- **Rejection Policy:** If the incoming `Origin` or `Referer` header is present but does not match the allowlist, the request is terminated immediately with `HTTP 403 Forbidden` (`CSRF_ORIGIN_MISMATCH`).

### 3.2 Handling Missing Origin / Referer Headers
- For **browser-originated cookie requests**: If both `Origin` and `Referer` are missing on a state-changing route with a session cookie, the request is rejected unless accompanied by a verified CSRF token.
- For **machine-to-machine / API clients** (e.g. CLI tools, external webhooks, worker daemons): Authenticated via scoped Bearer API tokens (`Authorization: Bearer fp_live_...`). These requests do not use browser session cookies and are validated against the cryptographic API token rather than the browser CSRF policy.

### 3.3 CSRF Secret Architecture & Double-Submit Token Design
1. **Secret Configuration (`SESSION_SECRET`):**
   - Configured via environment variable `SESSION_SECRET` (minimum 32 bytes / 256 bits of cryptographic entropy).
   - Supports zero-downtime key rotation via dual secrets: `SESSION_SECRET` (active) and `SESSION_SECRET_PREVIOUS` (deprecated verification fallback).
2. **Token Construction:**
   - The CSRF token is an HMAC-SHA256 signature over the session ID, timestamp, and a random cryptographic nonce:
     `token = base64url(sessionId + ":" + timestamp + ":" + nonce + ":" + hmac(sessionId + ":" + timestamp + ":" + nonce, SESSION_SECRET))`
3. **Cookie & Header Delivery:**
   - Minted on session creation and set in readable cookie `fp_csrf_token` (`SameSite=Lax; Secure; Path=/; Max-Age=1209600`).
   - Browser client reads `fp_csrf_token` and transmits it in request header `x-csrf-token` on mutating requests.
4. **Server-Side Validation:**
   - Server extracts `x-csrf-token`, verifies HMAC signature against `SESSION_SECRET` (or `SESSION_SECRET_PREVIOUS`), asserts timestamp freshness (max 24 hours), and validates that the `sessionId` embedded in the token matches the active session.
   - Missing or mismatched tokens return `HTTP 403 Forbidden` (`INVALID_CSRF_TOKEN`).

### 3.4 CORS Configuration
- `Access-Control-Allow-Origin` is dynamically set to the verified matching origin from the allowlist.
- **Wildcard origins (`*`) with credentials are categorically forbidden.**
- `Access-Control-Allow-Credentials: true` is set only for explicitly allowed origins.
- `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, x-csrf-token, x-flowpilot-workspace`

---

## 4. Rate Limiting & Account Protection Architecture (Unified Policy)

### 4.1 Consistent Multi-Tier Rate Limiting Policy
To eliminate discrepancies between documentation and implementation, FlowPilot defines a **single, unified rate-limiting policy**:

| Enforcement Tier | Threshold Window | Action / Result | Scope |
| :--- | :--- | :--- | :--- |
| **Normal Execution** | Up to 10 attempts / 1 minute | Immediate execution (~80–120ms) | Per IP |
| **Progressive Delay** | 11 to 20 attempts / 15 minutes | Enforces progressive artificial delay (1s, 2s, 4s backoff) | Per IP |
| **Hard IP Throttling** | > 20 attempts / 15 minutes | Request rejected with `HTTP 429 Too Many Requests` | Per IP |
| **Account Protection** | 5 consecutive failed password attempts | Requesting IP challenged with backoff / CAPTCHA; security alert email dispatched to owner | Per Account + IP |
| **Password Reset** | Max 3 requests / 1 hour | Request rejected with `HTTP 429 Too Many Requests` | Per Account |
| **Email Resend** | Max 3 requests / 1 hour | Request rejected with `HTTP 429 Too Many Requests` | Per Account |

### 4.2 Progressive Throttling vs. Permanent Account Lockout
> [!WARNING]
> **Anti-Denial-of-Service Policy:** Permanently locking an account after 5 failed attempts allows attackers to deliberately lock legitimate users out of their accounts (Denial of Service).

FlowPilot implements **progressive throttling with IP-account separation**:
- If an account experiences 5 consecutive bad passwords, the *requesting IP* is challenged with progressive backoff and temporary lockout.
- The legitimate account owner is **not** globally locked out from their own trusted devices/IPs. An email alert is dispatched: `"Unusual login attempts detected on your FlowPilot account"`.
- Global account suspension requires administrative intervention or manual password reset.

### 4.3 Reverse-Proxy IP Security
- The server reads client IP addresses via `x-forwarded-for` **only** if the immediate socket remote address matches a configured `TRUSTED_PROXY_CIDRS` allowlist (e.g. Cloudflare IP ranges, AWS ALB CIDRs, internal VPC).
- If the socket connection does not originate from a trusted proxy, `x-forwarded-for` is ignored, and the direct TCP socket address is used, preventing IP spoofing attacks.

### 4.4 Argon2id Resource Limits & Concurrency Semaphore
- **Concurrency Gate:** A server-side semaphore limits concurrent Argon2id hashing operations to a maximum of **4 parallel executions** per Node.js process.
- **Queueing:** Additional simultaneous login requests enter a short FIFO queue (max depth: 16, timeout: 3 seconds).
- **Overload Shedding:** If the queue is saturated, the server immediately returns `HTTP 429 Too Many Requests` (or `HTTP 503 Service Unavailable`), protecting the CPU and preventing denial-of-service starvation of workflow executions.
- **Memory Footprint:** 4 concurrent operations × 64 MiB = **256 MiB maximum memory allocated to password hashing**, leaving the remaining system RAM for workflow processing.
- **Production Redis Implementation:** While single-instance dev uses an in-memory sliding window, distributed Redis rate limiting is established as a formal launch prerequisite for multi-instance production.

---

## 5. Token Persistence Schema Proposal

*(Formal proposal for Prisma schema update in Phase 10C-B; **not implemented** in Phase 10C-A)*

To securely persist email verification tokens, password reset tokens, and security challenges without altering existing core models, we propose adding a dedicated `AuthToken` model:

```prisma
// ----------------------------------------------------
// Proposed Phase 10C Token Persistence Model
// ----------------------------------------------------

enum AuthTokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
}

model AuthToken {
  id           String        @id @default(cuid())
  userId       String
  tokenHash    String        @unique // SHA-256 hash of raw 32-byte entropy
  type         AuthTokenType
  expiresAt    DateTime
  usedAt       DateTime?     // Nullable; set atomically upon consumption
  ipAddress    String?       // Requesting IP for security forensics
  userAgent    String?
  createdAt    DateTime      @default(now())

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@index([userId, type])
  @@index([expiresAt])
}
```

### Security Rules for Token Storage:
1. **Raw Tokens Never Persisted:** Raw 32-byte tokens generated via `crypto.randomBytes(32).toString('hex')` exist in memory only long enough to construct the email link. Only the SHA-256 hash (`tokenHash`) is written to PostgreSQL.
2. **Single-Use Atomicity:** Tokens are consumed via an atomic update query:
   ```sql
   UPDATE "AuthToken" SET "usedAt" = NOW() 
   WHERE "tokenHash" = $1 AND "usedAt" IS NULL AND "expiresAt" > NOW();
   ```
   If zero rows are updated, the token is treated as invalid, used, or expired.
3. **Automatic Expiration Cleanup:** Expired or consumed tokens older than 7 days are pruned periodically via background maintenance.

---

## 6. Audit Log Integrity & Security Guarantees

### 6.1 Honest Security Definition: Why Database Rows Are Not Automatically Tamper-Evident
An ordinary PostgreSQL table row is **not** inherently immutable. Any database superuser or compromised application credentials with `UPDATE` or `DELETE` grants can silently alter or delete rows. Claiming "immutable" or "tamper-evident" audit logs requires strict, multi-layered architectural controls.

### 6.2 Multi-Layered Audit Integrity Controls
1. **Database-Level Least Privilege:**
   - The application database role (`flowpilot_app`) is granted **only `SELECT` and `INSERT`** privileges on the `AuditLog` table.
   - `UPDATE` and `DELETE` privileges are explicitly revoked for the application role:
     ```sql
     REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "AuditLog" FROM flowpilot_app;
     GRANT SELECT, INSERT ON TABLE "AuditLog" TO flowpilot_app;
     ```
2. **Database Trigger Guard:**
   - A PostgreSQL database trigger prevents modifications even if an accidental migration script executes:
     ```sql
     CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
     RETURNS TRIGGER AS $$
     BEGIN
       RAISE EXCEPTION 'AuditLog records are append-only. Modification and deletion are prohibited.';
     END;
     $$ LANGUAGE plpgsql;

     CREATE TRIGGER audit_log_immutability_trigger
     BEFORE UPDATE OR DELETE ON "AuditLog"
     FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
     ```
3. **Sensitive Data Redaction:**
   - All audit event payloads pass through the recursive secret sanitizer before insertion, replacing `password`, `token`, `secret`, `credential`, and `key` values with `[REDACTED]`.
4. **Strictly Idempotent Historical Migration (`recommendation_history.json`):**
   - The 33 historical recommendation records from Phase 9G will be imported into `AuditLog` using a **deterministic idempotency key** (`WHERE id = hist_...`).
   - If a record with that `id` already exists, the insert query skips it (`ON CONFLICT (id) DO NOTHING`). Re-running migration scripts will **never** generate duplicate historical records.
5. **Production External Export (Enterprise Launch Prerequisite):**
   - For enterprise compliance (SOC 2, ISO 27001), audit events will be streamed asynchronously to an external Write-Once-Read-Many (WORM) sink (e.g. AWS CloudWatch with S3 Object Lock or Google Cloud Audit Logs).

---

## 7. Authentication Timing & Password Hashing

### 7.1 Argon2id Cryptographic Parameters
- **Memory Cost (`m`):** 65,536 KiB (64 MiB)
- **Time Cost (`t`):** 3 iterations
- **Parallelism (`p`):** 4 threads
- **Salt:** 16 cryptographically secure random bytes per user
- **Hash Output Length:** 32 bytes

### 7.2 Dummy Password Hash Verification (Anti-Enumeration)
To mitigate timing-based account enumeration where an attacker compares server response latencies for valid vs. invalid emails:
1. The server initializes a precomputed static dummy hash at startup:
   `DUMMY_HASH = await argon2.hash('FlowPilotDummyPasswordToNormalizeTiming123!', ...)`
2. When a user submits a login request for an email that **does not exist** in the database, the server executes:
   `await argon2.verify(DUMMY_HASH, inputPassword)`
3. **Test Assertion Policy (No Brittle Fixed MS Ranges):**
   - In automated test suites, timing assertions must **not** rely on rigid millisecond boundaries (e.g. strict 80–120ms pass/fail), as CI runners and varied host environments exhibit natural timing jitter.
   - The primary test assertion verifies that the **dummy hash verification path was genuinely invoked** and that response times for valid and invalid emails are of the same order of magnitude (relative ratio within 2x variance).

---

## 8. Session Security & Lifecycle Management

### 8.1 Dual Expiration Enforcement in `validateSession()`
To ensure both inactivity and absolute session limits are rigorously enforced:
```typescript
public async validateSession(rawToken: string): Promise<SessionRecord | null> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const session = await this.sessionStore.findByTokenHash(tokenHash);

  if (!session) return null;

  const now = Date.now();
  const expiresAtMs = new Date(session.expiresAt).getTime();
  const lastActiveAtMs = new Date(session.lastActiveAt).getTime();

  // 1. Absolute Expiration Check (14 days)
  if (now > expiresAtMs) {
    await this.sessionStore.delete(session.id);
    return null;
  }

  // 2. Idle Timeout Check (2 hours)
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  if (now - lastActiveAtMs > TWO_HOURS_MS) {
    await this.sessionStore.delete(session.id);
    return null;
  }

  // 3. Update activity timestamp (throttled to once every 15 minutes)
  const FIFTEEN_MINS_MS = 15 * 60 * 1000;
  if (now - lastActiveAtMs > FIFTEEN_MINS_MS) {
    await this.sessionStore.touch(session.id, new Date(now));
  }

  return session;
}
```

### 8.2 Password Reset Session Invalidation & Re-Login Policy
> [!CRITICAL]
> **Post-Reset Re-Login Requirement:** Upon successful password reset (`POST /api/v1/auth/reset-password`), the server immediately deletes **all** active sessions for that user (`DELETE FROM "Session" WHERE "userId" = $1`) and clears the session cookie (`max-age=0`).
> 
> **No automatic session is issued after a password reset.** The user must explicitly log in again with their new password. This ensures that an attacker who may have intercepted a reset link cannot immediately gain an active authenticated browser session.

### 8.3 Session Rotation
To eliminate session fixation vulnerabilities:
- **On Login:** A fresh session token and database record are minted; any existing pre-authentication cookie is overwritten.
- **On Password Change:** All existing sessions for that user are deleted from PostgreSQL, and the user is redirected to login.
- **On Email Change or Role Demotion:** Active sessions are refreshed to reload new permission scopes.

### 8.4 Remember-Device Decision
- The "Remember this device" checkbox is **omitted from the Phase 10C UI release**. Advertising a checkbox that does not alter security controls creates false expectations. All web sessions consistently adhere to the secure 14-day absolute / 2-hour idle policy.

### 8.5 Cookie Attributes Summary
- **Cookie Name:** `__Host-fp_session` (Production HTTPS) / `fp_session` (Local dev HTTP)
- **HttpOnly:** `true` (Inaccessible to DOM / JavaScript)
- **Secure:** `true` (Enforced in production TLS)
- **SameSite:** `Lax` (Protects against cross-origin POST)
- **Path:** `/`
- **Max-Age:** `1209600` (14 days)

---

## 9. Workspace Security: Selection vs. Identity Authentication

### 9.1 The Separation Principle
A client-provided workspace selector (such as header `x-flowpilot-workspace` or URL path `/api/v1/workspaces/[id]/...`) is **strictly a routing preference**, never an authorization claim.

### 9.2 Server-Side Verification Pipeline
Before granting access to any workspace-scoped resource, the server executes the following sequence:
1. **Derive Identity:** Resolve `userId` from the verified session.
2. **Verify User Account:** Confirm `user.status === 'ACTIVE'`.
3. **Verify Membership:** Query `Membership` table where `userId = session.userId` AND `workspaceId = targetWorkspaceId`.
4. **Verify Membership Status:** Confirm `membership.status === 'active'`.
5. **Verify Workspace State:** Confirm `workspace.isArchived === false`.
6. **Assert RBAC Permission:** `RBACManager.assertPermission(membership.role, requiredPermission)` verifies the user's role against the action permission matrix (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`).

Under no circumstances does FlowPilot trust client-supplied roles, ownership claims, or workspace memberships.

---

## 10. Test Authentication Isolation & Zero-Leakage Guarantee

### 10.1 Production Hardening: Absolute Rejection of Mock Headers
To ensure that development mock headers (`x-user-id`, `x-workspace-id`) can **never** be exploited in production, the code enforces a dual-lock check:
```typescript
// Hardcoded production guard inside AuthContextManager
export class AuthContextManager {
  public static async resolve(req?: NextRequest): Promise<AuthContext> {
    const isProduction = process.env.NODE_ENV === 'production';

    // 1. In production, mock headers are completely forbidden and stripped
    if (isProduction) {
      if (req?.headers.has('x-user-id') || req?.headers.has('x-workspace-id')) {
        // Silently strip or reject; never read
      }
      return this.resolveFromSessionCookie(req);
    }

    // 2. In non-production, only accept mock headers if test auth flag is explicitly set
    if (process.env.FLOWPILOT_TEST_AUTH === 'allow_mock_headers') {
      return this.resolveMockTestContext(req);
    }

    // 3. Default fallback: require real session even in dev
    return this.resolveFromSessionCookie(req);
  }
}
```
Even if an operator accidentally configures `FLOWPILOT_TEST_AUTH=allow_mock_headers` in a production environment, the `isProduction` hard check overrides it and prevents mock header execution.

---

## 11. Email Provider Architecture

### 11.1 Adapter Pattern Interface
```typescript
export interface EmailAdapter {
  sendVerificationEmail(to: string, name: string, verificationUrl: string): Promise<boolean>;
  sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<boolean>;
  sendSecurityAlert(to: string, name: string, event: string, details: Record<string, unknown>): Promise<boolean>;
}
```

### 11.2 Environment Implementations
1. **`DevelopmentEmailAdapter`:**
   - Logs masked recipient email and action name to the local development console.
   - Verification links and raw tokens are written to an isolated local debug logger (or memory fixture in tests).
   - **Zero Raw Tokens in Production Logs:** Production log sinks never print raw verification or reset tokens.
2. **`ProductionEmailAdapter`:**
   - Dispatches transactional emails via transactional API (Resend / AWS SES / SendGrid) over TLS 1.3.

---

## 12. Explicit Decision Register

| Category | Decision / Item | Status | Justification / Notes |
| :--- | :--- | :---: | :--- |
| **Approved Decision** | Database-Backed Sessions | **APPROVED** | Sovereign control, instant session revocation, zero vendor lock-in. |
| **Approved Decision** | Argon2id Hashing | **APPROVED** | OWASP recommended (64 MiB, 3 iterations, 4 parallelism); resistant to GPU attacks. |
| **Approved Decision** | `__Host-` Prefixed Cookies | **APPROVED** | Guarantees HTTPS-only, host-domain origin, and path isolation. |
| **Approved Decision** | Server-Derived Identity | **APPROVED** | Strips `x-user-id` and `x-workspace-id`; derives identity strictly from session. |
| **Approved Decision** | Restricted Verification Session | **APPROVED** | Resolves registration/verification conflict; blocks core workflow operations until verified. |
| **Approved Decision** | Dual Expiration in validateSession | **APPROVED** | Enforces both 14-day absolute lifetime and 2-hour idle timeout on every lookup. |
| **Approved Decision** | Re-Login After Password Reset | **APPROVED** | Zero automatic session issuance post-reset; user must re-authenticate with new password. |
| **Approved Decision** | Unified Rate Limiting Policy | **APPROVED** | 10/min normal, 11-20/15min progressive backoff, >20/15min hard block, 5/account security challenge. |
| **Approved Decision** | Idempotent Audit Migration | **APPROVED** | Unique ID check (`id = hist_...`) prevents duplicate records on re-runs. |
| **Approved Decision** | Relative Timing Test Assertions | **APPROVED** | Verifies dummy hash path execution without brittle millisecond CI flakiness. |
| **Approved Decision** | Omit "Remember Me" in v1 | **APPROVED** | Consistent 14-day absolute / 2-hour idle session policy without false UI claims. |
| **Proposed Detail** | `AuthToken` Prisma Model | **PROPOSED** | Persists email verification and password reset token hashes with expiration. |
| **Proposed Detail** | Double-Submit CSRF Cookie | **PROPOSED** | HMAC-SHA256 signature using `SESSION_SECRET` with dual-secret rotation. |
| **Unresolved Dependency** | External SMTP / Resend Credentials | **PENDING** | Required for live email delivery; mock adapter used in development. |
| **Launch Prerequisite** | Distributed Redis Rate Limiter | **PREREQUISITE** | Must be deployed in Phase 10D before opening multi-instance public SaaS traffic. |
| **Launch Prerequisite** | External WORM Audit Export | **PREREQUISITE** | Required for enterprise compliance export before public GA. |
| **Launch Prerequisite** | Hosted PostgreSQL Staging Verification | **PREREQUISITE** | Networked SSL, PgBouncer, and connection pool testing required before live release. |
