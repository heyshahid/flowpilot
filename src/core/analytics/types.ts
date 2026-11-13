import { WorkflowExecutionStatus } from '../execution/types';
import { AIProviderId } from '../ai/types';

export type TimeWindow = '24h' | '7d' | '30d' | '90d' | 'custom';

export type TimeBucketInterval = 'hour' | 'day' | 'week' | 'month';

export interface DateRangeFilter {
  startDate: string; // ISO 8601
  endDate: string;   // ISO 8601
  timezone?: string; // Default 'UTC'
}

export interface AnalyticsQueryOptions {
  workspaceId: string;
  workflowId?: string;
  timeWindow?: TimeWindow;
  customDateRange?: DateRangeFilter;
}

export interface MetricValue<T = number> {
  value: T;
  formatted: string;
  sampleSize: number;
  isAvailable: boolean;
  notes?: string;
}

export interface ExecutionSummaryMetrics {
  totalExecutions: number;
  terminalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  inFlightExecutions: number; // RUNNING, QUEUED, WAITING, VALIDATING
  successRate: MetricValue<number | null>; // Percentage 0-100, null if 0 terminal executions
  failureRate: MetricValue<number | null>; // Percentage 0-100, null if 0 terminal executions
  meanDurationMs: MetricValue<number | null>; // Average execution duration
  medianDurationMs: MetricValue<number | null>; // p50 duration
  p95DurationMs: MetricValue<number | null>; // p95 duration
  timeWindow: TimeWindow;
  reportingPeriod: {
    from: string;
    to: string;
  };
}

export interface TimeSeriesPoint {
  timestamp: string; // Bucket start timestamp
  bucketLabel: string; // e.g. "2026-11-13 10:00" or "2026-11-13"
  total: number;
  completed: number;
  failed: number;
  meanDurationMs: number | null;
}

export interface TimeSeriesResult {
  interval: TimeBucketInterval;
  points: TimeSeriesPoint[];
  boundaryRule: '[start, end) (inclusive start, exclusive end)';
}

export interface NodePerformanceMetric {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  failureRatePercent: number | null;
  meanDurationMs: number | null;
  medianDurationMs: number | null;
  durationContributionRatio: number | null; // node mean duration / workflow mean duration
  totalRetryCount: number;
  errorCategories: Record<string, number>;
  sampleSizeAdequate: boolean; // Minimum 5 executions required
  warnings: {
    highDuration: boolean; // exceeds 40% of workflow duration
    highFailureRate: boolean; // exceeds 15% failure rate
  };
  bottleneckRankingScore: number; // Ranking metric for sorting only
}

export interface WorkflowPerformanceReport {
  workflowId: string;
  workflowName: string;
  workspaceId: string;
  summary: ExecutionSummaryMetrics;
  durationTrend: TimeSeriesResult;
  nodeMetrics: NodePerformanceMetric[];
  mostProblematicNodes: NodePerformanceMetric[];
}

export interface ModelPricingTier {
  provider: AIProviderId;
  model: string;
  inputPricePerMillion: number; // USD per 1M tokens
  outputPricePerMillion: number; // USD per 1M tokens
  currency: 'USD';
  effectiveFrom: string; // ISO date
  pricingVersion: string;
  notes?: string;
}

export interface AIUsageMetricsSummary {
  workspaceId: string;
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  meanLatencyMs: number | null;
  estimatedCostUsd: MetricValue<number | null>;
  pricingVersionUsed: string;
  byProvider: Record<string, { requests: number; tokens: number; estimatedCostUsd: number | null }>;
  byModel: Record<string, { requests: number; tokens: number; estimatedCostUsd: number | null }>;
}

export interface SchedulerHealthMetrics {
  workspaceId: string;
  activeSchedulesCount: number;
  pausedSchedulesCount: number;
  dueSchedulesCount: number;
  upcomingScheduledRuns: Array<{
    scheduleId: string;
    scheduleName: string;
    workflowName: string;
    nextRunAt: string;
  }>;
  recentlyExecutedCount: number;
  instrumentationStatus: {
    workerHeartbeatInstrumented: false;
    queueDepthInstrumented: false;
    note: 'Worker heartbeat and distributed queue depth require external Redis/BullMQ instrumentation (Phase 10+). Showing confirmed schedule configs only.';
  };
}

export interface IntegrationHealthSummary {
  workspaceId: string;
  totalDeliveriesSampled: number;
  acceptedDeliveries: number;
  rejectedDeliveries: number;
  failedDeliveries: number;
  meanDeliveryDurationMs: number | null;
  httpStatusDistribution: Record<string, number>;
  historyLimitation: 'Capped to 500 recent deliveries per WebhookStore buffer.';
}

