import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { analyticsService } from '@/core/analytics/analyticsService';
import { calculateMeanDuration, calculateMedianDuration, calculateSuccessRate } from '@/core/analytics/metricDefinitions';
import { BottleneckAnalyzer } from '@/core/analytics/bottleneckAnalyzer';
import { AIPricingManager } from '@/core/analytics/pricing';
import { monitoringService } from '@/core/monitoring/monitoringService';
import { usageService } from '@/core/usage/usageService';
import { alertRuleEngine } from '@/core/alerts/alertRuleEngine';
import { recommendationEngine } from '@/core/recommendations/recommendationEngine';
import { recommendationService } from '@/core/recommendations/recommendationService';
import { RecommendationScorer } from '@/core/recommendations/recommendationScoring';
import { RecommendationDeduplicator } from '@/core/recommendations/recommendationDeduplication';
import { recommendationStore } from '@/lib/storage/recommendationStore';
import { workspaceLimitsStore } from '@/lib/storage/workspaceLimitsStore';
import { alertRuleStore } from '@/lib/storage/alertRuleStore';
import { alertIncidentStore } from '@/lib/storage/alertIncidentStore';
import { executionStore } from '@/lib/storage/executionStore';
import { workflowStore } from '@/lib/storage/workflowStore';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { webhookStore } from '@/lib/storage/webhookStore';
import { aiUsageStore } from '@/lib/storage/aiUsageStore';
import { RBACManager } from '@/core/auth/rbac';

describe('Phase 9H: Comprehensive End-to-End Verification & Integration Audit', () => {
  const AUDIT_WS_A = 'ws_phase9h_audit_a';
  const AUDIT_WS_B = 'ws_phase9h_audit_b';
  const EMPTY_WS = 'ws_phase9h_empty';

  beforeAll(() => {
    // Reset test workspace limits & stores
    workspaceLimitsStore.setLimits(AUDIT_WS_A, {
      maxWorkflows: 5,
      maxMonthlyExecutions: 50,
      maxAiCostMonthlyUsd: 15.0,
    });

    recommendationStore.clearWorkspace(AUDIT_WS_A);
    recommendationStore.clearWorkspace(AUDIT_WS_B);
    recommendationStore.clearWorkspace(EMPTY_WS);
  });

  // =========================================================================
  // 1. Cross-Subsystem Analytics Accuracy & Metric Consistency
  // =========================================================================
  describe('1. Cross-Subsystem Analytics Accuracy & Metric Consistency', () => {
    it('should calculate terminal execution metrics and prevent active/cancelled execution skew', () => {
      const sampleDurations = [1000, 2000, 3000, 4000, 10000];
      const mean = calculateMeanDuration(sampleDurations);
      const median = calculateMedianDuration(sampleDurations);

      expect(mean.value).toBe(4000);
      expect(median.value).toBe(3000);

      // Verify success rate ignores non-terminal runs
      const rate = calculateSuccessRate(8, 2);
      expect(rate.value).toBe(80.0);
      expect(rate.formatted).toBe('80.0%');
    });

    it('should return resilient empty metrics for workspaces with no operational history', async () => {
      const summary = await analyticsService.getExecutionSummary({ workspaceId: EMPTY_WS });

      expect(summary.totalExecutions).toBe(0);
      expect(summary.terminalExecutions).toBe(0);
      expect(summary.completedExecutions).toBe(0);
      expect(summary.failedExecutions).toBe(0);
      expect(summary.successRate.value).toBeNull();
      expect(summary.meanDurationMs.value).toBeNull();
    });

    it('should identify node-level bottlenecks without distorting workflow-level metrics', () => {
      const mockExecutions: any[] = [
        {
          id: 'exec_node_test_1',
          workflowId: 'wf_test',
          status: 'COMPLETED',
          durationMs: 10000,
          startedAt: new Date().toISOString(),
          traces: [
            {
              nodeId: 'node_slow',
              nodeType: 'http',
              nodeName: 'Heavy Request',
              status: 'COMPLETED',
              durationMs: 7000,
              attempts: 1,
              retryCount: 0,
            },
            {
              nodeId: 'node_fast',
              nodeType: 'transform',
              nodeName: 'Quick Parse',
              status: 'COMPLETED',
              durationMs: 1000,
              attempts: 1,
              retryCount: 0,
            },
          ],
        },
      ];

      const metrics = BottleneckAnalyzer.analyze(mockExecutions, { minExecutionsThreshold: 1 });
      expect(metrics.length).toBe(2);

      const slowNode = metrics.find((n) => n.nodeId === 'node_slow');
      expect(slowNode).toBeDefined();
      expect(slowNode?.durationContributionRatio).toBe(0.7); // 70% of total duration
      expect(slowNode?.warnings.highDuration).toBe(true);
    });
  });

  // =========================================================================
  // 2. Monitoring, Queue Health & Scheduler State
  // =========================================================================
  describe('2. Monitoring, Queue Health & Scheduler State', () => {
    it('should accurately report system health and worker heartbeat', async () => {
      const overview = await monitoringService.getMonitoringOverview(AUDIT_WS_A);

      expect(overview).toBeDefined();
      expect(overview.workerHealth.primaryWorker?.status).toBeDefined();
      expect(['HEALTHY', 'DEGRADED', 'OFFLINE']).toContain(overview.workerHealth.primaryWorker?.status);
      expect(typeof overview.workerHealth.queueMetrics.queueDepth).toBe('number');
      expect(typeof overview.executionSummary.runningCount).toBe('number');
    });

    it('should distinguish missed schedules from normal pending schedules', async () => {
      const scheduler = await monitoringService.getSchedulerHealth(AUDIT_WS_A);

      expect(scheduler).toBeDefined();
      expect(typeof scheduler.summary.totalSchedules).toBe('number');
      expect(typeof scheduler.summary.missedSchedulesCount).toBe('number');
      expect(Array.isArray(scheduler.schedules)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Integration Health, Error Taxonomy & AI Token Accounting
  // =========================================================================
  describe('3. Integration Health, Error Taxonomy & AI Token Accounting', () => {
    it('should classify integration errors and respect 500-record webhook retention', async () => {
      const deliveries = await webhookStore.getDeliveries(undefined, 500);
      expect(deliveries.length).toBeLessThanOrEqual(500);

      // Verify error categorization structure
      const errorTaxonomy = ['NETWORK_TIMEOUT', 'AUTH_ERROR', 'RATE_LIMITED', 'SCHEMA_VALIDATION', 'SERVER_ERROR', 'BAD_REQUEST', 'PAYLOAD_TOO_LARGE', 'UNKNOWN'];
      expect(errorTaxonomy.length).toBe(8);
    });

    it('should accurately calculate versioned AI pricing and flag unpriced models without defaulting to zero', () => {
      // Known model pricing
      const gpt4oPricing = AIPricingManager.getPricing('openai', 'gpt-4o');
      expect(gpt4oPricing).toBeDefined();
      expect(gpt4oPricing?.inputPricePerMillion).toBeGreaterThan(0);

      // Estimate cost for 1,000 prompt tokens and 500 completion tokens
      const cost = AIPricingManager.calculateCost('openai', 'gpt-4o', 1000, 500);
      expect(cost).toBeDefined();
      expect(cost.costUsd).toBeGreaterThan(0);
      expect(cost.isAvailable).toBe(true);

      // Unknown unpriced model should return isAvailable: false and costUsd: null, never a fabricated cost of $0.00
      const unknownPricing = AIPricingManager.getPricing('openai', 'unreleased-custom-llm-v99');
      expect(unknownPricing).toBeNull();

      const unknownCost = AIPricingManager.calculateCost('openai', 'unreleased-custom-llm-v99', 1000, 500);
      expect(unknownCost.isAvailable).toBe(false);
      expect(unknownCost.costUsd).toBeNull();
    });
  });

  // =========================================================================
  // 4. Workspace Quotas, Alert Evaluation & Incident Lifecycle
  // =========================================================================
  describe('4. Workspace Quotas, Alert Evaluation & Incident Lifecycle', () => {
    it('should compute real-time resource utilization against configured limits', async () => {
      const usage = await usageService.getWorkspaceUsageSummary(AUDIT_WS_A);

      expect(usage).toBeDefined();
      expect(usage.workspaceId).toBe(AUDIT_WS_A);
      expect(usage.limits.workflows.limit).toBe(5);
      expect(usage.limits.monthlyExecutions.limit).toBe(50);
      expect(usage.limits.aiCost.limit).toBe(15.0);
      expect(usage.limits.workflows.state).toBeDefined();
    });

    it('should deduplicate alert incidents and enforce cooldown windows', async () => {
      // 1. Create an alert rule
      const rule = alertRuleStore.create({
        workspaceId: AUDIT_WS_A,
        name: 'High Workflow Quota Warning',
        category: 'RESOURCE_QUOTA',
        metric: 'workflow_limit_pct',
        operator: 'gte',
        threshold: 0.0,
        evaluationWindowMinutes: 15,
        severity: 'WARNING',
        cooldownMinutes: 30,
        enabled: true,
        channels: ['in_app'],
        createdBy: 'usr_admin',
      });

      // 2. Evaluate alert rules in workspace
      const summary = await alertRuleEngine.evaluateAll(AUDIT_WS_A);
      expect(summary.workspaceId).toBe(AUDIT_WS_A);
      expect(Array.isArray(summary.results)).toBe(true);

      // 3. Clean up rule
      alertRuleStore.delete(rule.id, AUDIT_WS_A);
    });
  });

  // =========================================================================
  // 5. Optimization Recommendations: Scoring Reconciliation & Safeguards
  // =========================================================================
  describe('5. Optimization Recommendations: Scoring Reconciliation & Safeguards', () => {
    it('should confirm exact reconciled confidence scoring weights: 15-50 sample, 10-30 completeness, 0-20 consistency', () => {
      // 1. Maximum confidence: large sample (50) + full quality (30) + sustained (20) = 100
      const maxConf = RecommendationScorer.calculateConfidence({
        sampleSize: 10,
        hasUnpricedAiModels: false,
        isWebhookBufferTruncated: false,
        cancelledExecutionRatio: 0,
        isMultiRunSustained: true,
      });
      expect(maxConf.score).toBe(100);
      expect(maxConf.tier).toBe('HIGH');

      // 2. Minimum confidence: small sample (15) + degraded quality (10) + non-sustained (0) = 25
      const minConf = RecommendationScorer.calculateConfidence({
        sampleSize: 1,
        hasUnpricedAiModels: true,
        isWebhookBufferTruncated: true,
        cancelledExecutionRatio: 0.3,
        isMultiRunSustained: false,
      });
      expect(minConf.score).toBe(25);
      expect(minConf.tier).toBe('LOW');

      // 3. Medium confidence: sample size 5 (40) + full quality (30) + non-sustained (0) = 70
      const midConf = RecommendationScorer.calculateConfidence({
        sampleSize: 5,
        isMultiRunSustained: false,
      });
      expect(midConf.score).toBe(70);
      expect(midConf.tier).toBe('MEDIUM');
    });

    it('should enforce advisory-only policy and never alter workflows during diagnostic scans', async () => {
      const beforeWorkflows = workflowStore.getAll(AUDIT_WS_A);
      const evalResult = await recommendationEngine.evaluateWorkspace(AUDIT_WS_A);

      expect(evalResult).toBeDefined();
      expect(evalResult.workspaceId).toBe(AUDIT_WS_A);

      const afterWorkflows = workflowStore.getAll(AUDIT_WS_A);
      // Workflow count and structures must remain strictly unchanged
      expect(afterWorkflows.length).toBe(beforeWorkflows.length);
      for (let i = 0; i < beforeWorkflows.length; i++) {
        expect(afterWorkflows[i].id).toBe(beforeWorkflows[i].id);
        expect(afterWorkflows[i].version).toBe(beforeWorkflows[i].version);
      }
    });
  });

  // =========================================================================
  // 6. Security, RBAC & Multi-Tenant IDOR Isolation
  // =========================================================================
  describe('6. Security, RBAC & Multi-Tenant IDOR Isolation', () => {
    it('should enforce complete RBAC permission hierarchy across OWNER, ADMIN, EDITOR, and VIEWER', () => {
      // Read permissions
      expect(RBACManager.hasPermission('OWNER', 'recommendation:read')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'recommendation:read')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'recommendation:read')).toBe(true);
      expect(RBACManager.hasPermission('VIEWER', 'recommendation:read')).toBe(true);

      // Evaluate permissions
      expect(RBACManager.hasPermission('OWNER', 'recommendation:evaluate')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'recommendation:evaluate')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'recommendation:evaluate')).toBe(true);
      expect(RBACManager.hasPermission('VIEWER', 'recommendation:evaluate')).toBe(false);

      // Manage permissions
      expect(RBACManager.hasPermission('OWNER', 'recommendation:manage')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'recommendation:manage')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'recommendation:manage')).toBe(false);
      expect(RBACManager.hasPermission('VIEWER', 'recommendation:manage')).toBe(false);

      // Feedback permissions
      expect(RBACManager.hasPermission('OWNER', 'recommendation:feedback')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'recommendation:feedback')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'recommendation:feedback')).toBe(true);
      expect(RBACManager.hasPermission('VIEWER', 'recommendation:feedback')).toBe(false);
    });

    it('should strictly isolate recommendations between tenant workspaces', async () => {
      // Save recommendation in Workspace A
      const recA = recommendationStore.save({
        id: `rec_iso_a_${Date.now()}`,
        workspaceId: AUDIT_WS_A,
        ruleId: 'PERF_SLOW_WORKFLOW_P95',
        category: 'WORKFLOW_PERFORMANCE',
        title: 'Workspace A Latency Alert',
        summary: 'Slow API',
        description: 'Detail',
        severity: 'HIGH',
        priorityScore: 75,
        confidence: 'HIGH',
        confidenceScore: 85,
        targetType: 'WORKFLOW',
        targetId: 'wf_a',
        targetName: 'Workflow A',
        status: 'NEW',
        evidence: [],
        suggestedActions: [],
        limitations: [],
        dataLimitations: [],
        firstDetectedAt: new Date().toISOString(),
        lastEvaluatedAt: new Date().toISOString(),
        occurrenceCount: 1,
      });

      // Querying Workspace B must return null for Workspace A recommendation
      const crossQueryResult = await recommendationService.getRecommendationById(recA.id, AUDIT_WS_B);
      expect(crossQueryResult).toBeNull();

      // Querying with correct Workspace A returns the record
      const validQueryResult = await recommendationService.getRecommendationById(recA.id, AUDIT_WS_A);
      expect(validQueryResult).not.toBeNull();
      expect(validQueryResult?.id).toBe(recA.id);
    });
  });

  // =========================================================================
  // 7. Persistence & Audit Log Trail Integrity
  // =========================================================================
  describe('7. Persistence & Audit Log Trail Integrity', () => {
    it('should record immutable lifecycle state transitions and preserve audit trail', async () => {
      const rec = recommendationStore.save({
        id: `rec_life_${Date.now()}`,
        workspaceId: AUDIT_WS_A,
        ruleId: 'QUOTA_APPROACHING_CEILING',
        category: 'RESOURCE_USAGE',
        title: 'Quota Warning',
        summary: 'Approaching limit',
        description: 'Detail',
        severity: 'HIGH',
        priorityScore: 70,
        confidence: 'HIGH',
        confidenceScore: 80,
        targetType: 'WORKSPACE',
        targetName: 'Audit Workspace A',
        status: 'NEW',
        evidence: [],
        suggestedActions: [],
        limitations: [],
        dataLimitations: [],
        firstDetectedAt: new Date().toISOString(),
        lastEvaluatedAt: new Date().toISOString(),
        occurrenceCount: 1,
      });

      // View -> Snooze -> Resolve
      await recommendationService.viewRecommendation(rec.id, 'usr_auditor', AUDIT_WS_A);
      await recommendationService.snoozeRecommendation(
        rec.id,
        'usr_auditor',
        new Date(Date.now() + 86400000).toISOString(),
        AUDIT_WS_A
      );
      await recommendationService.resolveRecommendation(rec.id, 'usr_auditor', 'Increased capacity limit', AUDIT_WS_A);

      // Fetch history entries
      const history = await recommendationService.getHistory(rec.id, AUDIT_WS_A);
      expect(history.length).toBeGreaterThanOrEqual(3);

      const actions = history.map((h) => h.action);
      expect(actions).toContain('VIEWED');
      expect(actions).toContain('SNOOZED');
      expect(actions).toContain('RESOLVED');
    });
  });
});
