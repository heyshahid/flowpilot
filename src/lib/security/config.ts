/**
 * FlowPilot Security Configuration & Environment Validation
 * Phase 10C-B1: Security Foundation
 *
 * Validates and exposes runtime security configuration for authentication,
 * session management, CSRF protection, and rate limiting.
 */

export type AuthMode = 'session' | 'mock' | 'hybrid';

export interface SecurityConfig {
  authMode: AuthMode;
  sessionSecret: string;
  sessionSecretPrevious?: string;
  allowedOrigins: string[];
  trustedProxyCidrs: string[];
  isProduction: boolean;
}

const DEFAULT_DEV_SECRET = 'dev_only_insecure_session_secret_32_bytes_min_for_local_testing!';
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const DEFAULT_TRUSTED_PROXIES = ['127.0.0.1/32', '::1/128', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

/**
 * Calculates Shannon entropy (in bits per character) for an input string.
 * H(X) = -sum(P(x) * log2(P(x)))
 * Used to verify that cryptographic secrets possess genuine pseudo-random entropy
 * rather than simple repeated characters or low-entropy patterns.
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const frequencies = new Map<string, number>();
  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Validates the cryptographic entropy, length, and pattern safety of a production secret.
 * Note: String length alone does not prove 256-bit cryptographic entropy.
 * This validator requires:
 * 1. Minimum 32 characters (for 256 bits, 64 hex characters or 43+ base64url characters is recommended).
 * 2. Absence of known placeholders, default values, or dictionary sequences.
 * 3. Minimum 10 unique distinct characters.
 * 4. Minimum Shannon entropy of 3.0 bits per character.
 *
 * Generation Procedure:
 * node -e "console.log(crypto.randomBytes(32).toString('hex'))"
 */
export function validateSecretStrength(secret: string, secretName = 'SESSION_SECRET'): void {
  if (!secret || typeof secret !== 'string') {
    throw new Error(`CRITICAL SECURITY CONFIGURATION ERROR: ${secretName} environment variable is missing in production.`);
  }

  const trimmed = secret.trim();

  // 1. Length threshold
  if (trimmed.length < 32) {
    throw new Error(
      `CRITICAL SECURITY CONFIGURATION ERROR: ${secretName} must be at least 32 characters. Length alone does not prove entropy, but is a mandatory lower bound. Current length: ${trimmed.length}.`
    );
  }

  // 2. Reject known placeholders and low-entropy phrases
  const lower = trimmed.toLowerCase();
  const knownPlaceholders = [
    'replace_with_',
    'dev_only',
    'placeholder',
    'your_secret',
    'change_me',
    'password',
    'secret_here',
    'flowpilot_secret',
    'default_secret',
    '12345678',
    'abcdefgh',
  ];
  for (const placeholder of knownPlaceholders) {
    if (lower.includes(placeholder)) {
      throw new Error(
        `CRITICAL SECURITY CONFIGURATION ERROR: ${secretName} contains an insecure placeholder or common pattern ("${placeholder}"). Cryptographic entropy requires genuine random bytes. Generate using: node -e "console.log(crypto.randomBytes(32).toString('hex'))"`
      );
    }
  }

  // 3. Minimum unique character diversity
  const uniqueChars = new Set(trimmed).size;
  if (uniqueChars < 10) {
    throw new Error(
      `CRITICAL SECURITY CONFIGURATION ERROR: ${secretName} has insufficient character diversity (${uniqueChars} unique characters found; minimum 10 required). Length alone does not prove 256-bit entropy. Repeated or low-diversity strings are rejected.`
    );
  }

  // 4. Shannon entropy threshold (minimum 3.0 bits per character)
  const entropy = calculateShannonEntropy(trimmed);
  if (entropy < 3.0) {
    throw new Error(
      `CRITICAL SECURITY CONFIGURATION ERROR: ${secretName} has insufficient Shannon entropy (${entropy.toFixed(2)} bits/char; minimum 3.0 required). Ensure the secret was generated with a CSPRNG.`
    );
  }
}

/**
 * Validates production environment variables.
 * In production mode (NODE_ENV === 'production'):
 * - FLOWPILOT_AUTH_MODE must be 'session'
 * - SESSION_SECRET must be configured, distinct from placeholder/dev secret, and meet entropy standards
 * - ALLOWED_ORIGINS must be explicitly configured
 *
 * Throws an Error with explicit guidance if invalid in production.
 */
export function validateSecurityConfig(env: NodeJS.ProcessEnv = process.env): SecurityConfig {
  const isProduction = env.NODE_ENV === 'production';
  const rawAuthMode = env.FLOWPILOT_AUTH_MODE || (isProduction ? 'session' : 'mock');

  if (rawAuthMode !== 'session' && rawAuthMode !== 'mock' && rawAuthMode !== 'hybrid') {
    throw new Error(
      `Invalid FLOWPILOT_AUTH_MODE: "${rawAuthMode}". Must be "session", "mock", or "hybrid".`
    );
  }

  const authMode: AuthMode = rawAuthMode;

  if (isProduction && authMode !== 'session') {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: FLOWPILOT_AUTH_MODE must be "session" in production. Detected: "${authMode}".`
    );
  }

  const rawSecret = env.SESSION_SECRET;
  if (isProduction) {
    validateSecretStrength(rawSecret || '', 'SESSION_SECRET');
  }

  const sessionSecret = rawSecret || DEFAULT_DEV_SECRET;
  const sessionSecretPrevious = env.SESSION_SECRET_PREVIOUS ? env.SESSION_SECRET_PREVIOUS.trim() : undefined;
  if (isProduction && sessionSecretPrevious) {
    validateSecretStrength(sessionSecretPrevious, 'SESSION_SECRET_PREVIOUS');
  }

  // Allowed origins
  let allowedOrigins: string[];
  if (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.trim().length > 0) {
    allowedOrigins = env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
  } else if (isProduction) {
    throw new Error(
      'CRITICAL SECURITY CONFIGURATION ERROR: ALLOWED_ORIGINS must be explicitly configured in production (e.g. "https://app.flowpilot.dev").'
    );
  } else {
    allowedOrigins = [...DEFAULT_ALLOWED_ORIGINS];
  }

  // Trusted proxy CIDRs
  let trustedProxyCidrs: string[];
  if (env.TRUSTED_PROXY_CIDRS && env.TRUSTED_PROXY_CIDRS.trim().length > 0) {
    trustedProxyCidrs = env.TRUSTED_PROXY_CIDRS.split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  } else {
    trustedProxyCidrs = [...DEFAULT_TRUSTED_PROXIES];
  }

  return {
    authMode,
    sessionSecret,
    sessionSecretPrevious: sessionSecretPrevious || undefined,
    allowedOrigins,
    trustedProxyCidrs,
    isProduction,
  };
}

let cachedConfig: SecurityConfig | null = null;

/**
 * Returns the cached security configuration, or loads and validates it.
 */
export function getSecurityConfig(forceReload = false): SecurityConfig {
  if (!cachedConfig || forceReload) {
    cachedConfig = validateSecurityConfig();
  }
  return cachedConfig;
}

/**
 * Reset config cache (primarily for tests).
 */
export function resetSecurityConfigCache(): void {
  cachedConfig = null;
}
