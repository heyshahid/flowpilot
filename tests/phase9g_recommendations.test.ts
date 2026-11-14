import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { RecommendationScorer } from '@/core/recommendations/recommendationScoring';
import { RecommendationDeduplicator } from '@/core/recommendations/recommendationDeduplication';
import { recommendationEngine } from '@/core/recommendations/recommendationEngine';
import { recommendationService } from '@/core/recommendations/recommendationService';
import { recommendationStore } from '@/lib/storage/recommendationStore';
import { recommendationFeedbackStore } from '@/lib/storage/recommendationFeedbackStore';
import { RBACManager } from '@/core/auth/rbac';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { workflowStore } from '@/lib/storage/workflowStore';
import { executionStore } from '@/lib/storage/executionStore';
import { aiUsageStore } from '@/lib/storage/aiUsageStore';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { workspaceLimitsStore } from '@/lib/storage/workspaceLimitsStore';
import { RECOMMENDATION_RULES } from '@/core/recommendations/recommendationDefinitions';

describe('Phase 9G: Optimization Recommendations Engine', () => {
  const TEST_WS = 'ws_phase9g_test';

  beforeEach(() => {
    // Reset test workspace limits and fixtures
    workspaceLimitsStore.setLimits(TEST_WS, {
      maxWorkflows: 10,
      maxMonthlyExecutions: 100,
      maxAiCostMonthlyUsd: 20.0,
    });
  });

  describe('1. Deterministic Priority & Confidence Scoring', () => {
    it('should calculate priority score strictly from severity, frequency, and impact components [10 - 100]', () => {
      // Critical severity (40) + full frequency (30) + full impact (30) = 100
      const maxScore = RecommendationScorer.calculatePriority({
        severity: 'CRITICAL',
        affectedRatio: 1.0,
        impactRatio: 1.0,
      });
      expect(maxScore).toBe(100);

      // Low severity (10) + zero frequency (0) + zero impact (0) = 10
      const minScore = RecommendationScorer.calculatePriority({
        severity: 'LOW',
        affectedRatio: 0,
        impactRatio: 0,
      });
      expect(minScore).toBe(10);

      // High severity (30) + 50% frequency (15) + 33% impact (10) = 55
      const midScore = RecommendationScorer.calculatePriority({
        severity: 'HIGH',
        affectedRatio: 0.5,
        impactRatio: 0.33,
      });
      expect(midScore).toBe(55);
    });

    it('should calculate confidence score based on sample size, data completeness, and consistency [25 - 100]', () => {
      // Large sample (>=10 -> 50) + complete data (30) + sustained (20) = 100 -> HIGH
      const highConf = RecommendationScorer.calculateConfidence({
        sampleSize: 15,
        hasUnpricedAiModels: false,
        isWebhookBufferTruncated: false,
        isMultiRunSustained: true,
      });
      expect(highConf.score).toBe(100);
      expect(highConf.tier).toBe('HIGH');

      // Medium sample (5-9 -> 40) + complete data (30) + not sustained (0) = 70 -> MEDIUM
      const medSample = RecommendationScorer.calculateConfidence({
        sampleSize: 6,
        isMultiRunSustained: false,
      });
      expect(medSample.score).toBe(70);
      expect(medSample.tier).toBe('MEDIUM');

      // Low sample (<3 -> 15) + unpriced models penalty (-10 -> 20) + not sustained (0) = 35 -> LOW
      const lowConf = RecommendationScorer.calculateConfidence({
        sampleSize: 2,
        hasUnpricedAiModels: true,
        isMultiRunSustained: false,
      });
      expect(lowConf.score).toBe(35);
      expect(lowConf.tier).toBe('LOW');
    });

    it('should combine priority and confidence independently without confusing probability', () => {
      const result = RecommendationScorer.score(
        { severity: 'CRITICAL', affectedRatio: 0.8, impactRatio: 0.5 },
        { sampleSize: 2, hasUnpricedAiModels: true, isMultiRunSustained: false }
      );

      // High priority despite low confidence
      expect(result.priorityScore).toBeGreaterThanOrEqual(75);
      expect(result.confidenceTier).toBe('LOW');
      expect(result.confidenceScore).toBeLessThan(50);
    });
  });

  describe('2. Rule Definitions & Heuristics Catalogue', () => {
    it('should contain rule definitions covering all 8 diagnostic categories', () => {
      const categories = new Set(
        Object.values(RECOMMENDATION_RULES).map((r) => r.category)
      );

      expect(categories.has('WORKFLOW_PERFORMANCE')).toBe(true);
      expect(categories.has('NODE_OPTIMIZATION')).toBe(true);
      expect(categories.has('RELIABILITY')).toBe(true);
      expect(categories.has('INTEGRATION')).toBe(true);
      expect(categories.has('AI_COST')).toBe(true);
      expect(categories.has('SCHEDULING')).toBe(true);
      expect(categories.has('RESOURCE_USAGE')).toBe(true);
      expect(categories.has('WORKFLOW_ARCHITECTURE')).toBe(true);
      expect(categories.size).toBe(8);
    });

    it('should include concrete heuristics, limitations, and data limitations for every rule', () => {
      for (const rule of Object.values(RECOMMENDATION_RULES)) {
        expect(rule.id).toBeDefined();
        expect(rule.name).toBeDefined();
        expect(rule.description).toBeDefined();
        expect(rule.defaultSeverity).toBeDefined();
        expect(rule.initialThresholds).toBeDefined();
        expect(Array.isArray(rule.standardLimitations)).toBe(true);
        expect(rule.standardLimitations.length).toBeGreaterThan(0);
        expect(Array.isArray(rule.standardDataLimitations)).toBe(true);
        expect(rule.standardDataLimitations.length).toBeGreaterThan(0);
        expect(Array.isArray(rule.suggestedActions)).toBe(true);
      }
    });
  });

  describe('3. Deduplication, Cooldown & Regeneration Safeguards', () => {
    beforeAll(() => {
      recommendationStore.clearWorkspace(TEST_WS);
    });

    const candidateBase = {
      workspaceId: TEST_WS,
      ruleId: 'PERF_SLOW_WORKFLOW_P95',
      category: 'WORKFLOW_PERFORMANCE' as const,
      title: 'Test Slow Workflow',
      summary: 'Tail latency spike',
      description: 'Detailed description',
      severity: 'HIGH' as const,
      priorityScore: 75,
      confidence: 'HIGH' as const,
      confidenceScore: 85,
      targetType: 'WORKFLOW' as const,
      targetId: 'wf_test_dedup',
      targetName: 'Test Workflow',
      evidence: [
        {
          metricName: 'p95DurationMs',
          observedValue: '35.0s',
          sampleSize: 10,
          measurementPeriod: {
            from: new Date(Date.now() - 86400000).toISOString(),
            to: new Date().toISOString(),
          },
          sourceService: 'AnalyticsService',
        },
      ],
      suggestedActions: [],
      limitations: [],
      dataLimitations: [],
    };

    it('should create new recommendation and update active in-place without duplicating', () => {
      // 1. Initial creation
      const first = RecommendationDeduplicator.processCandidate(candidateBase);
      expect(first).not.toBeNull();
      expect(first?.isNew).toBe(true);
      expect(first?.recommendation.status).toBe('NEW');
      expect(first?.recommendation.occurrenceCount).toBe(1);
      const originalId = first!.recommendation.id;

      // 2. Second evaluation should update existing active record
      const second = RecommendationDeduplicator.processCandidate(candidateBase);
      expect(second).not.toBeNull();
      expect(second?.isNew).toBe(false);
      expect(second?.recommendation.id).toBe(originalId);
      expect(second?.recommendation.occurrenceCount).toBe(2);
    });

    it('should honor dismissal and suppress regeneration if no new evidence exists', () => {
      const active = recommendationStore.getActiveByDedupKey(
        RecommendationDeduplicator.generateDedupKey(TEST_WS, 'PERF_SLOW_WORKFLOW_P95', 'wf_test_dedup')
      );
      if (active) {
        recommendationStore.dismiss(active.id, 'usr_admin', 'Acceptable latency for batch job');
      }

      // Re-evaluating with same evidence timestamps should be suppressed
      const dismissedCandidate = {
        ...candidateBase,
        evidence: [
          {
            metricName: 'p95DurationMs',
            observedValue: '35.0s',
            sampleSize: 10,
            measurementPeriod: {
              from: new Date(Date.now() - 86400000 * 2).toISOString(),
              to: new Date(Date.now() - 3600000).toISOString(), // Earlier than dismissal
            },
            sourceService: 'AnalyticsService',
          },
        ],
      };

      const res = RecommendationDeduplicator.processCandidate(dismissedCandidate);
      expect(res).toBeNull();
    });

    it('should regenerate as a NEW recommendation when fresh qualifying evidence occurs after resolution', () => {
      const active = recommendationStore.getActiveByDedupKey(
        RecommendationDeduplicator.generateDedupKey(TEST_WS, 'PERF_SLOW_WORKFLOW_P95', 'wf_test_dedup')
      );
      if (active) {
        recommendationStore.resolve(active.id, 'usr_admin', 'Remediated');
      }

      // Re-evaluating with fresh timestamp strictly newer than resolution
      const freshCandidate = {
        ...candidateBase,
        evidence: [
          {
            metricName: 'p95DurationMs',
            observedValue: '42.0s',
            sampleSize: 12,
            measurementPeriod: {
              from: new Date(Date.now() - 3600000).toISOString(),
              to: new Date(Date.now() + 1000).toISOString(), // Newer
            },
            sourceService: 'AnalyticsService',
          },
        ],
      };

      const regenerated = RecommendationDeduplicator.processCandidate(freshCandidate);
      expect(regenerated).not.toBeNull();
      expect(regenerated?.isNew).toBe(true);
      expect(regenerated?.wasRegenerated).toBe(true);
      expect(regenerated?.recommendation.status).toBe('NEW');
    });
  });

  describe('4. Lifecycle State Machine & History Audit', () => {
    let recId: string;

    it('should advance recommendation through lifecycle states: NEW -> VIEWED -> SNOOZED -> RESOLVED', () => {
      const rec = recommendationStore.save({
        id: `rec_lifecycle_${Date.now()}`,
        workspaceId: TEST_WS,
        ruleId: 'PERF_SLOW_WORKFLOW_P95',
        category: 'WORKFLOW_PERFORMANCE',
        title: 'Lifecycle Test',
        summary: 'Testing states',
        description: 'Description',
        severity: 'MEDIUM',
        priorityScore: 50,
        confidence: 'HIGH',
        confidenceScore: 80,
        targetType: 'WORKFLOW',
        evidence: [],
        suggestedActions: [],
        limitations: [],
        dataLimitations: [],
        status: 'NEW',
        dedupKey: `rec_${TEST_WS}_lifecycle_test`,
        occurrenceCount: 1,
        firstIdentifiedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      recId = rec.id;

      // 1. View
      const viewed = recommendationStore.view(recId, 'usr_operator', TEST_WS);
      expect(viewed?.status).toBe('VIEWED');
      expect(viewed?.viewedAt).toBeDefined();

      // 2. Snooze
      const snoozeUntil = new Date(Date.now() + 86400000 * 7).toISOString();
      const snoozed = recommendationStore.snooze(recId, 'usr_operator', snoozeUntil, TEST_WS);
      expect(snoozed?.status).toBe('SNOOZED');
      expect(snoozed?.snoozedUntil).toBe(snoozeUntil);

      // 3. Resolve
      const resolved = recommendationStore.resolve(
        recId,
        'usr_lead',
        'Fixed by indexing DB queries',
        TEST_WS
      );
      expect(resolved?.status).toBe('RESOLVED');
      expect(resolved?.resolutionNotes).toBe('Fixed by indexing DB queries');
    });

    it('should maintain immutable audit trail of all lifecycle events', () => {
      const history = recommendationStore.getHistory(recId, TEST_WS);
      expect(history.length).toBeGreaterThanOrEqual(3);

      const actions = history.map((h) => h.action);
      expect(actions).toContain('VIEWED');
      expect(actions).toContain('SNOOZED');
      expect(actions).toContain('RESOLVED');
    });
  });

  describe('5. User Feedback Mechanism', () => {
    it('should record user feedback without altering underlying data', async () => {
      const fb = await recommendationService.submitFeedback({
        recommendationId: 'rec_sample_fb',
        workspaceId: TEST_WS,
        userId: 'usr_analyst',
        userName: 'Analyst User',
        type: 'HELPFUL',
        comments: 'Accurately identified our slow endpoint',
      });

      expect(fb.id).toBeDefined();
      expect(fb.type).toBe('HELPFUL');
      expect(fb.comments).toBe('Accurately identified our slow endpoint');

      const list = await recommendationService.getFeedback('rec_sample_fb', TEST_WS);
      expect(list.some((f) => f.id === fb.id)).toBe(true);
    });
  });

  describe('6. Master Recommendation Engine Evaluation', () => {
    it('should execute workspace diagnostic evaluation cleanly across all categories', async () => {
      const result = await recommendationEngine.evaluateWorkspace('ws_default');

      expect(result.workspaceId).toBe('ws_default');
      expect(result.totalEvaluatedRules).toBe(Object.keys(RECOMMENDATION_RULES).length);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.evaluatedAt).toBeDefined();
    });

    it('should provide empty state and overview metrics safely when no issues are found', async () => {
      const emptyWs = 'ws_clean_no_issues';
      const overview = await recommendationService.getOverview(emptyWs);

      expect(overview.workspaceId).toBe(emptyWs);
      expect(overview.totalActive).toBe(0);
      expect(overview.criticalCount).toBe(0);
      expect(overview.resolvedCount).toBe(0);
    });

    it('should distinguish genuine error ports from ordinary conditional false/else branches in error analysis', async () => {
      // Create a test workflow with an HTTP node that only has a "false" or "else" branch
      const testWf = workflowStore.save({
        id: 'wf_err_test_1',
        name: 'Workflow With Conditional Edge Only',
        workspaceId: 'ws_err_test',
        description: 'Test wf',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        nodes: [
          { id: 'node_trigger', type: 'trigger_manual', name: 'Trigger', category: 'trigger', position: { x: 0, y: 0 }, config: {} },
          { id: 'node_http', type: 'http_request', name: 'Remote API', category: 'action', position: { x: 100, y: 0 }, config: {} },
          { id: 'node_fallback', type: 'log', name: 'False Branch', category: 'action', position: { x: 200, y: 0 }, config: {} },
        ],
        edges: [
          { id: 'e1', source: 'node_trigger', target: 'node_http' },
          { id: 'e2', source: 'node_http', target: 'node_fallback', sourceHandle: 'false' }, // ordinary conditional false branch
        ],
      });

      const res = await recommendationEngine.evaluateWorkspace('ws_err_test');
      const errRec = res.recommendations.find((r) => r.ruleId.startsWith('ARCH_UNHANDLED_ERROR_PATH'));
      // Since 'false' branch does not count as error handler, unhandled error recommendation SHOULD be raised
      expect(errRec).toBeDefined();
      expect(errRec?.targetId).toBe('node_http');
    });

    it('should label parallelization recommendations as uncertain candidates and verify data dependencies', async () => {
      // Create workflow with two sequential HTTP nodes with NO data dependencies
      const parWf = workflowStore.save({
        id: 'wf_par_test_1',
        name: 'Parallel Candidate Workflow',
        workspaceId: 'ws_par_test',
        description: 'Test wf',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        nodes: [
          { id: 'node_start', type: 'trigger_manual', name: 'Start', category: 'trigger', position: { x: 0, y: 0 }, config: {} },
          { id: 'node_http1', type: 'http_request', name: 'Fetch A', category: 'action', position: { x: 100, y: 0 }, config: { url: 'https://api.a.com' } },
          { id: 'node_http2', type: 'http_request', name: 'Fetch B', category: 'action', position: { x: 200, y: 0 }, config: { url: 'https://api.b.com' } },
        ],
        edges: [
          { id: 'e1', source: 'node_start', target: 'node_http1' },
          { id: 'e2', source: 'node_http1', target: 'node_http2' },
        ],
      });

      const res = await recommendationEngine.evaluateWorkspace('ws_par_test');
      const parRec = res.recommendations.find((r) => r.ruleId === 'PERF_POTENTIAL_PARALLELIZATION');
      expect(parRec).toBeDefined();
      expect(parRec?.title).toContain('[Candidate - Requires Verification]');
      expect(parRec?.limitations.some((l) => l.includes('Graph topology alone cannot prove execution independence'))).toBe(true);
    });
  });

  describe('7. Security, RBAC & Workspace Isolation', () => {
    it('should enforce OWNER and ADMIN have full recommendation permissions', () => {
      expect(RBACManager.hasPermission('OWNER', 'recommendation:read')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'recommendation:evaluate')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'recommendation:manage')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'recommendation:feedback')).toBe(true);

      expect(RBACManager.hasPermission('ADMIN', 'recommendation:read')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'recommendation:manage')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'recommendation:evaluate')).toBe(true);
    });

    it('should enforce that EDITOR has read, evaluate, and feedback, but cannot manage (dismiss/snooze/resolve)', () => {
      expect(RBACManager.hasPermission('EDITOR', 'recommendation:read')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'recommendation:evaluate')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'recommendation:feedback')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'recommendation:manage')).toBe(false);
    });

    it('should enforce that VIEWER has read-only access', () => {
      expect(RBACManager.hasPermission('VIEWER', 'recommendation:read')).toBe(true);
      expect(RBACManager.hasPermission('VIEWER', 'recommendation:evaluate')).toBe(false);
      expect(RBACManager.hasPermission('VIEWER', 'recommendation:manage')).toBe(false);
      expect(RBACManager.hasPermission('VIEWER', 'recommendation:feedback')).toBe(false);
    });

    it('should enforce cross-workspace isolation on recommendation retrieval', async () => {
      const rec = recommendationStore.save({
        id: `rec_iso_${Date.now()}`,
        workspaceId: TEST_WS,
        ruleId: 'PERF_SLOW_WORKFLOW_P95',
        category: 'WORKFLOW_PERFORMANCE',
        title: 'Isolation Test',
        summary: 'Testing cross-tenant isolation',
        description: 'Description',
        severity: 'LOW',
        priorityScore: 30,
        confidence: 'HIGH',
        confidenceScore: 80,
        targetType: 'WORKFLOW',
        evidence: [],
        suggestedActions: [],
        limitations: [],
        dataLimitations: [],
        status: 'NEW',
        dedupKey: `rec_${TEST_WS}_iso_test`,
        occurrenceCount: 1,
        firstIdentifiedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Target workspace should find it
      const sameWs = await recommendationService.getRecommendationById(rec.id, TEST_WS);
      expect(sameWs).not.toBeNull();

      // Different workspace should get null
      const diffWs = await recommendationService.getRecommendationById(rec.id, 'ws_alien_tenant');
      expect(diffWs).toBeNull();
    });
  });

  describe('8. Audit Trail Integration', () => {
    it('should record audit log entries with resourceType recommendation and redacted sensitive data', () => {
      const auditLog = auditLogStore.log({
        workspaceId: TEST_WS,
        actorId: 'usr_admin',
        actorName: 'Admin Shahid',
        actorEmail: 'admin@flowpilot.internal',
        action: 'recommendation.evaluated',
        resourceType: 'recommendation',
        resourceId: TEST_WS,
        resourceName: 'Optimization Engine Evaluation',
        metadata: {
          totalRules: 18,
          secretApiKey: 'MUST_BE_REDACTED',
        },
      });

      expect(auditLog.resourceType).toBe('recommendation');
      expect(auditLog.action).toBe('recommendation.evaluated');
      expect(auditLog.metadata?.secretApiKey).toBe('[REDACTED]');
    });
  });
});
