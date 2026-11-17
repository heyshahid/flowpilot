import { Redis } from 'ioredis';
import { getRedisClient } from './client';
import { RedisConnectionRole, RedisHealthResult, RedisHealthTelemetry } from './types';

/**
 * Checks Redis connectivity and non-destructive health metrics.
 *
 * Refinement 4:
 * A successful PING establishes basic connectivity.
 * Failure of optional INFO telemetry does NOT mark Redis as unavailable.
 */
export async function checkRedisHealth(
  clientOrRole?: Redis | RedisConnectionRole,
  timeoutMs = 2500
): Promise<RedisHealthResult> {
  const now = new Date().toISOString();

  // If Redis is disabled via explicit env flag
  if (process.env.FLOWPILOT_DISABLE_REDIS === 'true') {
    return {
      status: 'disabled',
      timestamp: now,
    };
  }

  const client: Redis =
    typeof clientOrRole === 'object' && clientOrRole !== null
      ? clientOrRole
      : getRedisClient(typeof clientOrRole === 'string' ? clientOrRole : 'default');

  const start = Date.now();

  try {
    // 1. Ensure connected or connect explicitly
    if (client.status === 'wait' || client.status === 'close') {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), timeoutMs)),
      ]);
    }

    // 2. Perform PING with timeout
    const pingPromise = client.ping();
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(`Redis PING timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const pingRes = await Promise.race([pingPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;

    if (pingRes !== 'PONG') {
      return {
        status: 'unhealthy',
        latencyMs,
        error: `Unexpected ping response: ${String(pingRes)}`,
        timestamp: now,
      };
    }

    // 3. Optional: Gather telemetry via INFO (failure here does NOT mark Redis unhealthy!)
    let telemetry: RedisHealthTelemetry | undefined = undefined;
    try {
      const infoStr = await Promise.race([
        client.info(),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 1000)),
      ]);

      if (infoStr) {
        telemetry = parseRedisInfo(infoStr);
      }
    } catch {
      // Telemetry failure is non-fatal: basic connectivity verified by PING
    }

    return {
      status: 'healthy',
      latencyMs,
      telemetry,
      timestamp: now,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    // Sanitize error: never leak host, credentials, or internal IPs
    const cleanError = sanitizeRedisErrorMessage(err?.message || 'Redis connection failed');

    return {
      status: 'unhealthy',
      latencyMs,
      error: cleanError,
      timestamp: now,
    };
  }
}

/**
 * Extracts safe operational metrics from Redis INFO output without leaking sensitive configuration.
 */
function parseRedisInfo(info: string): RedisHealthTelemetry {
  const result: RedisHealthTelemetry = {};
  const lines = info.split('\r\n');

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(':');
    if (parts.length < 2) continue;
    const key = parts[0].trim();
    const val = parts.slice(1).join(':').trim();

    if (key === 'redis_version') result.version = val;
    if (key === 'uptime_in_seconds') result.uptimeSeconds = parseInt(val, 10);
    if (key === 'connected_clients') result.connectedClients = parseInt(val, 10);
    if (key === 'used_memory_human') result.usedMemoryHuman = val;
    if (key === 'total_system_memory_human') result.totalMemoryHuman = val;
    if (key === 'role') result.role = val;
  }

  return result;
}

/**
 * Sanitizes connection errors to prevent leaking passwords or internal URLs.
 */
function sanitizeRedisErrorMessage(rawMessage: string): string {
  if (rawMessage.includes('password') || rawMessage.includes('auth') || rawMessage.includes('AUTH')) {
    return 'Authentication failure or invalid credentials';
  }
  if (rawMessage.includes('timed out') || rawMessage.includes('TIMEOUT')) {
    return 'Connection timed out';
  }
  if (rawMessage.includes('ECONNREFUSED')) {
    return 'Connection refused by target server';
  }
  if (rawMessage.includes('ENOTFOUND')) {
    return 'Host could not be resolved';
  }
  return rawMessage.replace(/:\/\/.*@/, '://***:***@');
}
