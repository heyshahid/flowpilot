# FlowPilot Team Invitations & Token Security

FlowPilot implements a cryptographically secure, tokenized invitation lifecycle for onboarding new collaborators to workspaces.

## 1. Invitation Lifecycle

```
[ Admin Sends Invite ] ──► [ Generate Token ] ──► [ SHA-256 Hash Stored ] ──► [ Status: PENDING ]
                                  │
                                  ├──► User clicks invite link (/invite/fp_inv_...)
                                  │           │
                                  │           ▼
                                  │    [ Verify Token Hash & Expiry ]
                                  │           │
                                  │           ▼
                                  │    [ Email Matches Identity ]
                                  │           │
                                  │           ▼
                                  └──► [ Status: ACCEPTED ] ──► Active Membership
```

## 2. Security Guarantees

1. **Unguessable Tokens:**
   - Generated using 32 bytes of cryptographically secure random entropy (`crypto.randomBytes(32).toString('hex')`).
   - Token format: `fp_inv_[64 hex characters]`.

2. **At-Rest Token Hashing:**
   - FlowPilot never stores raw invitation tokens in persistent storage (`invitations.json`).
   - Only a cryptographic SHA-256 digest (`crypto.createHash('sha256').update(rawToken).digest('hex')`) is saved.
   - Even if the database or filesystem is inspected, pending invitation links cannot be replayed or forged.

3. **Replay & Expiration Defense:**
   - Invitations carry an explicit ISO 8601 `expiresAt` timestamp (default: 7 days).
   - Once accepted, the invitation status shifts to `accepted` and cannot be reused.
   - Administrators can `revoke` or `resend` invitations at any time.

4. **Identity Binding:**
   - The user accepting the invitation must authenticate with the specific email address the invitation was addressed to.
   - Cross-email claims are blocked with `400 Bad Request: Email mismatch`.
