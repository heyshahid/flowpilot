import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateSuccessRate,
  calculateFailureRate,
  calculateMeanDuration,
  calculateMedianDuration,
  calculateP95Duration,
  filterValidDurations,
  formatDuration,
  formatPercent,
  formatCurrency,
  generateBuckets,
  bucketExecutions,
  BottleneckAnalyzer,
  AIPricingManager,
  AnalyticsService,
  analyticsService,
  ModelPricingTier,
} from '../src/core/analytics';
import { WorkflowExecutionRecord, StepExecutionRecord } from '../src/core/execution/types';
import { executionStore } from '../src/lib/storage/executionStore';
import { aiUsageStore } from '../src/lib/storage/aiUsageStore';
import { scheduleStore } from '../src/lib/storage/scheduleStore';
import { webhookStore } from '../src/lib/storage/webhookStore';

describe('Phase 9A: Analytics Data Architecture & Aggregation Layer', () => {
  describe('1. Pure Metric Definitions & Zero-Division Safeguards', () => {
    it('should correctly calculate terminal success rate and failure rate', () => {
      const success = calculateSuccessRate(80, 20);
      expect(success.isAvailable).toBe(true);
      expect(success.value).toBe(80.0);
      expect(success.formatted).toBe('80.0%');
      expect(success.sampleSize).toBe(100);

      const failure = calculateFailureRate(80, 20);
      expect(failure.isAvailable).toBe(true);
      expect(failure.value).toBe(20.0);
      expect(failure.formatted).toBe('20.0%');
      expect(failure.sampleSize).toBe(100);
    });

    it('should return isAvailable: false and value: null when terminal executions is 0 (zero-division guard)', () => {
      const success = calculateSuccessRate(0, 0);
      expect(success.isAvailable).toBe(false);
      expect(success.value).toBeNull();
      expect(success.formatted).toBe('N/A');
      expect(success.sampleSize).toBe(0);

      const failure = calculateFailureRate(0, 0);
      expect(failure.isAvailable).toBe(false);
      expect(failure.value).toBeNull();
      expect(failure.formatted).toBe('N/A');
    });

    it('should filter out invalid, negative, or NaN durations', () => {
      const raw = [100, -50, NaN, 250, Infinity, 0, 400];
      const valid = filterValidDurations(raw);
      expect(valid).toEqual([100, 250, 0, 400]);
    });

    it('should calculate mean duration accurately', () => {
      const durations = [100, 200, 300, 400];
      const mean = calculateMeanDuration(durations);
      expect(mean.isAvailable).toBe(true);
      expect(mean.value).toBe(250);
      expect(mean.formatted).toBe('250ms');
    });

    it('should calculate median duration for odd and even sample sizes', () => {
      // Odd sample size (middle element)
      const odd = [50, 10, 100]; // sorted: [10, 50, 100] -> median 50
      const medianOdd = calculateMedianDuration(odd);
      expect(medianOdd.value).toBe(50);

      // Even sample size (average of two middle elements)
      const even = [100, 200, 400, 300]; // sorted: [100, 200, 300, 400] -> median 250
      const medianEven = calculateMedianDuration(even);
      expect(medianEven.value).toBe(250);
    });

    it('should calculate p95 duration accurately', () => {
      const samples = Array.from({ length: 100 }, (_, i) => (i + 1) * 10); // 10, 20, ..., 1000
      const p95 = calculateP95Duration(samples);
      expect(p95.isAvailable).toBe(true);
      expect(p95.value).toBe(950);
    });

    it('should return null and unavailable for empty duration arrays', () => {
      const res = calculateMeanDuration([]);
      expect(res.isAvailable).toBe(false);
      expect(res.value).toBeNull();
      expect(res.formatted).toBe('N/A');
    });
  });

  describe('2. Time-Series Bucketing & Continuous Timelines', () => {
    it('should generate hourly buckets with strict [start, end) boundaries', () => {
      const from = new Date('2026-11-13T10:00:00Z');
      const to = new Date('2026-11-13T14:00:00Z');
      const buckets = generateBuckets(from, to, 'hour');

      expect(buckets.length).toBe(4);
      expect(buckets[0].start.toISOString()).toBe('2026-11-13T10:00:00.000Z');
      expect(buckets[0].end.toISOString()).toBe('2026-11-13T11:00:00.000Z');
      expect(buckets[3].start.toISOString()).toBe('2026-11-13T13:00:00.000Z');
      expect(buckets[3].end.toISOString()).toBe('2026-11-13T14:00:00.000Z');
    });

    it('should bucket executions into [start, end) without double-counting', () => {
      const from = new Date('2026-11-13T10:00:00Z');
      const to = new Date('2026-11-13T12:00:00Z');

      const mockExecs: WorkflowExecutionRecord[] = [
        {
          id: 'e1',
          workflowId: 'wf1',
          workflowName: 'WF 1',
          status: 'COMPLETED',
          startedAt: '2026-11-13T10:00:00.000Z', // exactly at bucket 0 start (inclusive)
          durationMs: 120,
          retryCount: 0,
          maxRetries: 3,
          trigger: { type: 'manual', timestamp: '2026-11-13T10:00:00.000Z' },
          traces: [],
        },
        {
          id: 'e2',
          workflowId: 'wf1',
          workflowName: 'WF 1',
          status: 'FAILED',
          startedAt: '2026-11-13T10:59:59.999Z', // in bucket 0
          durationMs: 50,
          retryCount: 0,
          maxRetries: 3,
          trigger: { type: 'manual', timestamp: '2026-11-13T10:59:59.999Z' },
          traces: [],
        },
        {
          id: 'e3',
          workflowId: 'wf1',
          workflowName: 'WF 1',
          status: 'COMPLETED',
          startedAt: '2026-11-13T11:00:00.000Z', // exactly at bucket 0 end, so bucket 1 start
          durationMs: 200,
          retryCount: 0,
          maxRetries: 3,
          trigger: { type: 'manual', timestamp: '2026-11-13T11:00:00.000Z' },
          traces: [],
        },
      ];

      const res = bucketExecutions(mockExecs, from, to, 'hour');
      expect(res.points.length).toBe(2);
      expect(res.boundaryRule).toContain('[start, end)');

      // Bucket 0: 10:00 -> 11:00
      expect(res.points[0].total).toBe(2);
      expect(res.points[0].completed).toBe(1);
      expect(res.points[0].failed).toBe(1);

      // Bucket 1: 11:00 -> 12:00
      expect(res.points[1].total).toBe(1);
      expect(res.points[1].completed).toBe(1);
      expect(res.points[1].failed).toBe(0);
    });

    it('should zero-fill missing intervals so timeline has no gaps', () => {
      const from = new Date('2026-11-13T10:00:00Z');
      const to = new Date('2026-11-13T15:00:00Z');
      // No executions at all
      const res = bucketExecutions([], from, to, 'hour');

      expect(res.points.length).toBe(5);
      for (const p of res.points) {
        expect(p.total).toBe(0);
        expect(p.completed).toBe(0);
        expect(p.failed).toBe(0);
        expect(p.meanDurationMs).toBeNull();
      }
    });
  });

  describe('3. Node Bottleneck Analyzer & Statistical Safeguards', () => {
    it('should NOT trigger warnings if sample size is below minimum threshold (N < 5)', () => {
      // 4 executions of a very slow node
      const traces: StepExecutionRecord[] = [
        { nodeId: 'slow_node', nodeType: 'http', nodeName: 'Slow API', status: 'COMPLETED', durationMs: 900, attempts: 1 },
        { nodeId: 'slow_node', nodeType: 'http', nodeName: 'Slow API', status: 'COMPLETED', durationMs: 950, attempts: 1 },
        { nodeId: 'slow_node', nodeType: 'http', nodeName: 'Slow API', status: 'FAILED', durationMs: 800, attempts: 1 },
        { nodeId: 'slow_node', nodeType: 'http', nodeName: 'Slow API', status: 'COMPLETED', durationMs: 920, attempts: 1 },
      ];

      const mockExecutions: WorkflowExecutionRecord[] = traces.map((t, idx) => ({
        id: `exec_${idx}`,
        workflowId: 'wf_test',
        workflowName: 'Test WF',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [t],
      }));

      const analysis = BottleneckAnalyzer.analyze(mockExecutions, { minExecutionsThreshold: 5 });
      expect(analysis.length).toBe(1);
      const node = analysis[0];

      expect(node.executionCount).toBe(4);
      expect(node.sampleSizeAdequate).toBe(false);
      // Warning must NOT trigger because N < 5
      expect(node.warnings.highDuration).toBe(false);
      expect(node.warnings.highFailureRate).toBe(false);
    });

    it('should trigger highDuration warning when N >= 5 and duration contribution exceeds 40%', () => {
      const traces: StepExecutionRecord[] = Array.from({ length: 6 }, (_, i) => ({
        nodeId: 'heavy_node',
        nodeType: 'ai.generate',
        nodeName: 'AI Generation Node',
        status: 'COMPLETED',
        durationMs: 600, // 600ms out of 1000ms workflow = 60% ratio
        attempts: 1,
      }));

      const mockExecutions: WorkflowExecutionRecord[] = traces.map((t, idx) => ({
        id: `exec_${idx}`,
        workflowId: 'wf_test',
        workflowName: 'Test WF',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [t],
      }));

      const analysis = BottleneckAnalyzer.analyze(mockExecutions, {
        minExecutionsThreshold: 5,
        highDurationThreshold: 0.40,
      });

      const node = analysis[0];
      expect(node.sampleSizeAdequate).toBe(true);
      expect(node.durationContributionRatio).toBe(0.6);
      expect(node.warnings.highDuration).toBe(true);
      expect(node.warnings.highFailureRate).toBe(false);
    });

    it('should trigger highFailureRate warning when N >= 5 and failure rate exceeds 15%', () => {
      const traces: StepExecutionRecord[] = [
        { nodeId: 'flaky_node', nodeType: 'http', nodeName: 'Flaky Service', status: 'COMPLETED', durationMs: 100, attempts: 1 },
        { nodeId: 'flaky_node', nodeType: 'http', nodeName: 'Flaky Service', status: 'FAILED', durationMs: 100, attempts: 1, error: 'Timeout 504' },
        { nodeId: 'flaky_node', nodeType: 'http', nodeName: 'Flaky Service', status: 'COMPLETED', durationMs: 100, attempts: 1 },
        { nodeId: 'flaky_node', nodeType: 'http', nodeName: 'Flaky Service', status: 'FAILED', durationMs: 100, attempts: 1, error: 'Timeout 504' },
        { nodeId: 'flaky_node', nodeType: 'http', nodeName: 'Flaky Service', status: 'COMPLETED', durationMs: 100, attempts: 1 },
      ]; // 2 failed out of 5 = 40% failure rate (> 15%)

      const mockExecutions: WorkflowExecutionRecord[] = traces.map((t, idx) => ({
        id: `exec_${idx}`,
        workflowId: 'wf_test',
        workflowName: 'Test WF',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [t],
      }));

      const analysis = BottleneckAnalyzer.analyze(mockExecutions, {
        minExecutionsThreshold: 5,
        highFailureThreshold: 15.0,
      });

      const node = analysis[0];
      expect(node.sampleSizeAdequate).toBe(true);
      expect(node.failureRatePercent).toBe(40.0);
      expect(node.warnings.highFailureRate).toBe(true);
      expect(node.errorCategories['Timeout 504']).toBe(2);
    });

    it('should gracefully handle duration contribution ratio > 1.0 in parallel/loop workflows', () => {
      // In parallel branches, a node might run multiple times or accumulate duration higher than workflow wall-clock
      const traces: StepExecutionRecord[] = Array.from({ length: 5 }, () => ({
        nodeId: 'parallel_worker',
        nodeType: 'worker',
        nodeName: 'Parallel Worker',
        status: 'COMPLETED',
        durationMs: 1250, // 1250ms node vs 1000ms wall-clock
        attempts: 1,
      }));

      const mockExecutions: WorkflowExecutionRecord[] = traces.map((t, idx) => ({
        id: `exec_${idx}`,
        workflowId: 'wf_parallel',
        workflowName: 'Parallel WF',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [t],
      }));

      const analysis = BottleneckAnalyzer.analyze(mockExecutions, { minExecutionsThreshold: 5 });
      const node = analysis[0];

      expect(node.durationContributionRatio).toBe(1.25);
      expect(node.warnings.highDuration).toBe(true);
      // Ensure ranking score does not break or overflow
      expect(node.bottleneckRankingScore).toBeGreaterThan(0);
    });
  });

  describe('4. AI Pricing Architecture & Versioned Cost Accounting', () => {
    it('should calculate accurate cost for known OpenAI gpt-4o-mini tier', () => {
      // gpt-4o-mini: $0.15/1M input, $0.60/1M output
      // 10,000 prompt tokens = $0.0015
      // 5,000 completion tokens = $0.003
      // Total = $0.0045
      const cost = AIPricingManager.calculateCost('openai', 'gpt-4o-mini', 10000, 5000);
      expect(cost.isAvailable).toBe(true);
      expect(cost.costUsd).toBe(0.0045);
      expect(cost.currency).toBe('USD');
      expect(cost.pricingVersion).toBe('2026-Q1');
    });

    it('should return costUsd: null and isAvailable: false for unknown models without fabricating zero', () => {
      const cost = AIPricingManager.calculateCost('openai', 'unregistered-future-model-x', 1000, 500);
      expect(cost.isAvailable).toBe(false);
      expect(cost.costUsd).toBeNull();
    });

    it('should allow dynamic registration of newer pricing versions', () => {
      const newTier: ModelPricingTier = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        inputPricePerMillion: 0.10, // Discounted
        outputPricePerMillion: 0.40,
        currency: 'USD',
        effectiveFrom: '2026-06-01T00:00:00Z',
        pricingVersion: '2026-Q2',
      };

      AIPricingManager.registerTier(newTier);

      // Historical call before June 2026 should use 2026-Q1 ($0.15 / $0.60)
      const historicalCall = AIPricingManager.calculateCost(
        'openai',
        'gpt-4o-mini',
        1000000,
        1000000,
        new Date('2026-03-01T00:00:00Z')
      );
      expect(historicalCall.pricingVersion).toBe('2026-Q1');
      expect(historicalCall.costUsd).toBe(0.75); // 0.15 + 0.60

      // Call after June 2026 should use 2026-Q2 ($0.10 / $0.40)
      const modernCall = AIPricingManager.calculateCost(
        'openai',
        'gpt-4o-mini',
        1000000,
        1000000,
        new Date('2026-07-01T00:00:00Z')
      );
      expect(modernCall.pricingVersion).toBe('2026-Q2');
      expect(modernCall.costUsd).toBe(0.50); // 0.10 + 0.40
    });
  });

  describe('5. Real Storage Analytics Service Integration', () => {
    it('should return valid execution summary from actual storage data', async () => {
      const summary = await analyticsService.getExecutionSummary({
        workspaceId: 'ws_default',
        timeWindow: '30d',
      });

      expect(summary.totalExecutions).toBeGreaterThanOrEqual(0);
      expect(summary.reportingPeriod.from).toBeDefined();
      expect(summary.reportingPeriod.to).toBeDefined();

      if (summary.terminalExecutions > 0) {
        expect(summary.successRate.isAvailable).toBe(true);
        expect(typeof summary.successRate.value).toBe('number');
      } else {
        expect(summary.successRate.isAvailable).toBe(false);
      }
    });

    it('should enforce strict tenant isolation and return zero/empty state for empty workspaces', async () => {
      const emptySummary = await analyticsService.getExecutionSummary({
        workspaceId: 'ws_nonexistent_empty_tenant',
        timeWindow: '30d',
      });

      expect(emptySummary.totalExecutions).toBe(0);
      expect(emptySummary.terminalExecutions).toBe(0);
      expect(emptySummary.completedExecutions).toBe(0);
      expect(emptySummary.failedExecutions).toBe(0);
      expect(emptySummary.successRate.isAvailable).toBe(false);
      expect(emptySummary.successRate.value).toBeNull();
      expect(emptySummary.meanDurationMs.isAvailable).toBe(false);
    });

    it('should generate continuous time-series for actual workspace executions', async () => {
      const timeSeries = await analyticsService.getExecutionTimeSeries({
        workspaceId: 'ws_default',
        timeWindow: '7d',
      });

      expect(timeSeries.points.length).toBeGreaterThan(0);
      expect(timeSeries.boundaryRule).toContain('[start, end)');
    });

    it('should retrieve scheduler health metrics with confirmed configurations only', async () => {
      const schedHealth = await analyticsService.getSchedulerHealth('ws_default');
      expect(schedHealth.workspaceId).toBe('ws_default');
      expect(schedHealth.activeSchedulesCount).toBeGreaterThanOrEqual(0);
      expect(schedHealth.instrumentationStatus.workerHeartbeatInstrumented).toBe(false);
      expect(schedHealth.instrumentationStatus.queueDepthInstrumented).toBe(false);
      expect(schedHealth.instrumentationStatus.note).toContain('external Redis/BullMQ');
    });

    it('should retrieve integration health summary with documented 500-record buffer note', async () => {
      const intHealth = await analyticsService.getIntegrationHealth('ws_default');
      expect(intHealth.workspaceId).toBe('ws_default');
      expect(intHealth.totalDeliveriesSampled).toBeGreaterThanOrEqual(0);
      expect(intHealth.historyLimitation).toContain('500');
    });

    it('should retrieve AI usage summary and calculate versioned costs from real AI logs', async () => {
      const aiSummary = await analyticsService.getAIUsageAnalytics({
        workspaceId: 'ws_default',
        timeWindow: '30d',
      });

      expect(aiSummary.workspaceId).toBe('ws_default');
      expect(aiSummary.pricingVersionUsed).toBe('2026-Q1');
      expect(typeof aiSummary.totalRequests).toBe('number');
      expect(typeof aiSummary.totalTokens).toBe('number');
    });
  });
});
