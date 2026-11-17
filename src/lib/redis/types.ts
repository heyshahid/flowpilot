import { RedisOptions } from 'ioredis';

export type RedisConnectionRole = 'default' | 'worker' | 'subscriber' | 'publisher';

export interface RedisConfigOptions {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: boolean;
  connectTimeoutMs?: number;
  maxRetries?: number;
}

export interface RedisHealthTelemetry {
  version?: string;
  uptimeSeconds?: number;
  connectedClients?: number;
  usedMemoryHuman?: string;
  totalMemoryHuman?: string;
  role?: string;
}

export interface RedisHealthResult {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'disabled';
  latencyMs?: number;
  role?: RedisConnectionRole;
  telemetry?: RedisHealthTelemetry;
  error?: string;
  timestamp: string;
}
