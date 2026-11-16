/**
 * FlowPilot Cryptographic Cookie Management
 * Phase 10C-B2: Database & Session Engine
 *
 * Implements RFC 6265bis compliant session and CSRF cookie builders:
 * - Production: '__Host-fp_session' (Secure, HttpOnly, SameSite=Lax, Path=/)
 * - Development: 'fp_session' fallback for unencrypted localhost
 * - CSRF: 'fp_csrf_token' readable cookie for double-submit verification
 */

import { getSecurityConfig } from './config';

export const SESSION_COOKIE_NAME_PROD = '__Host-fp_session';
export const SESSION_COOKIE_NAME_DEV = 'fp_session';
export const CSRF_COOKIE_NAME = 'fp_csrf_token';

export const DEFAULT_SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60; // 14 days (1,209,600s)
export const DEFAULT_CSRF_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours (86,400s)

export interface CookieOptions {
  isProduction?: boolean;
  maxAgeSeconds?: number;
  secure?: boolean;
  domain?: string;
  path?: string;
}

/**
 * Returns the appropriate session cookie name based on environment.
 */
export function getSessionCookieName(isProduction?: boolean): string {
  const isProd = isProduction !== undefined ? isProduction : getSecurityConfig().isProduction;
  return isProd ? SESSION_COOKIE_NAME_PROD : SESSION_COOKIE_NAME_DEV;
}

/**
 * Parses a raw Cookie header into key-value pairs.
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    if (key.length > 0) {
      // Handle quoted values
      cookies[key] = val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1) : val;
    }
  }

  return cookies;
}

/**
 * Builds a Set-Cookie header string for the active session.
 */
export function buildSessionCookie(token: string, options?: CookieOptions): string {
  const isProd = options?.isProduction !== undefined ? options.isProduction : getSecurityConfig().isProduction;
  const cookieName = getSessionCookieName(isProd);
  const maxAge = options?.maxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS;

  const parts = [
    `${cookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];

  if (isProd || options?.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Builds an expired Set-Cookie header string to revoke a session cookie on client logout.
 */
export function buildClearSessionCookie(options?: CookieOptions): string {
  const isProd = options?.isProduction !== undefined ? options.isProduction : getSecurityConfig().isProduction;
  const cookieName = getSessionCookieName(isProd);

  const parts = [
    `${cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];

  if (isProd || options?.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Builds a Set-Cookie header string for the double-submit CSRF token.
 * Note: CSRF token cookie is readable by JavaScript (omits HttpOnly).
 */
export function buildCsrfCookie(token: string, options?: CookieOptions): string {
  const isProd = options?.isProduction !== undefined ? options.isProduction : getSecurityConfig().isProduction;
  const maxAge = options?.maxAgeSeconds ?? DEFAULT_CSRF_MAX_AGE_SECONDS;

  const parts = [
    `${CSRF_COOKIE_NAME}=${token}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];

  if (isProd || options?.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Builds an expired Set-Cookie header string to clear the CSRF token.
 */
export function buildClearCsrfCookie(options?: CookieOptions): string {
  const isProd = options?.isProduction !== undefined ? options.isProduction : getSecurityConfig().isProduction;

  const parts = [
    `${CSRF_COOKIE_NAME}=`,
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];

  if (isProd || options?.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Extracts the raw session token from an incoming Cookie header.
 * Inspects both production (__Host-fp_session) and development (fp_session) names.
 */
export function extractSessionToken(
  cookieHeader: string | null | undefined,
  isProduction?: boolean
): string | null {
  const cookies = parseCookies(cookieHeader);
  const preferredName = getSessionCookieName(isProduction);

  if (cookies[preferredName]) {
    return cookies[preferredName];
  }

  // Fallback check across both standard names
  if (cookies[SESSION_COOKIE_NAME_PROD]) {
    return cookies[SESSION_COOKIE_NAME_PROD];
  }
  if (cookies[SESSION_COOKIE_NAME_DEV]) {
    return cookies[SESSION_COOKIE_NAME_DEV];
  }

  return null;
}

/**
 * Extracts the CSRF token from an incoming Cookie header.
 */
export function extractCsrfToken(cookieHeader: string | null | undefined): string | null {
  const cookies = parseCookies(cookieHeader);
  return cookies[CSRF_COOKIE_NAME] || null;
}

