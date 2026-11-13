/**
 * Workspace Usage & Resource Limits Types - Phase 9F
 */

export type UsageTimeWindow = '7d' | '30d' | '90d' | 'custom';

export type ResourceLimitThresholdState =
  | 'NORMAL'         // < 80%
  | 'WARNING'        // 80% - 99%
  | 'CRITICAL'       // 100%
  | 'LIMIT_REACHED'  // > 100%
  | 'UNLIMITED';     // No limit set

export interface ResourceLimitStatus {
  metric: string;
  name: string;
  current: number;
  limit: number | null;
  percentage: number | null;
  state: ResourceLimitThresholdState;
  unit: string;
}

export interface WorkspaceLimits {
  workspaceId: string;
  maxWorkflows: number | null;
  maxMonthlyExecutions: number | null;
  maxConcurrentExecutions: number | null;
  maxActiveSchedules: number | null;
  maxAiTokensMonthly: number | null;
  maxAiCostMonthlyUsd: number | null;
  maxMonthlyIntegrationOps: number | null;
  updatedAt: string;
  updatedBy?: string;
}

export interface WorkspaceUsageSummary {
  workspaceId: string;
  period: {
    timeWindow: UsageTimeWindow;
    from: string;
    to: string;
  };
  workflows: {
    total: number;
    active: number;
    paused: number;
    draft: number;
  };
  executions: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
    concurrencyPeak: number;
    failureRate: number | null;
  };
  schedules: {
    total: number;
    active: number;
    paused: number;
    completed: number;
  };
  aiUsage: {
    totalRequests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    unpricedRequests: number;
  };
  integrations: {
    totalOperations: number;
    successful: number;
    failed: number;
    webhookDeliveries: number;
    configuredCredentials: number;
  };
  limits: Record<string, ResourceLimitStatus>;
  generatedAt: string;
}

export interface UsageTrendPoint {
  date: string;
  executions: number;
  successfulExecutions: number;
  failedExecutions: number;
  aiTokens: number;
  aiCostUsd: number;
  integrationOps: number;
}

