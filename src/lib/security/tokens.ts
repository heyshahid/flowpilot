/**
 * FlowPilot Cryptographic Token Utilities
 * Phase 10C-B1: Security Foundation
 *
 * Provides cryptographically secure pseudo-random number generation,
 * SHA-256 one-way hashing for stored tokens, and constant-time string comparison.
 */

import crypto from 'crypto';

/**
 * Generates an unguessable cryptographically secure token with specified entropy.
 * Default: 32 bytes (256 bits) of entropy, formatted as a 64-character hexadecimal string.
 *
 * @param bytes Number of random bytes of entropy (default: 32)
 * @returns Hex-encoded string
 */
export function generateSecureToken(bytes = 32): string {
  if (typeof bytes !== 'number' || bytes < 16 || !Number.isInteger(bytes)) {
    throw new Error('Token entropy must be an integer of at least 16 bytes');
  }
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generates a base64url-encoded random token (convenient for URLs and query params).
 * Default: 32 bytes (256 bits) of entropy.
 */
export function generateSecureTokenBase64Url(bytes = 32): string {
  if (typeof bytes !== 'number' || bytes < 16 || !Number.isInteger(bytes)) {
    throw new Error('Token entropy must be an integer of at least 16 bytes');
  }
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Computes a SHA-256 cryptographic hash of a raw token.
 * Used for database storage of session tokens, email verification tokens,
 * and password reset tokens. The raw token is sent to the client, while
 * only the SHA-256 hash is persisted.
 *
 * @param rawToken The plain text secret token
 * @returns 64-character lowercase hex string of the SHA-256 digest
 */
export function hashToken(rawToken: string): string {
  if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    throw new Error('Cannot hash empty or non-string token');
  }
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Constant-time comparison between two strings to prevent timing attacks.
 * Wraps Node.js crypto.timingSafeEqual with safe length handling.
 *
 * If strings differ in length or inputs are invalid, a dummy comparison
 * is performed against an internal buffer to prevent microarchitectural
 * timing leaks while safely returning false.
 *
 * @param a First string to compare
 * @param b Second string to compare
 * @returns true if identical in content and length, false otherwise
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Perform dummy timingSafeEqual against bufA to mask timing differences
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
