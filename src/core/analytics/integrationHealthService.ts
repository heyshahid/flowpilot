import { webhookStore } from '../../lib/storage/webhookStore';
import { executionStore } from '../../lib/storage/executionStore';
import { credentialStore } from '../../lib/storage/credentialStore';
import {
  IntegrationFailureCategory,
  IntegrationHealthSummary,
  IntegrationOperationRecord,
  IntegrationServiceMetric,
  WebhookDeliveryAnalyticsSummary,
} from './integrationAiTypes';

const SUPPORTED_INTEGRATIONS = [
  { id: 'http', name: 'HTTP Webhook & REST API', category: 'action', authType: 'none' },
  { id: 'slack', name: 'Slack Messaging & Alerts', category: 'communication', authType: 'bearer_token' },
  { id: 'telegram', name: 'Telegram Bot Dispatcher', category: 'communication', authType: 'api_key' },
  { id: 'smtp', name: 'Transactional SMTP Email', category: 'communication', authType: 'smtp' },
  { id: 'googleSheets', name: 'Google Sheets Data Sync', category: 'productivity', authType: 'oauth2' },
];

export class IntegrationHealthService {
  private static instance: IntegrationHealthService;

  public static getInstance(): IntegrationHealthService {
    if (!IntegrationHealthService.instance) {
      IntegrationHealthService.instance = new IntegrationHealthService();
    }
    return IntegrationHealthService.instance;
  }

  public classifyFailure(error?: string, httpStatus?: number): IntegrationFailureCategory {
    if (!error && !httpStatus) return 'UNKNOWN';

    if (httpStatus === 401) return 'AUTHENTICATION';
    if (httpStatus === 403) return 'AUTHORIZATION';
    if (httpStatus === 429) return 'RATE_LIMITING';
    if (httpStatus === 504) return 'TIMEOUT';
    if (httpStatus === 400 || httpStatus === 422) return 'INVALID_REQUEST';
    if (httpStatus && httpStatus >= 500 && httpStatus <= 503) return 'PROVIDER_ERROR';

    const err = (error || '').toLowerCase();
    if (err.includes('401') || err.includes('unauthorized') || err.includes('invalid token') || err.includes('bad api key') || err.includes('signature')) {
      return 'AUTHENTICATION';
    }
    if (err.includes('403') || err.includes('forbidden') || err.includes('access denied') || err.includes('permission')) {
      return 'AUTHORIZATION';
    }
    if (err.includes('429') || err.includes('rate limit') || err.includes('too many requests') || err.includes('quota')) {
      return 'RATE_LIMITING';
    }
    if (err.includes('timeout') || err.includes('504') || err.includes('etimedout') || err.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (err.includes('enotfound') || err.includes('econnrefused') || err.includes('network error') || err.includes('dns lookup')) {
      return 'NETWORK_ERROR';
    }
    if (err.includes('validation') || err.includes('bad request') || err.includes('malformed') || err.includes('invalid')) {
      return 'INVALID_REQUEST';
    }
    if (err.includes('500') || err.includes('502') || err.includes('503') || err.includes('internal server error') || err.includes('service unavailable')) {
      return 'PROVIDER_ERROR';
    }

    return 'UNKNOWN';
  }

  public sanitizeError(error?: string): string | undefined {
    if (!error) return undefined;
    let sanitized = error.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(/(whsec|fpsec|sk_live|sk_test|xoxb)_[a-zA-Z0-9_\-]+/gi, '[REDACTED_SECRET]');
    return sanitized.length > 200 ? sanitized.substring(0, 197) + '...' : sanitized;
  }

  /**
   * Aggregates all recorded operations (inbound webhooks + outbound execution steps) for a workspace.
   */
  public async getWorkspaceOperations(workspaceId: string = 'ws_default'): Promise<IntegrationOperationRecord[]> {
    const operations: IntegrationOperationRecord[] = [];

    // 1. Inbound Webhook Deliveries
    const workspaceWebhooks = await webhookStore.list(workspaceId);
    const webhookIds = new Set(workspaceWebhooks.map((w) => w.id));

    // Get all deliveries matching this workspace's webhooks
    const rawDeliveries = await webhookStore.getDeliveries(undefined, 500);
    const matchedDeliveries = rawDeliveries.filter(
      (d) => webhookIds.has(d.webhookId) || workspaceWebhooks.some((w) => w.workflowId === d.workflowId)
    );

    for (const d of matchedDeliveries) {
      const isSuccess = d.status === 'ACCEPTED';
      operations.push({
        id: d.id,
        integrationId: 'http',
        integrationName: 'HTTP Webhook Receiver',
        operationType: 'webhook_delivery',
        status: isSuccess ? 'SUCCESS' : 'FAILURE',
        httpStatus: d.httpStatus,
        durationMs: d.durationMs || 0,
        failureCategory: isSuccess ? undefined : this.classifyFailure(d.errorReason, d.httpStatus),
        errorMessage: this.sanitizeError(d.errorReason),
        timestamp: d.timestamp,
        workspaceId,
        sourceId: d.webhookId,
      });
    }

    // 2. Outbound Integration Execution Steps
    const executionsRes = await executionStore.list({ workspaceId, limit: 1000 });
    for (const exec of executionsRes.items) {
      if (!exec.traces) continue;
      for (const trace of exec.traces) {
        if (!trace.nodeType.startsWith('integration.') && trace.nodeType !== 'trigger.webhook') {
          continue;
        }

        let integrationId = 'http';
        let integrationName = 'HTTP Webhook & REST API';

        if (trace.nodeType.includes('slack')) {
          integrationId = 'slack';
          integrationName = 'Slack Messaging & Alerts';
        } else if (trace.nodeType.includes('telegram')) {
          integrationId = 'telegram';
          integrationName = 'Telegram Bot Dispatcher';
        } else if (trace.nodeType.includes('smtp') || trace.nodeType.includes('sendEmail')) {
          integrationId = 'smtp';
          integrationName = 'Transactional SMTP Email';
        } else if (trace.nodeType.includes('googleSheets')) {
          integrationId = 'googleSheets';
          integrationName = 'Google Sheets Data Sync';
        }

        const isSuccess = trace.status === 'COMPLETED';
        const failureCategory = isSuccess ? undefined : this.classifyFailure(trace.error);

        operations.push({
          id: `trace_${exec.id}_${trace.nodeId}`,
          integrationId,
          integrationName,
          operationType: 'outbound_action',
          status: isSuccess ? 'SUCCESS' : 'FAILURE',
          durationMs: trace.durationMs || 0,
          failureCategory,
          errorMessage: this.sanitizeError(trace.error),
          timestamp: trace.completedAt || trace.startedAt || exec.startedAt,
          workspaceId,
          sourceId: exec.id,
        });
      }
    }

    // Sort descending by timestamp
    return operations.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Computes holistic integration health overview.
   */
  public async getOverview(workspaceId: string = 'ws_default'): Promise<IntegrationHealthSummary> {
    const ops = await this.getWorkspaceOperations(workspaceId);

    let successfulOperations = 0;
    let failedOperations = 0;
    let totalDuration = 0;
    let webhookDeliveriesCount = 0;
    let outboundOperationsCount = 0;
    const durations: number[] = [];

    const httpStatusDistribution: Record<string, number> = {};
    const failureCategoryDistribution: Record<IntegrationFailureCategory, number> = {
      AUTHENTICATION: 0,
      AUTHORIZATION: 0,
      RATE_LIMITING: 0,
      TIMEOUT: 0,
      NETWORK_ERROR: 0,
      INVALID_REQUEST: 0,
      PROVIDER_ERROR: 0,
      UNKNOWN: 0,
    };

    for (const op of ops) {
      if (op.operationType === 'webhook_delivery') {
        webhookDeliveriesCount++;
      } else {
        outboundOperationsCount++;
      }

      if (op.status === 'SUCCESS') {
        successfulOperations++;
      } else {
        failedOperations++;
        if (op.failureCategory) {
          failureCategoryDistribution[op.failureCategory] =
            (failureCategoryDistribution[op.failureCategory] || 0) + 1;
        }
      }

      if (op.httpStatus) {
        const code = String(op.httpStatus);
        httpStatusDistribution[code] = (httpStatusDistribution[code] || 0) + 1;
      }

      totalDuration += op.durationMs;
      durations.push(op.durationMs);
    }

    durations.sort((a, b) => a - b);
    const meanDurationMs =
      ops.length > 0 ? Math.round((totalDuration / ops.length) * 10) / 10 : null;

    let medianDurationMs: number | null = null;
    if (durations.length > 0) {
      const mid = Math.floor(durations.length / 2);
      medianDurationMs =
        durations.length % 2 !== 0
          ? durations[mid]
          : Math.round(((durations[mid - 1] + durations[mid]) / 2) * 10) / 10;
    }

    const failureRatePercent =
      ops.length > 0
        ? Math.round((failedOperations / ops.length) * 1000) / 10
        : null;

    return {
      workspaceId,
      totalOperations: ops.length,
      successfulOperations,
      failedOperations,
      failureRatePercent,
      meanDurationMs,
      medianDurationMs,
      inboundWebhookDeliveriesCount: webhookDeliveriesCount,
      outboundOperationsCount,
      httpStatusDistribution,
      failureCategoryDistribution,
      retentionNotice:
        'Webhook delivery telemetry is retained up to a 500-record buffer in local storage. Outbound integration operations are extracted from persisted workflow execution step traces.',
      lastRecordedAt: ops[0]?.timestamp,
    };
  }

  /**
   * Computes per-service breakdown metrics across supported integrations.
   */
  public async getServiceMetrics(workspaceId: string = 'ws_default'): Promise<IntegrationServiceMetric[]> {
    const ops = await this.getWorkspaceOperations(workspaceId);
    const credentials = await credentialStore.list({ workspaceId });

    const metrics: IntegrationServiceMetric[] = [];

    for (const def of SUPPORTED_INTEGRATIONS) {
      const matchingOps = ops.filter((o) => o.integrationId === def.id);
      const cred = credentials.find((c) => c.integrationId === def.id);

      let successCount = 0;
      let failureCount = 0;
      let durationSum = 0;
      const durations: number[] = [];
      const failureCategoriesSet = new Set<IntegrationFailureCategory>();

      for (const op of matchingOps) {
        if (op.status === 'SUCCESS') successCount++;
        else {
          failureCount++;
          if (op.failureCategory) failureCategoriesSet.add(op.failureCategory);
        }
        durationSum += op.durationMs;
        durations.push(op.durationMs);
      }

      durations.sort((a, b) => a - b);
      const meanDurationMs =
        matchingOps.length > 0
          ? Math.round((durationSum / matchingOps.length) * 10) / 10
          : null;

      let medianDurationMs: number | null = null;
      if (durations.length > 0) {
        const mid = Math.floor(durations.length / 2);
        medianDurationMs =
          durations.length % 2 !== 0
            ? durations[mid]
            : Math.round(((durations[mid - 1] + durations[mid]) / 2) * 10) / 10;
      }

      const failureRatePercent =
        matchingOps.length > 0
          ? Math.round((failureCount / matchingOps.length) * 1000) / 10
          : null;

      metrics.push({
        integrationId: def.id,
        integrationName: def.name,
        category: def.category,
        authType: def.authType,
        totalOperations: matchingOps.length,
        successCount,
        failureCount,
        failureRatePercent,
        meanDurationMs,
        medianDurationMs,
        credentialStatus: cred ? (cred.status as any) : 'missing',
        lastActivityAt: matchingOps[0]?.timestamp,
        recentFailureCategories: Array.from(failureCategoriesSet),
        isMonitored: matchingOps.length > 0,
      });
    }

    return metrics;
  }

  /**
   * Retrieves webhook delivery specific analytics.
   */
  public async getWebhookAnalytics(workspaceId: string = 'ws_default'): Promise<WebhookDeliveryAnalyticsSummary> {
    const workspaceWebhooks = await webhookStore.list(workspaceId);
    const webhookIds = new Set(workspaceWebhooks.map((w) => w.id));

    const rawDeliveries = await webhookStore.getDeliveries(undefined, 500);
    const matched = rawDeliveries.filter(
      (d) => webhookIds.has(d.webhookId) || workspaceWebhooks.some((w) => w.workflowId === d.workflowId)
    );

    let acceptedCount = 0;
    let rejectedCount = 0;
    let failedCount = 0;
    let totalDuration = 0;
    const durations: number[] = [];
    const statusCodes: Record<string, number> = {};

    for (const d of matched) {
      if (d.status === 'ACCEPTED') acceptedCount++;
      else if (d.status === 'REJECTED') rejectedCount++;
      else failedCount++;

      const code = String(d.httpStatus);
      statusCodes[code] = (statusCodes[code] || 0) + 1;

      totalDuration += d.durationMs || 0;
      durations.push(d.durationMs || 0);
    }

    durations.sort((a, b) => a - b);
    const meanDurationMs =
      matched.length > 0 ? Math.round((totalDuration / matched.length) * 10) / 10 : null;

    let medianDurationMs: number | null = null;
    if (durations.length > 0) {
      const mid = Math.floor(durations.length / 2);
      medianDurationMs =
        durations.length % 2 !== 0
          ? durations[mid]
          : Math.round(((durations[mid - 1] + durations[mid]) / 2) * 10) / 10;
    }

    const sanitizedRecent = matched.slice(0, 50).map((d) => ({
      id: d.id,
      webhookId: d.webhookId,
      status: d.status,
      httpStatus: d.httpStatus,
      requestMethod: d.requestMethod,
      durationMs: d.durationMs,
      errorReason: this.sanitizeError(d.errorReason),
      timestamp: d.timestamp,
    }));

    return {
      totalDeliveriesSampled: matched.length,
      acceptedCount,
      rejectedCount,
      failedCount,
      meanDurationMs,
      medianDurationMs,
      statusCodesDistribution: statusCodes,
      bufferLimit: 500,
      historyNotice:
        'Deliveries buffer is capped at the 500 most recent records per local storage limits. Older events are rotated out.',
      recentDeliveries: sanitizedRecent,
    };
  }
}

export const integrationHealthService = IntegrationHealthService.getInstance();

