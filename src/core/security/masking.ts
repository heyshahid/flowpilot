const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /bearer/i,
  /private[_-]?key/i,
  /credit[_-]?card/i,
];

/**
 * Recursively masks sensitive fields in an object or record before logging or storing in traces.
 */
export function maskSensitiveData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    // Check if string looks like a Bearer token
    if (/^Bearer\s+[a-zA-Z0-9_\-\.]{10,}/i.test(input)) {
      return 'Bearer [REDACTED]' as unknown as T;
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => maskSensitiveData(item)) as unknown as T;
  }

  if (typeof input === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        masked[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }
    return masked as unknown as T;
  }

  return input;
}

