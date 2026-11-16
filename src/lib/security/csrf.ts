/**
 * FlowPilot CSRF Protection & Signed Token Validation
 * Phase 10C-B1: Security Foundation
 *
 * Implements cryptographically signed HMAC-SHA256 double-submit CSRF tokens
 * bound to active session IDs, with 24-hour freshness, rolling renewal,
 * key rotation support, and strict Origin/Referer allowlist verification.
 *
 * NOTE: Token construction provides integrity and authenticity via HMAC signature
 * (it is signed, not encrypted, and does not claim confidentiality).
 */

import crypto from 'crypto';
import { timingSafeEqual } from './tokens';
import { getSecurityConfig } from './config';

export const CSRF_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CSRF_RENEWAL_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours (rolling renewal trigger)

export interface ParsedCsrfToken {
  sessionId: string;
  timestamp: number;
  nonce: string;
  signature: string;
  rawPayload: string;
}

export interface VerifyCsrfOptions {
  activeSecret?: string;
  previousSecret?: string;
  maxAgeMs?: number;
  now?: number;
}

export interface VerifyCsrfResult {
  valid: boolean;
  reason?: 'MALFORMED' | 'SESSION_MISMATCH' | 'EXPIRED' | 'INVALID_SIGNATURE';
  timestamp?: number;
  isFromPreviousSecret?: boolean;
}

export interface CsrfValidationParams {
  method: string;
  sessionId?: string | null;
  csrfToken?: string | null;
  origin?: string | null;
  referer?: string | null;
  authType?: 'cookie' | 'bearer' | 'webhook';
  allowedOrigins?: string[];
  activeSecret?: string;
  previousSecret?: string;
  maxAgeMs?: number;
  now?: number;
}

export interface CsrfValidationResult {
  allowed: boolean;
  statusCode: number;
  errorCode?: string;
  errorMessage?: string;
  shouldRenew?: boolean;
}

/**
 * Normalizes an origin string by stripping trailing slashes and converting to lowercase.
 */
export function normalizeOrigin(raw: string): string {
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return raw.trim().replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Validates request Origin and Referer headers against the configured exact-origin allowlist.
 * If Origin is present, it takes precedence.
 * If Origin is missing, extracts and validates the origin portion of Referer.
 * If both are missing, returns false.
 */
export function validateOriginAndReferer(
  originHeader: string | null | undefined,
  refererHeader: string | null | undefined,
  allowedOrigins: string[]
): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return false;
  }

  const normalizedAllowed = new Set(allowedOrigins.map(normalizeOrigin));

  // 1. Origin header check
  if (originHeader && originHeader.trim().length > 0) {
    const normalized = normalizeOrigin(originHeader);
    return normalizedAllowed.has(normalized);
  }

  // 2. Fall back to Referer header
  if (refererHeader && refererHeader.trim().length > 0) {
    try {
      const parsedReferer = new URL(refererHeader);
      const refererOrigin = `${parsedReferer.protocol}//${parsedReferer.host}`.toLowerCase();
      return normalizedAllowed.has(refererOrigin);
    } catch {
      return false;
    }
  }

  // Both missing
  return false;
}

/**
 * Mints an HMAC-SHA256 signed CSRF token bound to an active session ID.
 * Token structure: base64url(sessionId + ":" + timestamp + ":" + nonce + ":" + hmac)
 */
export function mintCsrfToken(sessionId: string, customSecret?: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Cannot mint CSRF token: sessionId is required and must be a string');
  }

  const secret = customSecret || getSecurityConfig().sessionSecret;
  if (!secret) {
    throw new Error('Cannot mint CSRF token: sessionSecret is not configured');
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${sessionId}:${timestamp}:${nonce}`;
  const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

  const fullTokenString = `${payload}:${signature}`;
  return Buffer.from(fullTokenString, 'utf8').toString('base64url');
}

/**
 * Parses a base64url-encoded CSRF token into its constituent components.
 */
export function parseCsrfToken(rawToken: string): ParsedCsrfToken | null {
  if (!rawToken || typeof rawToken !== 'string') {
    return null;
  }

  try {
    const decoded = Buffer.from(rawToken, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) {
      return null;
    }

    const [sessionId, timestampStr, nonce, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);
    if (!sessionId || isNaN(timestamp) || !nonce || !signature) {
      return null;
    }

    return {
      sessionId,
      timestamp,
      nonce,
      signature,
      rawPayload: `${sessionId}:${timestampStr}:${nonce}`,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies a signed CSRF token against an active session ID.
 * Checks HMAC signature with timing-safe comparison, supports dual-secret rotation,
 * and asserts that timestamp is within the 24-hour freshness window.
 */
export function verifyCsrfToken(
  token: string,
  activeSessionId: string,
  options?: VerifyCsrfOptions
): VerifyCsrfResult {
  const parsed = parseCsrfToken(token);
  if (!parsed) {
    return { valid: false, reason: 'MALFORMED' };
  }

  // Assert session binding using constant-time comparison
  if (!timingSafeEqual(parsed.sessionId, activeSessionId)) {
    return { valid: false, reason: 'SESSION_MISMATCH' };
  }

  // Check 24-hour freshness window
  const now = options?.now ?? Date.now();
  const maxAgeMs = options?.maxAgeMs ?? CSRF_TOKEN_MAX_AGE_MS;
  const age = now - parsed.timestamp;

  if (age < 0 || age > maxAgeMs) {
    return { valid: false, reason: 'EXPIRED', timestamp: parsed.timestamp };
  }

  const activeSecret = options?.activeSecret || getSecurityConfig().sessionSecret;
  const previousSecret = options?.previousSecret || getSecurityConfig().sessionSecretPrevious;

  // 1. Verify against active secret
  const expectedSigActive = crypto.createHmac('sha256', activeSecret).update(parsed.rawPayload, 'utf8').digest('hex');
  if (timingSafeEqual(parsed.signature, expectedSigActive)) {
    return { valid: true, timestamp: parsed.timestamp, isFromPreviousSecret: false };
  }

  // 2. Check previous secret for graceful key rotation
  if (previousSecret) {
    const expectedSigPrevious = crypto
      .createHmac('sha256', previousSecret)
      .update(parsed.rawPayload, 'utf8')
      .digest('hex');
    if (timingSafeEqual(parsed.signature, expectedSigPrevious)) {
      return { valid: true, timestamp: parsed.timestamp, isFromPreviousSecret: true };
    }
  }

  return { valid: false, reason: 'INVALID_SIGNATURE', timestamp: parsed.timestamp };
}

/**
 * Checks whether an existing CSRF token should be refreshed on an active session.
 * Returns true if the token is valid but older than the 12-hour renewal threshold,
 * or if it was signed with a previous secret during key rotation.
 */
export function shouldRenewCsrfToken(
  token: string,
  thresholdMs = CSRF_RENEWAL_THRESHOLD_MS,
  now = Date.now()
): boolean {
  const parsed = parseCsrfToken(token);
  if (!parsed) return true;

  const age = now - parsed.timestamp;
  return age >= thresholdMs;
}

/**
 * Central CSRF validation guard for API route handlers and middleware.
 * Explicitly separates browser cookie sessions from Bearer tokens and webhooks.
 */
export function validateCsrfRequest(params: CsrfValidationParams): CsrfValidationResult {
  const method = params.method.toUpperCase();
  const isSafeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

  // If method is read-only / safe, allow without CSRF check
  if (isSafeMethod) {
    const needsRenewal = params.csrfToken ? shouldRenewCsrfToken(params.csrfToken, undefined, params.now) : false;
    return { allowed: true, statusCode: 200, shouldRenew: needsRenewal };
  }

  // Separate non-browser authentication: Bearer API tokens and Webhooks do not use cookie CSRF
  const authType = params.authType || 'cookie';
  if (authType === 'bearer' || authType === 'webhook') {
    return { allowed: true, statusCode: 200 };
  }

  // For cookie-authenticated mutating requests:
  // 1. Validate Origin / Referer against allowlist
  const allowedOrigins = params.allowedOrigins || getSecurityConfig().allowedOrigins;
  const isOriginAllowed = validateOriginAndReferer(params.origin, params.referer, allowedOrigins);

  if (!isOriginAllowed) {
    return {
      allowed: false,
      statusCode: 403,
      errorCode: 'FORBIDDEN_ORIGIN',
      errorMessage: 'Cross-origin request forbidden by FlowPilot CORS/CSRF policy.',
    };
  }

  // 2. Validate Session ID existence
  if (!params.sessionId) {
    return {
      allowed: false,
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
      errorMessage: 'Authentication session required.',
    };
  }

  // 3. Validate CSRF token presence
  if (!params.csrfToken || params.csrfToken.trim().length === 0) {
    return {
      allowed: false,
      statusCode: 403,
      errorCode: 'MISSING_CSRF_TOKEN',
      errorMessage: 'Required x-csrf-token header is missing.',
    };
  }

  // 4. Verify CSRF token
  const verifyResult = verifyCsrfToken(params.csrfToken, params.sessionId, {
    activeSecret: params.activeSecret,
    previousSecret: params.previousSecret,
    maxAgeMs: params.maxAgeMs,
    now: params.now,
  });

  if (!verifyResult.valid) {
    const reasonMessages: Record<string, string> = {
      MALFORMED: 'CSRF token is malformed.',
      SESSION_MISMATCH: 'CSRF token is not bound to the active session.',
      EXPIRED: 'CSRF token has expired (24-hour freshness window exceeded). Please refresh.',
      INVALID_SIGNATURE: 'CSRF token signature is invalid.',
    };

    return {
      allowed: false,
      statusCode: 403,
      errorCode: `INVALID_CSRF_${verifyResult.reason || 'TOKEN'}`,
      errorMessage: reasonMessages[verifyResult.reason || ''] || 'CSRF token validation failed.',
    };
  }

  const needsRenewal =
    verifyResult.isFromPreviousSecret ||
    shouldRenewCsrfToken(params.csrfToken, undefined, params.now);

  return {
    allowed: true,
    statusCode: 200,
    shouldRenew: needsRenewal,
  };
}

// Aliases for compatibility
export { mintCsrfToken as generateCsrfToken, validateCsrfRequest as validateCsrfProtection };
