# FlowPilot Phase 10C: Final STRIDE Threat Model & Security Analysis

**Milestone:** Phase 10C — Authentication & Session Security  
**Document:** Final STRIDE Threat Model & Risk Assessment  
**Repository:** `flowpilot`  
**Active Branch:** `v1-development`  
**Date:** November 16, 2026  
**Status:** **Architectural Assessment Complete — Awaiting Approval Before Implementation (10C-B)**  

---

## 1. Threat Modeling Methodology

This document evaluates the security architecture of FlowPilot Phase 10C using the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) aligned with the **OWASP Top 10 (2021)** and **NIST SP 800-63B (Digital Identity Guidelines)**.

### Target Scope
- Public Registration & Login Endpoints (`/api/v1/auth/register`, `/api/v1/auth/login`)
- Email Verification & Account Lifecycle (`/api/v1/auth/verify-email`, `PENDING_VERIFICATION` vs `ACTIVE`)
- Password Hashing Engine (Argon2id)
- Session Management & Cookie Architecture (`__Host-fp_session`, `Session` table)
- CSRF & CORS Defenses
- Rate Limiting & Brute-Force Throttling
- Multi-Tenant Workspace Authorization & RBAC

---

## 2. Threat Actor Profiles & Attack Scenarios

| Actor Profile | Description & Motivation | Capabilities |
| :--- | :--- | :--- |
| **External Opportunist** | Automated credential stuffers, script kiddies, botnets. | High volume, automated HTTP requests, stolen password lists, distributed proxies. |
| **Targeted External Attacker** | Focused attacker attempting to breach specific customer workspaces, steal workflow credentials, or manipulate executions. | Sophisticated, capable of crafting CSRF payloads, timing analysis, and exploiting misconfigurations. |
| **Malicious Authenticated Tenant** | Legitimate user of Workspace A attempting to access Workspace B (Horizontal Escalation). | Has valid session cookies, understands internal API contracts and resource IDs. |
| **Insider / Disgruntled Employee** | Member of a workspace attempting to elevate permissions from `VIEWER` to `OWNER` or cover tracks of malicious actions. | Has network access, attempts to manipulate role states or delete audit logs. |

---

## 3. Comprehensive STRIDE Threat Analysis & Mitigations

### 3.1 Spoofing Identity

| Threat ID | Threat Description | Attack Vector | Severity | Mitigating Controls in Phase 10C |
| :---: | :--- | :--- | :---: | :--- |
| **S-01** | **Identity Header Impersonation** | Attacker sends `x-user-id: usr_owner` in request headers to bypass login. | **CRITICAL** | **Hard Strip & Ignore:** The server strictly ignores incoming `x-user-id` and `x-workspace-id` headers for browser requests. Identity is derived *solely* from verified database sessions. Hardcoded rejection in production. |
| **S-02** | **Session Cookie Hijacking** | Attacker intercepts session cookie over unencrypted channel or via XSS. | **HIGH** | **Cookie Hardening:** Cookie configured with `HttpOnly` (inaccessible to JavaScript `document.cookie`), `Secure` (TLS only), and `__Host-` prefix (prevents subdomain injection and path manipulation). |
| **S-03** | **Session Token Forgery** | Attacker attempts to guess or generate valid session tokens. | **CRITICAL** | **Cryptographic Entropy:** Tokens generated using 256 bits (32 bytes) of cryptographically secure random entropy (`crypto.randomBytes(32)`). Brute-force space is $2^{256}$. |
| **S-04** | **Database Token Compromise** | Stolen database dump reveals active user session tokens. | **HIGH** | **Hashed Token Storage:** The database stores only SHA-256 hashes (`tokenHash`). Raw tokens exist solely in user cookies. Stolen database dumps cannot be used to forge sessions. |
| **S-05** | **Session Fixation** | Attacker forces a pre-set session token onto a victim prior to authentication. | **MEDIUM** | **Session Rotation:** On login, password reset, or privilege change, the server invalidates old session tokens and mints a fresh token. |

---

### 3.2 Tampering with Data

| Threat ID | Threat Description | Attack Vector | Severity | Mitigating Controls in Phase 10C |
| :---: | :--- | :--- | :---: | :--- |
| **T-01** | **Cross-Site Request Forgery (CSRF)** | Malicious third-party website tricks authenticated browser into deleting a workflow or inviting an attacker. | **HIGH** | **Defense-in-Depth:**<br>1. Session cookie configured with `SameSite=Lax`.<br>2. Origin/Referer validated against strict trusted allowlist.<br>3. Double-submit encrypted CSRF token required on mutating HTTP requests (`POST`, `PUT`, `DELETE`). |
| **T-02** | **Client-Side Role Tampering** | Attacker edits local storage or request body to send `"role": "OWNER"`. | **CRITICAL** | **Server-Enforced RBAC:** User roles are never accepted from the client or stored in client tokens. The server queries the PostgreSQL `Membership` table on every request and evaluates permissions dynamically. |
| **T-03** | **Verification / Reset Token Replay** | Attacker re-uses an intercepted password reset link after the legitimate user completed it. | **HIGH** | **Atomic Single-Use Tokens:** Tokens are consumed atomically in a single SQL update (`usedAt = NOW()`). Once used, subsequent requests are immediately rejected. |

---

### 3.3 Repudiation

| Threat ID | Threat Description | Attack Vector | Severity | Mitigating Controls in Phase 10C |
| :---: | :--- | :--- | :---: | :--- |
| **R-01** | **Disavowal of Administrative Operations** | Admin deletes production workflow and claims the system malfunctioned or another member did it. | **MEDIUM** | **Tamper-Guarded Audit Logging:** All mutations record actor `userId`, workspace ID, IP address, user agent, action name, resource ID, and microsecond timestamps in `AuditLog`. |
| **R-02** | **Audit Log Tampering / Deletion** | Malicious user or compromised application modifies or truncates audit logs. | **HIGH** | **Database-Enforced Immutability:** Application DB user granted only `SELECT` and `INSERT` privileges. PostgreSQL trigger strictly prohibits `UPDATE` and `DELETE` on `AuditLog` rows. Production export to external WORM storage. |

---

### 3.4 Information Disclosure

| Threat ID | Threat Description | Attack Vector | Severity | Mitigating Controls in Phase 10C |
| :---: | :--- | :--- | :---: | :--- |
| **I-01** | **Email Enumeration via Timing** | Attacker submits emails to `/api/v1/auth/login` and observes response latency differences. | **MEDIUM** | **Dummy Hash Execution:** If the submitted email does not exist, the server executes a dummy Argon2id hash verification against a precomputed static hash, neutralizing processing latency discrepancy. |
| **I-02** | **Account Enumeration via Error Messages** | Login or forgot-password responses indicate whether an email exists. | **LOW** | **Generic Error Responses:** Login returns generic `"Invalid email or password"`. Password reset returns `"If an account with that email exists, instructions have been sent"`. |
| **I-03** | **Credential Leakage in Logs** | Cleartext passwords or reset tokens leak into server console or log management systems. | **HIGH** | **Automated Redactor:** Global sanitizer scrubs `password`, `token`, and `secret` keys before logging. Dev logger masks recipient emails. |
| **I-04** | **Cross-Tenant Data Exposure** | User of Workspace A accesses workflows or credentials of Workspace B. | **CRITICAL** | **Server-Derived Workspace Isolation:** `AuthContextManager.enforceWorkspaceIsolation()` verifies membership in target workspace before executing queries. Database queries scoped by `workspaceId`. |

---

### 3.5 Denial of Service

| Threat ID | Threat Description | Attack Vector | Severity | Mitigating Controls in Phase 10C |
| :---: | :--- | :--- | :---: | :--- |
| **D-01** | **Argon2id CPU & Memory Starvation** | Attacker bombards login endpoint with concurrent requests, exhausting CPU/RAM. | **HIGH** | **Concurrency Limiter Semaphore:** Server caps concurrent hashing operations to **4 parallel jobs**. Excess requests enter a short bounded queue or return `HTTP 429`. Memory capped at 256 MiB. |
| **D-02** | **Account Lockout Denial of Service** | Attacker submits 5 bad passwords for a victim's email to lock them out. | **HIGH** | **Progressive Throttling (Anti-Lockout):** The system throttles the *attacking IP address* with progressive delays (1s, 2s, 4s backoff) rather than permanently locking the user account. Legitimate owners are not locked out from their trusted devices. |
| **D-03** | **Distributed Credential Stuffing** | Botnet rotates thousands of IP addresses to bypass simple per-IP rate limits. | **HIGH** | **Multi-Tier Throttling:** Combined IP, subnet, and account velocity checks. Distributed Redis rate limiter coordinates attempt tracking across server replicas. |

---

### 3.6 Elevation of Privilege

| Threat ID | Threat Description | Attack Vector | Severity | Mitigating Controls in Phase 10C |
| :---: | :--- | :--- | :---: | :--- |
| **E-01** | **Horizontal Tenant Traversal** | Member of Workspace A passes `x-flowpilot-workspace: ws_victim` to read private workflows. | **CRITICAL** | **Membership Verification:** `x-flowpilot-workspace` is treated as a routing preference only. The server asserts `Membership(workspaceId, userId)` exists and is `active`. If not, returns `HTTP 403 Forbidden`. |
| **E-02** | **Unverified User Privilege Escalation** | User registers, ignores email verification, and creates live workflows or triggers webhooks. | **HIGH** | **Restricted Session Boundary:** Unverified accounts receive restricted verification sessions capable only of viewing verification screens. Any request to core workflow routes is rejected with `HTTP 403 (EMAIL_VERIFICATION_REQUIRED)`. |
| **E-03** | **Vertical Role Bypass** | Workspace `VIEWER` sends `POST /api/v1/workflows` to create or modify automations. | **HIGH** | **RBAC Assertion on Every Route:** `RBACManager.assertPermission(role, 'workflow:create')` enforces role boundaries. Viewers cannot mutate workflows. |

---

## 4. OWASP Top 10 (2021) Compliance Matrix

| OWASP Risk Category | FlowPilot Exposure in Prototype | Phase 10C Mitigating Architecture | Residual Risk |
| :--- | :--- | :--- | :---: |
| **A01: Broken Access Control** | Client-supplied `x-user-id` and `x-workspace-id` trusted. | Server derives identity strictly from session; strict membership queries; RBAC asserted. | **LOW** |
| **A02: Cryptographic Failures** | Prototype had no passwords or session tokens. | Argon2id (64 MiB, 3 iterations); 256-bit crypto session tokens; SHA-256 database hashing; HTTPS `__Host-` cookies. | **LOW** |
| **A03: Injection** | Direct SQL or JSON query parameter manipulation. | Prisma parameterized queries; Zod schema input validation on all auth endpoints. | **LOW** |
| **A04: Insecure Design** | Absence of rate limiting, lockout, or session revocation. | Progressive throttling; dummy hash timing normalization; instant database session revocation. | **LOW** |
| **A05: Security Misconfiguration** | Permissive CORS or mock headers enabled in production. | Hardcoded `process.env.NODE_ENV === 'production'` guard rejecting mock headers; strict CORS allowlist. | **LOW** |
| **A06: Vulnerable & Outdated Components** | Legacy prototype dependencies. | `@node-rs/argon2` with native prebuilt binaries; audited crypto libraries. | **LOW** |
| **A07: Identification & Auth Failures** | Header-based identity simulation; no password verification. | Database-backed sessions; restricted verification sessions; single-use reset tokens; session rotation. | **LOW** |
| **A08: Software & Data Integrity Failures** | Unverified JSON files; unvalidated tokens. | SHA-256 token hashing; atomic token consumption; strict Zod validation. | **LOW** |
| **A09: Security Logging & Monitoring Failures** | Audit events could be modified or missing authentication events. | Append-only database permissions; DB trigger immutability; 10 distinct auth audit event types; historical preservation. | **LOW** |
| **A10: Server-Side Request Forgery (SSRF)** | External webhook calls or integration requests. | Phase 5 SSRF protection already verified (DNS resolution check, private IP blocklist). | **LOW** |
