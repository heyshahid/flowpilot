import { RedisOptions } from 'ioredis';
import { RedisConfigOptions, RedisConnectionRole } from './types';

/**
 * Validates and resolves Redis configuration options from environment variables.
 *
 * Precedence:
 * 1. Explicit config passed as argument.
 * 2. REDIS_URL / REDIS_URI.
 * 3. Individual REDIS_HOST, REDIS_PORT, etc.
 *
 * In production (NODE_ENV === 'production'), requires explicit configuration.
 */
export function getRedisConfig(overrides?: Partial<RedisConfigOptions>): RedisConfigOptions {
  const url = overrides?.url || process.env.REDIS_URL || process.env.REDIS_URI;
  const host = overrides?.host || process.env.REDIS_HOST;
  const portStr = overrides?.port ? String(overrides.port) : process.env.REDIS_PORT;
  const port = portStr ? parseInt(portStr, 10) : undefined;
  const username = overrides?.username || process.env.REDIS_USERNAME;
  const password = overrides?.password || process.env.REDIS_PASSWORD;
  const dbStr = overrides?.db !== undefined ? String(overrides.db) : process.env.REDIS_DB;
  const db = dbStr !== undefined ? parseInt(dbStr, 10) : undefined;
  const tls = overrides?.tls ?? (process.env.REDIS_TLS === 'true' || url?.startsWith('rediss://'));
  const timeoutStr = overrides?.connectTimeoutMs ? String(overrides.connectTimeoutMs) : process.env.REDIS_CONNECT_TIMEOUT_MS;
  const connectTimeoutMs = timeoutStr ? parseInt(timeoutStr, 10) : 5000;
  const retriesStr = overrides?.maxRetries ? String(overrides.maxRetries) : process.env.REDIS_MAX_RETRIES;
  const maxRetries = retriesStr ? parseInt(retriesStr, 10) : 10;

  const isProduction = process.env.NODE_ENV === 'production';

  // Fail-closed in production if no Redis destination is provided
  if (isProduction && !url && !host) {
    throw new Error(
      'CRITICAL CONFIGURATION ERROR: Redis configuration is missing in production. ' +
      'Either REDIS_URL or REDIS_HOST must be provided.'
    );
  }

  return {
    url,
    host: host || (!url && !isProduction ? '127.0.0.1' : undefined),
    port: port || (!url && !isProduction ? 6379 : undefined),
    username,
    password,
    db: db ?? 0,
    tls,
    connectTimeoutMs,
    maxRetries,
  };
}

/**
 * Builds `ioredis` RedisOptions tailored specifically to the connection role.
 *
 * Refinement 1:
 * - 'default' / 'publisher': standard maxRetriesPerRequest with backoff.
 * - 'worker': maxRetriesPerRequest MUST BE null as required by BullMQ workers!
 * - 'subscriber': maxRetriesPerRequest is null to preserve blocking subscriptions.
 */
export function buildRedisOptions(
  role: RedisConnectionRole = 'default',
  configOverrides?: Partial<RedisConfigOptions>
): RedisOptions {
  const config = getRedisConfig(configOverrides);

  // Common retry strategy with exponential backoff and jitter
  const retryStrategy = (times: number) => {
    if (times > (config.maxRetries || 10)) {
      return null; // Stop retrying after threshold
    }
    const delay = Math.min(100 * Math.pow(2, times), 3000);
    return delay + Math.floor(Math.random() * 200);
  };

  const commonOptions: RedisOptions = {
    connectTimeout: config.connectTimeoutMs || 5000,
    lazyConnect: true, // Crucial: connections dial on demand
    enableReadyCheck: true,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
    retryStrategy,
  };

  if (config.tls) {
    commonOptions.tls = {};
  }

  // BullMQ Worker & Subscriber requirement: maxRetriesPerRequest MUST BE null
  if (role === 'worker' || role === 'subscriber') {
    commonOptions.maxRetriesPerRequest = null;
  } else {
    commonOptions.maxRetriesPerRequest = 3;
  }

  if (config.url) {
    // If URL is supplied, ioredis parses the URI and merges commonOptions
    return {
      ...commonOptions,
      // URL parsing will be handled directly by ioredis constructor or options
    };
  }

  return {
    ...commonOptions,
    host: config.host || '127.0.0.1',
    port: config.port || 6379,
    username: config.username,
    password: config.password,
    db: config.db ?? 0,
  };
}
