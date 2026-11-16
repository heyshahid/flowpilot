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
 * Validates production environment variables.
 * In production mode (NODE_ENV === 'production'):
 * - FLOWPILOT_AUTH_MODE must be 'session'
 * - SESSION_SECRET must be configured, distinct from placeholder/dev secret, and at least 32 characters
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
    if (!rawSecret || rawSecret.trim().length === 0) {
      throw new Error(
        'CRITICAL SECURITY CONFIGURATION ERROR: SESSION_SECRET environment variable is missing in production.'
      );
    }
    if (rawSecret === DEFAULT_DEV_SECRET || rawSecret.includes('replace_with_') || rawSecret.includes('dev_only')) {
      throw new Error(
        'CRITICAL SECURITY CONFIGURATION ERROR: SESSION_SECRET is set to an insecure default/placeholder in production.'
      );
    }
    if (rawSecret.length < 32) {
      throw new Error(
        `CRITICAL SECURITY CONFIGURATION ERROR: SESSION_SECRET must be at least 32 characters (256-bit entropy). Current length: ${rawSecret.length}.`
      );
    }
  }

  const sessionSecret = rawSecret || DEFAULT_DEV_SECRET;
  const sessionSecretPrevious = env.SESSION_SECRET_PREVIOUS ? env.SESSION_SECRET_PREVIOUS.trim() : undefined;

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
