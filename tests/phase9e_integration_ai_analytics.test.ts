import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { workspaceStore } from '../src/lib/storage/workspaceStore';
import { webhookStore } from '../src/lib/storage/webhookStore';
import { executionStore } from '../src/lib/storage/executionStore';
import { credentialStore } from '../src/lib/storage/credentialStore';
import { aiUsageStore } from '../src/lib/storage/aiUsageStore';
import { AIPricingManager } from '../src/core/analytics/pricing';
import { integrationHealthService } from '../src/core/analytics/integrationHealthService';
import { aiUsageAnalyticsService } from '../src/core/analytics/aiUsageAnalyticsService';

// REST API Route handlers
import { GET as getIntegrationsOverviewRoute } from '../src/app/api/v1/analytics/integrations/overview/route';
import { GET as getIntegrationDetailRoute } from '../src/app/api/v1/analytics/integrations/[id]/route';
import { GET as getWebhooksAnalyticsRoute } from '../src/app/api/v1/analytics/integrations/webhooks/route';
import { GET as getAiOverviewRoute } from '../src/app/api/v1/analytics/ai-usage/overview/route';
import { GET as getAiProvidersRoute } from '../src/app/api/v1/analytics/ai-usage/providers/route';
import { GET as getAiModelsRoute } from '../src/app/api/v1/analytics/ai-usage/models/route';
import { GET as getAiTrendsRoute } from '../src/app/api/v1/analytics/ai-usage/trends/route';

describe('Phase 9E: Integration Health & AI Cost Analytics', () => {
  let testWorkspaceId: string;
  let otherWorkspaceId: string;
  const testUserId = 'usr_owner';

  beforeAll(async () => {
    // 1. Create isolated test workspaces
    const testWs = workspaceStore.create({
      name: 'Phase 9E Integration & AI Analytics Workspace',
      ownerId: testUserId,
      slug: 'phase-9e-analytics-ws',
    });
    testWorkspaceId = testWs.id;

    const otherWs = workspaceStore.create({
      name: 'Other Tenant Workspace Phase 9E',
      ownerId: testUserId,
      slug: 'other-tenant-9e',
    });
    otherWorkspaceId = otherWs.id;

    // 2. Seed integration credentials
    const slackCred = await credentialStore.save({
      name: 'Production Slack Bot',
      integrationId: 'slack',
      type: 'bearer_token',
      data: { token: 'xoxb-test-sample-bot-token-secret' },
      workspaceId: testWorkspaceId,
      createdBy: testUserId,
    });
    await credentialStore.updateStatus(slackCred.id, 'valid');

    // 3. Seed webhook and webhook deliveries
    const testWebhook = await webhookStore.create({
      workflowId: 'wf_stripe_handler',
      workflowName: 'Stripe Billing Handler',
      name: 'Stripe Billing Ingestion',
      workspaceId: testWorkspaceId,
    });

    await webhookStore.logDelivery({
      webhookId: testWebhook.id,
      workflowId: 'wf_stripe_handler',
      requestMethod: 'POST',
      headers: { 'content-type': 'application/json' },
      payload: { event: 'invoice.payment_succeeded' },
      status: 'ACCEPTED',
      httpStatus: 200,
      durationMs: 45,
    });

    await webhookStore.logDelivery({
      webhookId: testWebhook.id,
      workflowId: 'wf_stripe_handler',
      requestMethod: 'POST',
      headers: { 'content-type': 'application/json' },
      payload: { event: 'bad.request' },
      status: 'REJECTED',
      httpStatus: 400,
      durationMs: 25,
      errorReason: 'Validation error: invalid signature with secret fpsec_test_stripe_secret_1234567890',
    });

    await webhookStore.logDelivery({
      webhookId: testWebhook.id,
      workflowId: 'wf_stripe_handler',
      requestMethod: 'POST',
      headers: { 'content-type': 'application/json' },
      payload: { event: 'timeout.test' },
      status: 'FAILED',
      httpStatus: 504,
      durationMs: 5000,
      errorReason: 'Gateway timeout after 5000ms: ETIMEDOUT contacting downstream worker',
    });

    // 4. Seed outbound execution traces
    await executionStore.create({
      id: 'exec_phase9e_1',
      workflowId: 'wf_stripe_handler',
      workflowName: 'Stripe Billing Pipeline',
      workspaceId: testWorkspaceId,
      status: 'COMPLETED',
      trigger: { type: 'trigger.webhook', payload: {}, timestamp: new Date().toISOString() },
      startedAt: new Date(Date.now() - 60000).toISOString(),
      completedAt: new Date(Date.now() - 58000).toISOString(),
      durationMs: 2000,
      traces: [
        {
          nodeId: 'slack_notify_step',
          nodeName: 'Send Slack Notification',
          nodeType: 'integration.slack.sendMessage',
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 59000).toISOString(),
          completedAt: new Date(Date.now() - 58500).toISOString(),
          durationMs: 500,
          inputs: {},
          outputs: { ok: true },
        },
        {
          nodeId: 'telegram_alert_step',
          nodeName: 'Send Telegram Alert',
          nodeType: 'integration.telegram.sendMessage',
          status: 'FAILED',
          startedAt: new Date(Date.now() - 58500).toISOString(),
          completedAt: new Date(Date.now() - 58000).toISOString(),
          durationMs: 500,
          inputs: {},
          error: 'HTTP 429 Too Many Requests: Telegram rate limit exceeded for bot token',
        },
      ],
      stateHistory: [],
    });

    // 5. Seed AI usage records
    aiUsageStore.recordUsage(
      'openai',
      'gpt-4o-mini',
      'generate_workflow',
      { promptTokens: 1000, completionTokens: 500, totalTokens: 1500, estimatedCostUsd: 0.00045 },
      650,
      testWorkspaceId
    );

    aiUsageStore.recordUsage(
      'gemini',
      'gemini-2.0-flash',
      'explain_workflow',
      { promptTokens: 800, completionTokens: 400, totalTokens: 1200, estimatedCostUsd: 0.00024 },
      420,
      testWorkspaceId
    );

    aiUsageStore.recordUsage(
      'openai',
      'gpt-4o',
      'optimize_workflow',
      { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000, estimatedCostUsd: 0.015 },
      1450,
      testWorkspaceId
    );

    // Seed unpriced/unregistered model record
    aiUsageStore.recordUsage(
      'mock',
      'custom-unregistered-model-v9',
      'chat',
      { promptTokens: 500, completionTokens: 250, totalTokens: 750, estimatedCostUsd: 0 },
      300,
      testWorkspaceId
    );
  });

  afterAll(async () => {
    // Cleanup webhooks created in test
    const webhooks = await webhookStore.list(testWorkspaceId);
    for (const w of webhooks) {
      await webhookStore.delete(w.id);
    }
  });

  // -------------------------------------------------------------
  // 1. Failure Categorization Engine
  // -------------------------------------------------------------
  it('1. should accurately classify failure categories from HTTP codes and error strings', () => {
    expect(integrationHealthService.classifyFailure(undefined, 401)).toBe('AUTHENTICATION');
    expect(integrationHealthService.classifyFailure('Unauthorized signature match')).toBe('AUTHENTICATION');

    expect(integrationHealthService.classifyFailure(undefined, 403)).toBe('AUTHORIZATION');
    expect(integrationHealthService.classifyFailure('Access denied: insufficient permission')).toBe('AUTHORIZATION');

    expect(integrationHealthService.classifyFailure(undefined, 429)).toBe('RATE_LIMITING');
    expect(integrationHealthService.classifyFailure('Rate limit exceeded: 429')).toBe('RATE_LIMITING');

    expect(integrationHealthService.classifyFailure(undefined, 504)).toBe('TIMEOUT');
    expect(integrationHealthService.classifyFailure('Connection timed out: ETIMEDOUT')).toBe('TIMEOUT');

    expect(integrationHealthService.classifyFailure('getaddrinfo ENOTFOUND api.slack.com')).toBe('NETWORK_ERROR');
    expect(integrationHealthService.classifyFailure('connect ECONNREFUSED 127.0.0.1:8080')).toBe('NETWORK_ERROR');

    expect(integrationHealthService.classifyFailure(undefined, 400)).toBe('INVALID_REQUEST');
    expect(integrationHealthService.classifyFailure('Validation error: invalid request payload')).toBe('INVALID_REQUEST');

    expect(integrationHealthService.classifyFailure(undefined, 500)).toBe('PROVIDER_ERROR');
    expect(integrationHealthService.classifyFailure(undefined, 502)).toBe('PROVIDER_ERROR');
    expect(integrationHealthService.classifyFailure(undefined, 503)).toBe('PROVIDER_ERROR');
    expect(integrationHealthService.classifyFailure('503 Service Unavailable from external API')).toBe('PROVIDER_ERROR');

    expect(integrationHealthService.classifyFailure(undefined, undefined)).toBe('UNKNOWN');
    expect(integrationHealthService.classifyFailure('some unexpected string')).toBe('UNKNOWN');
  });

  // -------------------------------------------------------------
  // 2. Secret Redaction & Sanitization
  // -------------------------------------------------------------
  it('2. should sanitize bearer tokens and secret prefixes from error messages', () => {
    const rawError = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token payload failed with secret fpsec_live_9876543210';
    const sanitized = integrationHealthService.sanitizeError(rawError);

    expect(sanitized).toBeDefined();
    expect(sanitized).toContain('Bearer [REDACTED]');
    expect(sanitized).toContain('[REDACTED_SECRET]');
    expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(sanitized).not.toContain('fpsec_live_9876543210');
  });

  // -------------------------------------------------------------
  // 3. Integration Health Overview Aggregation
  // -------------------------------------------------------------
  it('3. should aggregate inbound webhooks and outbound actions into holistic health overview', async () => {
    const overview = await integrationHealthService.getOverview(testWorkspaceId);

    expect(overview.workspaceId).toBe(testWorkspaceId);
    expect(overview.totalOperations).toBeGreaterThanOrEqual(4); // 3 webhooks + 2 execution traces
    expect(overview.successfulOperations).toBeGreaterThanOrEqual(2); // 1 accepted webhook + 1 completed trace
    expect(overview.failedOperations).toBeGreaterThanOrEqual(2); // 2 webhook rejections + 1 telegram failure
    expect(overview.failureRatePercent).not.toBeNull();
    expect(overview.meanDurationMs).not.toBeNull();
    expect(overview.medianDurationMs).not.toBeNull();
    expect(overview.inboundWebhookDeliveriesCount).toBeGreaterThanOrEqual(3);
    expect(overview.outboundOperationsCount).toBeGreaterThanOrEqual(2);

    // Verify retention notice is clearly stated
    expect(overview.retentionNotice).toContain('500-record buffer');
  });

  // -------------------------------------------------------------
  // 4. Per-Service Metrics & Credential Distinction
  // -------------------------------------------------------------
  it('4. should compute service-level metrics and verify credential format does not imply external API health', async () => {
    const services = await integrationHealthService.getServiceMetrics(testWorkspaceId);

    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThanOrEqual(5);

    const slackService = services.find((s) => s.integrationId === 'slack');
    expect(slackService).toBeDefined();
    expect(slackService?.credentialStatus).toBe('valid'); // Formally valid credential
    expect(slackService?.successCount).toBeGreaterThanOrEqual(1);

    const telegramService = services.find((s) => s.integrationId === 'telegram');
    expect(telegramService).toBeDefined();
    expect(telegramService?.failureCount).toBeGreaterThanOrEqual(1);
    expect(telegramService?.recentFailureCategories).toContain('RATE_LIMITING');

    const smtpService = services.find((s) => s.integrationId === 'smtp');
    expect(smtpService).toBeDefined();
    expect(smtpService?.credentialStatus).toBe('missing'); // No credentials seeded
  });

  // -------------------------------------------------------------
  // 5. Webhook Delivery Telemetry & 500 Buffer Notice
  // -------------------------------------------------------------
  it('5. should provide webhook delivery analytics with buffer limit notices', async () => {
    const webhookAnalytics = await integrationHealthService.getWebhookAnalytics(testWorkspaceId);

    expect(webhookAnalytics.totalDeliveriesSampled).toBeGreaterThanOrEqual(3);
    expect(webhookAnalytics.acceptedCount).toBeGreaterThanOrEqual(1);
    expect(webhookAnalytics.rejectedCount).toBeGreaterThanOrEqual(1);
    expect(webhookAnalytics.failedCount).toBeGreaterThanOrEqual(1);
    expect(webhookAnalytics.bufferLimit).toBe(500);
    expect(webhookAnalytics.historyNotice).toContain('500 most recent records');
    expect(Array.isArray(webhookAnalytics.recentDeliveries)).toBe(true);

    // Check status code distribution
    expect(webhookAnalytics.statusCodesDistribution['200']).toBeGreaterThanOrEqual(1);
    expect(webhookAnalytics.statusCodesDistribution['400']).toBeGreaterThanOrEqual(1);
    expect(webhookAnalytics.statusCodesDistribution['504']).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------
  // 6. AI Usage Analytics Overview & Token Aggregation
  // -------------------------------------------------------------
  it('6. should aggregate AI token volumes, latency distributions, and advisory disclaimer', async () => {
    const overview = await aiUsageAnalyticsService.getOverview(testWorkspaceId);

    expect(overview.workspaceId).toBe(testWorkspaceId);
    expect(overview.totalRequests).toBeGreaterThanOrEqual(4);
    expect(overview.totalPromptTokens).toBeGreaterThanOrEqual(4300); // 1000 + 800 + 2000 + 500
    expect(overview.totalCompletionTokens).toBeGreaterThanOrEqual(2150); // 500 + 400 + 1000 + 250
    expect(overview.totalTokens).toBe(overview.totalPromptTokens + overview.totalCompletionTokens);
    expect(overview.averageLatencyMs).toBeGreaterThan(0);
    expect(overview.medianLatencyMs).toBeGreaterThan(0);

    // Verify advisory disclaimer
    expect(overview.costIsEstimated).toBe(true);
    expect(overview.currency).toBe('USD');
    expect(overview.disclaimer).toContain('advisory projections');
    expect(overview.disclaimer).toContain('differ from official monthly invoices');
  });

  // -------------------------------------------------------------
  // 7. Versioned Historical Pricing Resolution
  // -------------------------------------------------------------
  it('7. should resolve historical versioned pricing tiers for known models', () => {
    const q1Date = new Date('2026-02-15T12:00:00Z');

    const costGpt4oMini = AIPricingManager.calculateCost('openai', 'gpt-4o-mini', 1_000_000, 1_000_000, q1Date);
    expect(costGpt4oMini.isAvailable).toBe(true);
    expect(costGpt4oMini.pricingVersion).toBe('2026-Q1');
    // input: 0.15, output: 0.60 => total 0.75
    expect(costGpt4oMini.costUsd).toBeCloseTo(0.75, 4);

    const costGeminiFlash = AIPricingManager.calculateCost('gemini', 'gemini-2.0-flash', 1_000_000, 1_000_000, q1Date);
    expect(costGeminiFlash.isAvailable).toBe(true);
    expect(costGeminiFlash.pricingVersion).toBe('2026-Q1');
    // input: 0.10, output: 0.40 => total 0.50
    expect(costGeminiFlash.costUsd).toBeCloseTo(0.50, 4);
  });

  // -------------------------------------------------------------
  // 8. Missing Pricing Tier Safeguard (Returns null / N/A, never $0.00)
  // -------------------------------------------------------------
  it('8. should return null / unavailable when pricing tier is missing, never substituting zero', async () => {
    // 1. AIPricingManager direct test
    const unpricedResult = AIPricingManager.calculateCost(
      'openai',
      'non-existent-experimental-model-2026',
      1000,
      500
    );
    expect(unpricedResult.isAvailable).toBe(false);
    expect(unpricedResult.costUsd).toBeNull();

    // 2. Overview should flag missing pricing tiers
    const overview = await aiUsageAnalyticsService.getOverview(testWorkspaceId);
    expect(overview.hasMissingPricingTiers).toBe(true);
    expect(overview.unpricedRequestsCount).toBeGreaterThanOrEqual(1);

    // 3. Model metrics should display isPricingAvailable: false for the unpriced model
    const models = await aiUsageAnalyticsService.getModelMetrics(testWorkspaceId);
    const unpricedModel = models.find((m) => m.model === 'custom-unregistered-model-v9');
    expect(unpricedModel).toBeDefined();
    expect(unpricedModel?.isPricingAvailable).toBe(false);
    expect(unpricedModel?.estimatedCostUsd).toBeNull();
  });

  // -------------------------------------------------------------
  // 9. AI Usage Provider & Model Breakdowns
  // -------------------------------------------------------------
  it('9. should produce accurate provider and model breakdowns with rate per million', async () => {
    const providers = await aiUsageAnalyticsService.getProviderMetrics(testWorkspaceId);
    expect(providers.length).toBeGreaterThanOrEqual(3); // openai, gemini, mock

    const openai = providers.find((p) => p.provider === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.providerName).toBe('OpenAI');
    expect(openai?.requestCount).toBeGreaterThanOrEqual(2);
    expect(openai?.isPricingAvailable).toBe(true);
    expect(openai?.estimatedCostUsd).toBeGreaterThan(0);

    const models = await aiUsageAnalyticsService.getModelMetrics(testWorkspaceId);
    const mini = models.find((m) => m.model === 'gpt-4o-mini');
    expect(mini).toBeDefined();
    expect(mini?.inputPricePerMillion).toBe(0.15);
    expect(mini?.outputPricePerMillion).toBe(0.60);
    expect(mini?.pricingVersion).toBe('2026-Q1');
  });

  // -------------------------------------------------------------
  // 10. AI Time-Series Bucketing
  // -------------------------------------------------------------
  it('10. should produce time-series points with [start, end) hourly and daily intervals', async () => {
    const dailyPoints = await aiUsageAnalyticsService.getTimeSeries(testWorkspaceId, 'day');
    expect(Array.isArray(dailyPoints)).toBe(true);
    expect(dailyPoints.length).toBeGreaterThanOrEqual(1);
    expect(dailyPoints[0].requestCount).toBeGreaterThanOrEqual(1);
    expect(dailyPoints[0].totalTokens).toBeGreaterThan(0);

    const hourlyPoints = await aiUsageAnalyticsService.getTimeSeries(testWorkspaceId, 'hour');
    expect(Array.isArray(hourlyPoints)).toBe(true);
    expect(hourlyPoints.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------
  // 11. REST API: GET /api/v1/analytics/integrations/overview
  // -------------------------------------------------------------
  it('11. should serve GET /api/v1/analytics/integrations/overview with tenant scoping', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/analytics/integrations/overview?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const res = await getIntegrationsOverviewRoute(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.workspaceId).toBe(testWorkspaceId);
    expect(json.data.summary).toBeDefined();
    expect(json.data.services).toBeDefined();

    // Cross-tenant access must return 404 without leaking existence
    const crossReq = new NextRequest(
      `http://localhost:3000/api/v1/analytics/integrations/overview?workspaceId=${otherWorkspaceId}`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const crossRes = await getIntegrationsOverviewRoute(crossReq);
    expect(crossRes.status).toBe(404);
  });

  // -------------------------------------------------------------
  // 12. REST API: GET /api/v1/analytics/integrations/[id]
  // -------------------------------------------------------------
  it('12. should serve GET /api/v1/analytics/integrations/[id] with detail and operations', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/analytics/integrations/slack?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const res = await getIntegrationDetailRoute(req, {
      params: Promise.resolve({ id: 'slack' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.integration.integrationId).toBe('slack');
    expect(Array.isArray(json.data.recentOperations)).toBe(true);

    // Non-existent integration returns 404
    const notFoundReq = new NextRequest(
      `http://localhost:3000/api/v1/analytics/integrations/unknown_service`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const notFoundRes = await getIntegrationDetailRoute(notFoundReq, {
      params: Promise.resolve({ id: 'unknown_service' }),
    });
    expect(notFoundRes.status).toBe(404);
  });

  // -------------------------------------------------------------
  // 13. REST API: GET /api/v1/analytics/integrations/webhooks
  // -------------------------------------------------------------
  it('13. should serve GET /api/v1/analytics/integrations/webhooks with buffer limit metadata', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/analytics/integrations/webhooks?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const res = await getWebhooksAnalyticsRoute(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.bufferLimit).toBe(500);
    expect(json.data.historyNotice).toBeDefined();
    expect(Array.isArray(json.data.recentDeliveries)).toBe(true);
  });

  // -------------------------------------------------------------
  // 14. REST API: GET /api/v1/analytics/ai-usage/overview
  // -------------------------------------------------------------
  it('14. should serve GET /api/v1/analytics/ai-usage/overview with tokens, cost, and disclaimer', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/analytics/ai-usage/overview?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const res = await getAiOverviewRoute(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.totalRequests).toBeGreaterThanOrEqual(4);
    expect(json.data.costIsEstimated).toBe(true);
    expect(json.data.disclaimer).toBeDefined();

    // Cross-tenant access must return 404
    const crossReq = new NextRequest(
      `http://localhost:3000/api/v1/analytics/ai-usage/overview?workspaceId=${otherWorkspaceId}`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const crossRes = await getAiOverviewRoute(crossReq);
    expect(crossRes.status).toBe(404);
  });

  // -------------------------------------------------------------
  // 15. REST API: GET /api/v1/analytics/ai-usage/providers, models & trends
  // -------------------------------------------------------------
  it('15. should serve providers, models, and trends endpoints with provider filtering', async () => {
    // 1. Providers endpoint
    const provReq = new NextRequest(
      `http://localhost:3000/api/v1/analytics/ai-usage/providers?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const provRes = await getAiProvidersRoute(provReq);
    const provJson = await provRes.json();
    expect(provRes.status).toBe(200);
    expect(provJson.data.items.length).toBeGreaterThanOrEqual(2);

    // 2. Models endpoint filtered by provider=openai
    const modelReq = new NextRequest(
      `http://localhost:3000/api/v1/analytics/ai-usage/models?workspaceId=${testWorkspaceId}&provider=openai`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const modelRes = await getAiModelsRoute(modelReq);
    const modelJson = await modelRes.json();
    expect(modelRes.status).toBe(200);
    expect(modelJson.data.items.every((m: any) => m.provider === 'openai')).toBe(true);

    // 3. Trends endpoint
    const trendReq = new NextRequest(
      `http://localhost:3000/api/v1/analytics/ai-usage/trends?workspaceId=${testWorkspaceId}&bucketSize=day`,
      {
        headers: {
          'x-user-id': testUserId,
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const trendRes = await getAiTrendsRoute(trendReq);
    const trendJson = await trendRes.json();
    expect(trendRes.status).toBe(200);
    expect(Array.isArray(trendJson.data.points)).toBe(true);
  });
});
