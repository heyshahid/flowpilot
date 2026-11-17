import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import { getRedisConfig, buildRedisOptions } from '../src/lib/redis/config';
import {
  getRedisClient,
  createDedicatedRedisClient,
  closeAllRedisConnections,
  setRedisClientForTesting,
  resetRedisClientPoolForTesting,
} from '../src/lib/redis/client';
import { checkRedisHealth } from '../src/lib/redis/health';
import { GET as getRedisHealthRoute } from '../src/app/api/v1/health/redis/route';
import { NextRequest } from 'next/server';
import { AuthContextManager } from '../src/core/auth/authContext';

describe('Phase 10D-B: Redis Infrastructure Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetRedisClientPoolForTesting();
  });

  afterEach(async () => {
    await closeAllRedisConnections();
    process.env = { ...originalEnv };
    AuthContextManager.resetRepositoriesForTesting();
  });

  describe('1. Configuration & URL Parsing', () => {
    it('should parse unified REDIS_URL and default settings', () => {
      process.env.REDIS_URL = 'redis://default:secret123@redis.flowpilot.internal:6380/2';
      const config = getRedisConfig();

      expect(config.url).toBe('redis://default:secret123@redis.flowpilot.internal:6380/2');
      expect(config.connectTimeoutMs).toBe(5000);
      expect(config.maxRetries).toBe(10);
    });

    it('should parse individual environment variables when REDIS_URL is absent', () => {
      delete process.env.REDIS_URL;
      delete process.env.REDIS_URI;
      process.env.REDIS_HOST = '10.0.1.50';
      process.env.REDIS_PORT = '6385';
      process.env.REDIS_USERNAME = 'fp_user';
      process.env.REDIS_PASSWORD = 'vault_password';
      process.env.REDIS_DB = '3';
      process.env.REDIS_TLS = 'true';

      const config = getRedisConfig();
      expect(config.host).toBe('10.0.1.50');
      expect(config.port).toBe(6385);
      expect(config.username).toBe('fp_user');
      expect(config.password).toBe('vault_password');
      expect(config.db).toBe(3);
      expect(config.tls).toBe(true);
    });

    it('should fail closed in production if no Redis destination is configured', () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.REDIS_URL;
      delete process.env.REDIS_URI;
      delete process.env.REDIS_HOST;

      expect(() => getRedisConfig()).toThrow(/CRITICAL CONFIGURATION ERROR: Redis configuration is missing in production/);
    });

    it('should configure maxRetriesPerRequest: null specifically for worker roles (Refinement 1)', () => {
      // Default / API role has standard retries
      const defaultOpts = buildRedisOptions('default');
      expect(defaultOpts.maxRetriesPerRequest).toBe(3);

      // Worker role MUST have maxRetriesPerRequest: null for BullMQ compatibility
      const workerOpts = buildRedisOptions('worker');
      expect(workerOpts.maxRetriesPerRequest).toBeNull();

      // Subscriber role also requires null for blocking pub/sub
      const subOpts = buildRedisOptions('subscriber');
      expect(subOpts.maxRetriesPerRequest).toBeNull();
    });
  });

  describe('2. Client Lifecycle & Connection Management', () => {
    it('should return cached singleton instance for identical connection roles', () => {
      const mockClient1 = new RedisMock();
      setRedisClientForTesting(mockClient1 as any, 'default');

      const clientA = getRedisClient('default');
      expect(clientA).toBe(mockClient1);
    });

    it('should create dedicated clients when explicitly requested for background workers', () => {
      const workerClient = createDedicatedRedisClient('worker', { host: '127.0.0.1', port: 6379 });
      expect(workerClient).toBeDefined();
      expect(workerClient.options.maxRetriesPerRequest).toBeNull();
    });

    it('should gracefully close all pooled connections via closeAllRedisConnections', async () => {
      const mockClient = new RedisMock();
      setRedisClientForTesting(mockClient as any, 'default');

      await expect(closeAllRedisConnections()).resolves.toBeUndefined();
    });
  });

  describe('3. Health Monitoring & Non-Fatal Telemetry (Refinement 4)', () => {
    it('should report healthy when PING succeeds, successfully extracting safe telemetry', async () => {
      const mockClient = new RedisMock();
      // Provide custom info response
      vi.spyOn(mockClient, 'info').mockResolvedValue(
        `# Server\r\nredis_version:7.2.4\r\nuptime_in_seconds:3600\r\n# Memory\r\nused_memory_human:4.5M\r\n`
      );

      const health = await checkRedisHealth(mockClient as any);
      expect(health.status).toBe('healthy');
      expect(health.telemetry?.version).toBe('7.2.4');
      expect(health.telemetry?.usedMemoryHuman).toBe('4.5M');
      expect(health.error).toBeUndefined();
    });

    it('should report healthy even if optional INFO telemetry fails (Refinement 4)', async () => {
      const mockClient = new RedisMock();
      vi.spyOn(mockClient, 'ping').mockResolvedValue('PONG');
      vi.spyOn(mockClient, 'info').mockRejectedValue(new Error('INFO command disabled by security proxy'));

      const health = await checkRedisHealth(mockClient as any);
      // PING succeeded -> status is still HEALTHY
      expect(health.status).toBe('healthy');
      expect(health.telemetry).toBeUndefined();
      expect(health.error).toBeUndefined();
    });

    it('should report unhealthy with sanitized error when connection fails or times out', async () => {
      const mockClient = new RedisMock();
      vi.spyOn(mockClient, 'ping').mockRejectedValue(new Error('Connection refused by target server: 10.0.0.99 with password=supersecret'));

      const health = await checkRedisHealth(mockClient as any);
      expect(health.status).toBe('unhealthy');
      // Passwords must never leak in error messages
      expect(health.error).not.toContain('supersecret');
      expect(health.error).toBe('Authentication failure or invalid credentials');
    });

    it('should report disabled status when FLOWPILOT_DISABLE_REDIS is set', async () => {
      process.env.FLOWPILOT_DISABLE_REDIS = 'true';
      const health = await checkRedisHealth();
      expect(health.status).toBe('disabled');
    });
  });

  describe('4. Health API Endpoint Security & Authorization (Refinement 3)', () => {
    it('should reject unauthenticated requests to /api/v1/health/redis with 401', async () => {
      // In production mode, AuthContextManager enforces session verification and fails with UnauthorizedError (401)
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.SESSION_SECRET;
      const prevOrigins = process.env.ALLOWED_ORIGINS;
      try {
        (process.env as any).NODE_ENV = 'production';
        process.env.SESSION_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
        process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
        const req = new NextRequest('http://localhost:3000/api/v1/health/redis');
        const res = await getRedisHealthRoute(req);
        expect(res.status).toBe(401);
      } finally {
        (process.env as any).NODE_ENV = prevEnv;
        if (prevSecret !== undefined) process.env.SESSION_SECRET = prevSecret;
        else delete process.env.SESSION_SECRET;
        if (prevOrigins !== undefined) process.env.ALLOWED_ORIGINS = prevOrigins;
        else delete process.env.ALLOWED_ORIGINS;
      }
    });

    it('should reject non-admin / non-owner roles (e.g. VIEWER, EDITOR) with 403 Forbidden', async () => {
      // Mock resolve to return a VIEWER role
      vi.spyOn(AuthContextManager, 'resolve').mockResolvedValueOnce({
        user: { id: 'usr_viewer', email: 'viewer@flowpilot.dev', name: 'Viewer', createdAt: new Date().toISOString() },
        workspace: { id: 'ws_test', name: 'Test WS', slug: 'test', ownerId: 'usr_owner', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        membership: { workspaceId: 'ws_test', userId: 'usr_viewer', role: 'VIEWER', status: 'active', joinedAt: new Date().toISOString() },
        role: 'VIEWER',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/v1/health/redis');
      const res = await getRedisHealthRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('FORBIDDEN');
      expect(json.error).toContain('administrative privileges');
    });

    it('should allow ADMIN / OWNER and return sanitized health metrics', async () => {
      const mockClient = new RedisMock();
      setRedisClientForTesting(mockClient as any, 'default');

      vi.spyOn(AuthContextManager, 'resolve').mockResolvedValueOnce({
        user: { id: 'usr_admin', email: 'admin@flowpilot.dev', name: 'Admin', createdAt: new Date().toISOString() },
        workspace: { id: 'ws_test', name: 'Test WS', slug: 'test', ownerId: 'usr_owner', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        membership: { workspaceId: 'ws_test', userId: 'usr_admin', role: 'ADMIN', status: 'active', joinedAt: new Date().toISOString() },
        role: 'ADMIN',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/v1/health/redis');
      const res = await getRedisHealthRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('healthy');
      // Verify no sensitive hostnames or passwords in payload
      expect(JSON.stringify(json)).not.toContain('password');
    });
  });
});
