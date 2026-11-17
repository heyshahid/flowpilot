import { Redis, RedisOptions } from 'ioredis';
import { buildRedisOptions, getRedisConfig } from './config';
import { RedisConfigOptions, RedisConnectionRole } from './types';

declare global {
  // eslint-disable-next-line no-var
  var __flowpilot_redis_clients: Map<string, Redis> | undefined;
}

const clientPool = globalThis.__flowpilot_redis_clients ?? new Map<string, Redis>();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__flowpilot_redis_clients = clientPool;
}

/**
 * Factory to create or retrieve a cached Redis client connection tailored to a specific role.
 */
export function getRedisClient(
  role: RedisConnectionRole = 'default',
  overrides?: Partial<RedisConfigOptions>
): Redis {
  const cacheKey = `${role}_${overrides?.url || overrides?.host || 'default'}_${overrides?.db || 0}`;

  if (clientPool.has(cacheKey)) {
    const existing = clientPool.get(cacheKey)!;
    if (existing.status !== 'end') {
      return existing;
    }
  }

  const config = getRedisConfig(overrides);
  const options = buildRedisOptions(role, overrides);

  let client: Redis;
  if (config.url) {
    client = new Redis(config.url, options);
  } else {
    client = new Redis(options);
  }

  // Prevent unhandled error crashes from connection drops
  client.on('error', (err: any) => {
    // Suppress unhandled exception in background reconnects
    // Error will be caught explicitly by callers and health checks
  });

  clientPool.set(cacheKey, client);
  return client;
}

/**
 * Creates a fresh, isolated Redis client instance (e.g. for dedicated BullMQ workers).
 */
export function createDedicatedRedisClient(
  role: RedisConnectionRole = 'worker',
  overrides?: Partial<RedisConfigOptions>
): Redis {
  const config = getRedisConfig(overrides);
  const options = buildRedisOptions(role, overrides);

  let client: Redis;
  if (config.url) {
    client = new Redis(config.url, options);
  } else {
    client = new Redis(options);
  }

  client.on('error', () => {});
  return client;
}

/**
 * Safely disconnects and removes all pooled Redis client connections.
 */
export async function closeAllRedisConnections(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [key, client] of clientPool.entries()) {
    if (client.status !== 'end') {
      const p = Promise.race([
        client.quit().catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)).then(() => {
          try {
            client.disconnect();
          } catch {}
        }),
      ]).then(() => {
        clientPool.delete(key);
      });
      closePromises.push(p);
    } else {
      clientPool.delete(key);
    }
  }

  await Promise.all(closePromises);
}

/**
 * Allows automated test runners to inject synthetic / mocked Redis clients into the pool.
 */
export function setRedisClientForTesting(client: Redis, role: RedisConnectionRole = 'default'): void {
  const cacheKey = `${role}_default_0`;
  clientPool.set(cacheKey, client);
}

/**
 * Clears the test client pool.
 */
export function resetRedisClientPoolForTesting(): void {
  clientPool.clear();
}
