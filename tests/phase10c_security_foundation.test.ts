/**
 * FlowPilot Phase 10C-B1: Security Foundation Test Suite
 *
 * Verifies all 16 core security foundation capabilities:
 * 1. Argon2id correct and incorrect password verification
 * 2. Unique salts for identical passwords
 * 3. Dummy hash execution for nonexistent-account verification
 * 4. Semaphore concurrency limit
 * 5. Bounded queue and timeout behavior
 * 6. Secure token entropy and SHA-256 hashing
 * 7. Timing-safe comparison behavior
 * 8. CSRF signature validation
 * 9. CSRF session binding
 * 10. CSRF expiration and renewal
 * 11. Current and previous secret rotation
 * 12. Origin and Referer allowlist enforcement
 * 13. Rate-limit thresholds and progressive delays
 * 14. Trusted and untrusted proxy IP handling
 * 15. Production configuration validation
 * 16. Security event emission without an email dependency
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  DUMMY_PASSWORD_HASH,
  CryptographicSemaphore,
  SecurityOverloadError,
  SecurityTimeoutError,
} from '../src/lib/security/argon2';
import {
  generateSecureToken,
  generateSecureTokenBase64Url,
  hashToken,
  timingSafeEqual,
} from '../src/lib/security/tokens';
import {
  mintCsrfToken,
  parseCsrfToken,
  verifyCsrfToken,
  shouldRenewCsrfToken,
  validateOriginAndReferer,
  validateCsrfRequest,
  normalizeOrigin,
} from '../src/lib/security/csrf';
import {
  RateLimiterService,
  InMemoryRateLimiter,
  resolveClientIp,
  isIpInCidr,
  isTrustedProxy,
  SecurityAlertEvent,
} from '../src/lib/security/rateLimiter';
import { validateSecurityConfig } from '../src/lib/security/config';

describe('Phase 10C-B1: Security Foundation', () => {
  const TEST_SECRET = 'test_secret_32_bytes_long_for_signing_purposes_12345';
  const PREVIOUS_SECRET = 'previous_secret_32_bytes_long_for_rotation_67890';

  describe('1. Argon2id Password Hashing & Verification', () => {
    it('should hash and verify passwords correctly, rejecting incorrect passwords', async () => {
      const password = 'SuperSecretPassword2026!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.startsWith('$argon2id$')).toBe(true);

      // Verify correct password
      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);

      // Verify incorrect password
      const isInvalid = await verifyPassword(hash, 'WrongPassword2026!');
      expect(isInvalid).toBe(false);
    });

    it('should reject invalid or non-string inputs safely', async () => {
      await expect(hashPassword('')).rejects.toThrow('Password must be a non-empty string');
      expect(await verifyPassword('invalid_hash', 'pass')).toBe(false);
      // @ts-expect-error testing invalid input
      expect(await verifyPassword(null, 'pass')).toBe(false);
    });
  });

  describe('2. Unique Salts for Identical Passwords', () => {
    it('should generate distinct hashes with unique salts for identical passwords', async () => {
      const password = 'IdenticalPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword(hash1, password)).toBe(true);
      expect(await verifyPassword(hash2, password)).toBe(true);
    });
  });

  describe('3. Dummy Hash Execution for Non-Existent Account Verification', () => {
    it('should execute dummy hash verification and return false', async () => {
      expect(DUMMY_PASSWORD_HASH).toContain('$argon2id$v=19$m=65536,t=3,p=4$');

      const result = await verifyDummyPassword('attacker_guess_password');
      expect(result).toBe(false);
    });
  });

  describe('4. Cryptographic Semaphore Concurrency Limit', () => {
    it('should limit active concurrent operations to configured maximum', async () => {
      const maxConcurrent = 2;
      const sem = new CryptographicSemaphore(maxConcurrent, 10, 3000);

      let peakRunning = 0;
      let currentlyRunning = 0;

      const makeTask = (delayMs: number) => () =>
        sem.run(async () => {
          currentlyRunning++;
          peakRunning = Math.max(peakRunning, currentlyRunning);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          currentlyRunning--;
          return 'ok';
        });

      const promises = [makeTask(50)(), makeTask(50)(), makeTask(50)(), makeTask(50)()];
      const results = await Promise.all(promises);

      expect(results).toEqual(['ok', 'ok', 'ok', 'ok']);
      expect(peakRunning).toBeLessThanOrEqual(maxConcurrent);
    });
  });

  describe('5. Bounded Queue and Timeout Behavior', () => {
    it('should reject requests with SecurityOverloadError when queue is full', async () => {
      const sem = new CryptographicSemaphore(1, 2, 2000); // 1 running, max 2 queued

      let released = false;
      const releaseCallbacks: (() => void)[] = [];
      const releaseAll = () => {
        released = true;
        releaseCallbacks.forEach((cb) => cb());
      };

      const makeBlockingTask = () => () =>
        sem.run(
          () =>
            new Promise<string>((resolve) => {
              if (released) {
                resolve('done');
              } else {
                releaseCallbacks.push(() => resolve('done'));
              }
            })
        );

      // Task 1: occupies running slot
      const t1 = makeBlockingTask()();
      // Tasks 2 & 3: occupy queue slots (depth 2)
      const t2 = makeBlockingTask()();
      const t3 = makeBlockingTask()();

      expect(sem.getStatus().running).toBe(1);
      expect(sem.getStatus().queued).toBe(2);

      // Task 4: exceeds queue depth 2 -> should reject immediately
      await expect(makeBlockingTask()()).rejects.toThrow(SecurityOverloadError);

      // Release all running and queued tasks
      releaseAll();
      await Promise.all([t1, t2, t3]);
      await new Promise((r) => setTimeout(r, 20));
      expect(sem.getStatus().running).toBe(0);
      expect(sem.getStatus().queued).toBe(0);
    });

    it('should reject queued requests with SecurityTimeoutError when timeout expires', async () => {
      const timeoutMs = 60;
      const sem = new CryptographicSemaphore(1, 5, timeoutMs);

      // Task 1 blocks the single slot for 150ms
      const t1 = sem.run(() => new Promise((resolve) => setTimeout(resolve, 150)));

      // Task 2 waits in queue, timeout is 60ms
      const t2 = sem.run(async () => 'should not complete');

      await expect(t2).rejects.toThrow(SecurityTimeoutError);
      await t1;
    });
  });

  describe('6. Secure Token Entropy and SHA-256 Hashing', () => {
    it('should generate secure tokens with 256 bits of entropy', () => {
      const tokenHex = generateSecureToken(32);
      expect(tokenHex).toHaveLength(64); // 32 bytes = 64 hex chars

      const tokenBase64 = generateSecureTokenBase64Url(32);
      expect(tokenBase64.length).toBeGreaterThanOrEqual(42);

      // Uniqueness check
      const set = new Set<string>();
      for (let i = 0; i < 50; i++) {
        set.add(generateSecureToken(32));
      }
      expect(set.size).toBe(50);
    });

    it('should hash tokens deterministically with SHA-256', () => {
      const raw = 'test_token_value_abc123';
      const hash1 = hashToken(raw);
      const hash2 = hashToken(raw);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);

      const hash3 = hashToken('different_token_value');
      expect(hash1).not.toBe(hash3);

      expect(() => hashToken('')).toThrow('Cannot hash empty');
    });
  });

  describe('7. Timing-Safe Comparison Behavior', () => {
    it('should return true for identical strings and false for differing strings', () => {
      expect(timingSafeEqual('abcdef123456', 'abcdef123456')).toBe(true);
      expect(timingSafeEqual('abcdef123456', 'abcdef123457')).toBe(false);
      expect(timingSafeEqual('short', 'much_longer_string')).toBe(false);
      expect(timingSafeEqual('', '')).toBe(true);
      // @ts-expect-error testing invalid input
      expect(timingSafeEqual(null, 'test')).toBe(false);
    });
  });

  describe('8. CSRF Signature Validation', () => {
    it('should mint and verify valid CSRF tokens', () => {
      const sessionId = 'sess_user_alpha_123';
      const token = mintCsrfToken(sessionId, TEST_SECRET);

      expect(token).toBeDefined();
      const parsed = parseCsrfToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.sessionId).toBe(sessionId);

      const verification = verifyCsrfToken(token, sessionId, { activeSecret: TEST_SECRET });
      expect(verification.valid).toBe(true);
    });

    it('should reject tampered CSRF tokens with invalid signatures', () => {
      const sessionId = 'sess_user_alpha_123';
      const token = mintCsrfToken(sessionId, TEST_SECRET);

      const parsed = parseCsrfToken(token)!;
      // Tamper with nonce
      const tamperedPayload = `${parsed.sessionId}:${parsed.timestamp}:badnonce:${parsed.signature}`;
      const tamperedToken = Buffer.from(tamperedPayload, 'utf8').toString('base64url');

      const verification = verifyCsrfToken(tamperedToken, sessionId, { activeSecret: TEST_SECRET });
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('INVALID_SIGNATURE');
    });
  });

  describe('9. CSRF Session Binding', () => {
    it('should reject CSRF tokens minted for a different session', () => {
      const tokenAlpha = mintCsrfToken('sess_user_alpha', TEST_SECRET);

      // Verify tokenAlpha against session_beta
      const verification = verifyCsrfToken(tokenAlpha, 'sess_user_beta', { activeSecret: TEST_SECRET });
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('SESSION_MISMATCH');
    });
  });

  describe('10. CSRF Expiration and Renewal', () => {
    it('should reject tokens that exceed the 24-hour freshness window', () => {
      const sessionId = 'sess_123';
      const now = Date.now();
      const token = mintCsrfToken(sessionId, TEST_SECRET);

      // Valid within 24h
      const validCheck = verifyCsrfToken(token, sessionId, {
        activeSecret: TEST_SECRET,
        now: now + 23 * 60 * 60 * 1000,
      });
      expect(validCheck.valid).toBe(true);

      // Expired at 25h
      const expiredCheck = verifyCsrfToken(token, sessionId, {
        activeSecret: TEST_SECRET,
        now: now + 25 * 60 * 60 * 1000,
      });
      expect(expiredCheck.valid).toBe(false);
      expect(expiredCheck.reason).toBe('EXPIRED');
    });

    it('should trigger rolling renewal for tokens older than 12 hours', () => {
      const token = mintCsrfToken('sess_123', TEST_SECRET);
      const parsed = parseCsrfToken(token)!;

      // At 6 hours -> no renewal needed
      expect(shouldRenewCsrfToken(token, 12 * 3600 * 1000, parsed.timestamp + 6 * 3600 * 1000)).toBe(
        false
      );

      // At 13 hours -> renewal needed
      expect(shouldRenewCsrfToken(token, 12 * 3600 * 1000, parsed.timestamp + 13 * 3600 * 1000)).toBe(
        true
      );
    });
  });

  describe('11. Current and Previous Secret Rotation', () => {
    it('should verify tokens minted with previousSecret during key rotation', () => {
      const sessionId = 'sess_rot_123';
      // Mint token with old secret
      const tokenWithOldSecret = mintCsrfToken(sessionId, PREVIOUS_SECRET);

      // Verify with active = TEST_SECRET, previous = PREVIOUS_SECRET
      const result = verifyCsrfToken(tokenWithOldSecret, sessionId, {
        activeSecret: TEST_SECRET,
        previousSecret: PREVIOUS_SECRET,
      });

      expect(result.valid).toBe(true);
      expect(result.isFromPreviousSecret).toBe(true);

      // Token minted with new secret
      const tokenWithNewSecret = mintCsrfToken(sessionId, TEST_SECRET);
      const newResult = verifyCsrfToken(tokenWithNewSecret, sessionId, {
        activeSecret: TEST_SECRET,
        previousSecret: PREVIOUS_SECRET,
      });
      expect(newResult.valid).toBe(true);
      expect(newResult.isFromPreviousSecret).toBe(false);

      // Third unknown secret should be rejected
      const thirdSecretResult = verifyCsrfToken(tokenWithOldSecret, sessionId, {
        activeSecret: TEST_SECRET,
        previousSecret: 'unrelated_secret_key_12345678901234',
      });
      expect(thirdSecretResult.valid).toBe(false);
    });
  });

  describe('12. Origin and Referer Allowlist Enforcement', () => {
    const allowed = ['https://app.flowpilot.dev', 'http://localhost:3000'];

    it('should normalize origins and validate matching origins', () => {
      expect(normalizeOrigin('https://app.flowpilot.dev/')).toBe('https://app.flowpilot.dev');
      expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');

      expect(validateOriginAndReferer('https://app.flowpilot.dev', null, allowed)).toBe(true);
      expect(validateOriginAndReferer('https://evil.com', null, allowed)).toBe(false);
    });

    it('should fall back to Referer when Origin is omitted', () => {
      expect(
        validateOriginAndReferer(null, 'https://app.flowpilot.dev/workflows/builder', allowed)
      ).toBe(true);
      expect(validateOriginAndReferer(null, 'https://evil.com/attacker-page', allowed)).toBe(false);
      expect(validateOriginAndReferer(null, null, allowed)).toBe(false);
    });

    it('should reject state-changing requests with forbidden origin in validateCsrfRequest', () => {
      const result = validateCsrfRequest({
        method: 'POST',
        origin: 'https://attacker.site',
        sessionId: 'sess_123',
        csrfToken: 'some_token',
        allowedOrigins: allowed,
      });

      expect(result.allowed).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.errorCode).toBe('FORBIDDEN_ORIGIN');
    });

    it('should bypass CSRF for Bearer tokens and safe GET requests', () => {
      const getResult = validateCsrfRequest({
        method: 'GET',
        sessionId: null,
      });
      expect(getResult.allowed).toBe(true);

      const bearerResult = validateCsrfRequest({
        method: 'POST',
        authType: 'bearer',
      });
      expect(bearerResult.allowed).toBe(true);
    });
  });

  describe('13. Rate-Limit Thresholds and Progressive Delays', () => {
    let limiter: RateLimiterService;

    beforeEach(() => {
      limiter = new RateLimiterService(new InMemoryRateLimiter());
    });

    it('should allow up to 10 attempts/min with 0ms delay', async () => {
      const ip = '198.51.100.1';
      const now = 1000000;

      for (let i = 1; i <= 10; i++) {
        const res = await limiter.checkLoginAttempt(ip, 'user@example.com', now + i * 1000);
        expect(res.allowed).toBe(true);
        expect(res.delayMs).toBe(0);
        expect(res.status).toBe(200);
      }
    });

    it('should enforce progressive delays for attempts 11-20 in 15 minutes', async () => {
      const ip = '198.51.100.2';
      let time = 1000000;

      // Exhaust first 10
      for (let i = 1; i <= 10; i++) {
        await limiter.checkLoginAttempt(ip, 'user@example.com', time);
        time += 1000;
      }

      // Advance time past 1 min so 1m limiter does not trigger
      time += 70000;

      // Attempt 11: 1s delay
      const res11 = await limiter.checkLoginAttempt(ip, 'user@example.com', time);
      expect(res11.allowed).toBe(true);
      expect(res11.delayMs).toBe(1000);

      // Advance to attempt 14: 2s delay
      for (let i = 12; i <= 13; i++) {
        time += 10000;
        await limiter.checkLoginAttempt(ip, 'user@example.com', time);
      }
      time += 10000;
      const res14 = await limiter.checkLoginAttempt(ip, 'user@example.com', time);
      expect(res14.allowed).toBe(true);
      expect(res14.delayMs).toBe(2000);

      // Advance to attempt 18: 4s delay
      for (let i = 15; i <= 17; i++) {
        time += 10000;
        await limiter.checkLoginAttempt(ip, 'user@example.com', time);
      }
      time += 10000;
      const res18 = await limiter.checkLoginAttempt(ip, 'user@example.com', time);
      expect(res18.allowed).toBe(true);
      expect(res18.delayMs).toBe(4000);

      // Attempt 21: blocked with HTTP 429
      for (let i = 19; i <= 20; i++) {
        time += 10000;
        await limiter.checkLoginAttempt(ip, 'user@example.com', time);
      }
      time += 10000;
      const res21 = await limiter.checkLoginAttempt(ip, 'user@example.com', time);
      expect(res21.allowed).toBe(false);
      expect(res21.status).toBe(429);
      expect(res21.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('should enforce account protection challenges after 5 consecutive failed logins without global lockout', async () => {
      const account = 'target@company.com';
      const ipAttacker = '198.51.100.99';
      const ipLegit = '203.0.113.50';

      // 4 failed logins from attacker
      for (let i = 0; i < 4; i++) {
        await limiter.recordLoginFailure(ipAttacker, account);
      }

      let check = await limiter.checkLoginAttempt(ipAttacker, account);
      expect(check.isChallenged).toBe(false);

      // 5th failed login
      await limiter.recordLoginFailure(ipAttacker, account);
      check = await limiter.checkLoginAttempt(ipAttacker, account);
      expect(check.isChallenged).toBe(true);
      expect(check.delayMs).toBeGreaterThanOrEqual(2000);

      // Legitimate user from another IP is NOT locked out (can still connect, though flagged for challenge verification)
      const legitCheck = await limiter.checkLoginAttempt(ipLegit, account);
      expect(legitCheck.allowed).toBe(true);

      // Success clears failures
      await limiter.recordLoginSuccess(account);
      const afterSuccess = await limiter.checkLoginAttempt(ipAttacker, account);
      expect(afterSuccess.isChallenged).toBe(false);
    });

    it('should limit password reset and email resend requests to 3 per hour', async () => {
      const account = 'reset@example.com';
      const now = 2000000;

      // 3 attempts allowed
      for (let i = 0; i < 3; i++) {
        const res = await limiter.checkPasswordResetLimit(account, now + i * 1000);
        expect(res.allowed).toBe(true);
      }

      // 4th attempt rejected
      const res4 = await limiter.checkPasswordResetLimit(account, now + 4000);
      expect(res4.allowed).toBe(false);
      expect(res4.status).toBe(429);
      expect(res4.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('14. Trusted and Untrusted Proxy IP Handling', () => {
    const trustedProxies = ['127.0.0.1/32', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

    it('should identify trusted CIDR ranges accurately', () => {
      expect(isIpInCidr('127.0.0.1', '127.0.0.1/32')).toBe(true);
      expect(isIpInCidr('10.5.20.1', '10.0.0.0/8')).toBe(true);
      expect(isIpInCidr('192.168.1.100', '192.168.0.0/16')).toBe(true);
      expect(isIpInCidr('203.0.113.5', '10.0.0.0/8')).toBe(false);
      expect(isTrustedProxy('10.1.2.3', trustedProxies)).toBe(true);
      expect(isTrustedProxy('203.0.113.195', trustedProxies)).toBe(false);
    });

    it('should resolve client IP from x-forwarded-for when connected via trusted proxy', () => {
      const socketPeer = '10.0.0.2'; // Trusted proxy
      const xForwardedFor = '203.0.113.195, 172.16.0.5';

      const resolved = resolveClientIp(socketPeer, xForwardedFor, trustedProxies);
      expect(resolved).toBe('203.0.113.195');
    });

    it('should IGNORE x-forwarded-for when connected via untrusted peer', () => {
      const socketPeer = '198.51.100.55'; // Untrusted direct peer
      const spoofedHeader = '1.1.1.1, 8.8.8.8';

      const resolved = resolveClientIp(socketPeer, spoofedHeader, trustedProxies);
      // Must ignore spoofed header and return actual connection socket peer
      expect(resolved).toBe('198.51.100.55');
    });
  });

  describe('15. Production Configuration Validation', () => {
    it('should reject missing or weak SESSION_SECRET in production mode', () => {
      expect(() => {
        validateSecurityConfig({
          NODE_ENV: 'production',
          FLOWPILOT_AUTH_MODE: 'session',
          SESSION_SECRET: '',
          ALLOWED_ORIGINS: 'https://app.flowpilot.dev',
        });
      }).toThrow('SESSION_SECRET environment variable is missing in production');

      expect(() => {
        validateSecurityConfig({
          NODE_ENV: 'production',
          FLOWPILOT_AUTH_MODE: 'session',
          SESSION_SECRET: 'replace_with_secure_random_64_character_session_secret_here',
          ALLOWED_ORIGINS: 'https://app.flowpilot.dev',
        });
      }).toThrow('SESSION_SECRET is set to an insecure default/placeholder');

      expect(() => {
        validateSecurityConfig({
          NODE_ENV: 'production',
          FLOWPILOT_AUTH_MODE: 'session',
          SESSION_SECRET: 'too_short_secret',
          ALLOWED_ORIGINS: 'https://app.flowpilot.dev',
        });
      }).toThrow('must be at least 32 characters');
    });

    it('should reject non-session FLOWPILOT_AUTH_MODE in production', () => {
      expect(() => {
        validateSecurityConfig({
          NODE_ENV: 'production',
          FLOWPILOT_AUTH_MODE: 'mock',
          SESSION_SECRET: 'a_very_secure_and_sufficiently_long_production_session_secret_123',
          ALLOWED_ORIGINS: 'https://app.flowpilot.dev',
        });
      }).toThrow('FLOWPILOT_AUTH_MODE must be "session" in production');
    });

    it('should accept valid production configuration', () => {
      const validSecret = 'valid_production_session_secret_32_bytes_long_entropy!';
      const config = validateSecurityConfig({
        NODE_ENV: 'production',
        FLOWPILOT_AUTH_MODE: 'session',
        SESSION_SECRET: validSecret,
        ALLOWED_ORIGINS: 'https://app.flowpilot.dev',
      });

      expect(config.isProduction).toBe(true);
      expect(config.authMode).toBe('session');
      expect(config.sessionSecret).toBe(validSecret);
      expect(config.allowedOrigins).toEqual(['https://app.flowpilot.dev']);
    });
  });

  describe('16. Security Event Emission without Email Dependency', () => {
    it('should emit decoupled security alert events for B3 email adapter consumption', async () => {
      const limiter = new RateLimiterService(new InMemoryRateLimiter());
      const emittedEvents: SecurityAlertEvent[] = [];

      // Register B1 event listener (simulates B3 email adapter connection)
      limiter.onSecurityAlert((event) => {
        emittedEvents.push(event);
      });

      const ip = '198.51.100.77';
      const account = 'victim@example.com';

      // Trigger 5 failed logins to generate ACCOUNT_CHALLENGE
      for (let i = 0; i < 5; i++) {
        await limiter.recordLoginFailure(ip, account);
      }

      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].type).toBe('ACCOUNT_CHALLENGE');
      expect(emittedEvents[0].identifier).toBe(account);
      expect(emittedEvents[0].attemptCount).toBe(5);
      expect(emittedEvents[0].ip).toBe(ip);

      // Trigger brute-force IP rate limit (>20 attempts)
      for (let i = 0; i < 21; i++) {
        await limiter.checkLoginAttempt(ip, account);
      }

      const bruteForceEvent = emittedEvents.find((e) => e.type === 'BRUTE_FORCE_IP');
      expect(bruteForceEvent).toBeDefined();
      expect(bruteForceEvent?.ip).toBe(ip);
    });

    it('should not throw if security alert listener encounters an error', async () => {
      const limiter = new RateLimiterService(new InMemoryRateLimiter());
      limiter.onSecurityAlert(() => {
        throw new Error('Listener connection failed (e.g. SMTP down)');
      });

      // Must not throw or crash authentication
      await expect(
        (async () => {
          for (let i = 0; i < 5; i++) {
            await limiter.recordLoginFailure('198.51.100.88', 'test@domain.com');
          }
        })()
      ).resolves.not.toThrow();
    });
  });
});
