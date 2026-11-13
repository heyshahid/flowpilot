import { AIProviderId } from '../ai/types';

// ============================================================================
// Integration Health Analytics Types
// ============================================================================

export type IntegrationFailureCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'RATE_LIMITING'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN';

export type IntegrationOperationType =
  | 'webhook_delivery'
  | 'outbound_action'
  | 'credential_test';

export interface IntegrationOperationRecord {
  id: string;
  integrationId: string;
  integrationName: string;
  operationType: IntegrationOperationType;
  status: 'SUCCESS' | 'FAILURE';
  httpStatus?: number;
  durationMs: number;
  failureCategory?: IntegrationFailureCategory;
  errorMessage?: string;
  timestamp: string;
  workspaceId: string;
  sourceId?: string; // webhookId or executionId
}

export interface IntegrationHealthSummary {
  workspaceId: string;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  failureRatePercent: number | null;
  meanDurationMs: number | null;
  medianDurationMs: number | null;
  inboundWebhookDeliveriesCount: number;
  outboundOperationsCount: number;
  httpStatusDistribution: Record<string, number>;
  failureCategoryDistribution: Record<IntegrationFailureCategory, number>;
  retentionNotice: string;
  lastRecordedAt?: string;
}

export interface IntegrationServiceMetric {
  integrationId: string;
  integrationName: string;
  category: string;
  authType: string;
  totalOperations: number;
  successCount: number;
  failureCount: number;
  failureRatePercent: number | null;
  meanDurationMs: number | null;
  medianDurationMs: number | null;
  credentialStatus: 'valid' | 'invalid' | 'untested' | 'missing';
  lastActivityAt?: string;
  recentFailureCategories: IntegrationFailureCategory[];
  isMonitored: boolean;
}

export interface WebhookDeliveryAnalyticsSummary {
  totalDeliveriesSampled: number;
  acceptedCount: number;
  rejectedCount: number;
  failedCount: number;
  meanDurationMs: number | null;
  medianDurationMs: number | null;
  statusCodesDistribution: Record<string, number>;
  bufferLimit: number;
  historyNotice: string;
  recentDeliveries: Array<{
    id: string;
    webhookId: string;
    status: 'ACCEPTED' | 'REJECTED' | 'FAILED';
    httpStatus: number;
    requestMethod: string;
    durationMs: number;
    errorReason?: string;
    timestamp: string;
  }>;
}

// ============================================================================
// AI Usage & Cost Analytics Types
// ============================================================================

export interface AIUsageAnalyticsOverview {
  workspaceId: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  averageLatencyMs: number | null;
  medianLatencyMs: number | null;
  estimatedTotalCostUsd: number | null;
  costIsEstimated: boolean;
  currency: string;
  sampleSize: number;
  reportingPeriod: {
    startDate?: string;
    endDate?: string;
  };
  hasMissingPricingTiers: boolean;
  unpricedRequestsCount: number;
  disclaimer: string;
}

export interface AIProviderUsageMetric {
  provider: AIProviderId;
  providerName: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  averageLatencyMs: number | null;
  estimatedCostUsd: number | null;
  isPricingAvailable: boolean;
  currency: string;
}

export interface AIModelUsageMetric {
  model: string;
  provider: AIProviderId;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  averageLatencyMs: number | null;
  estimatedCostUsd: number | null;
  isPricingAvailable: boolean;
  pricingVersion?: string;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  currency: string;
}

export interface AITimeSeriesPoint {
  timestamp: string; // ISO bucket start
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

