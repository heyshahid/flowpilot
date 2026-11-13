import crypto from 'crypto';

export class WebhookSecurityManager {
  // In-memory sliding window rate limiter
  private static rateLimitBuckets = new Map<string, number[]>();

  /**
   * Generates a cryptographically strong, unguessable webhook token.
   */
  public static generateWebhookToken(): string {
    return `whk_${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Generates a cryptographically strong HMAC secret.
   */
  public static generateWebhookSecret(): string {
    return `fpsec_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Computes an HMAC-SHA256 signature for an outbound/test payload.
   */
  public static computeHmacSignature(rawPayload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawPayload, 'utf8');
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Verifies an incoming HMAC-SHA256 signature against raw payload.
   * Uses timing-safe string comparison to protect against timing attacks.
   */
  public static verifyHmacSignature(
    rawPayload: string,
    signatureHeader: string,
    secret: string
  ): boolean {
    if (!signatureHeader || !secret) return false;

    // Normalize header format (e.g. "sha256=abcdef..." or raw "abcdef...")
    let signature = signatureHeader.trim();
    if (signature.startsWith('sha256=')) {
      signature = signature.substring(7);
    }

    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawPayload, 'utf8');
      const expectedSignature = hmac.digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const actualBuffer = Buffer.from(signature, 'hex');

      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Validates timestamp header to prevent replay attacks within tolerance window (default 300s = 5m).
   */
  public static validateTimestamp(
    timestampHeader: string | number,
    toleranceSeconds: number = 300
  ): { valid: boolean; ageSeconds: number } {
    let timestampMs: number;

    if (typeof timestampHeader === 'number') {
      timestampMs = timestampHeader > 1e11 ? timestampHeader : timestampHeader * 1000;
    } else {
      const parsed = parseInt(timestampHeader, 10);
      if (isNaN(parsed)) {
        // Try parsing ISO date
        const dateMs = Date.parse(timestampHeader);
        if (isNaN(dateMs)) {
          return { valid: false, ageSeconds: Infinity };
        }
        timestampMs = dateMs;
      } else {
        timestampMs = parsed > 1e11 ? parsed : parsed * 1000;
      }
    }

    const now = Date.now();
    const ageSeconds = Math.abs(now - timestampMs) / 1000;

    return {
      valid: ageSeconds <= toleranceSeconds,
      ageSeconds,
    };
  }

  /**
   * Sliding window rate limiter: allows up to `limitPerMin` requests per minute per webhook.
   */
  public static checkRateLimit(
    token: string,
    limitPerMin: number = 60
  ): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const windowMs = 60 * 1000;

    const timestamps = this.rateLimitBuckets.get(token) || [];
    // Filter out timestamps outside window
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= limitPerMin) {
      this.rateLimitBuckets.set(token, recent);
      return { allowed: false, remaining: 0 };
    }

    recent.push(now);
    this.rateLimitBuckets.set(token, recent);

    return {
      allowed: true,
      remaining: limitPerMin - recent.length,
    };
  }
}
