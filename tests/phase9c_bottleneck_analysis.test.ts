import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { BottleneckAnalyzer } from '../src/core/analytics/bottleneckAnalyzer';
import { GET as getWorkflowNodes } from '../src/app/api/v1/analytics/workflows/[id]/nodes/route';
import { GET as getNodeExecutions } from '../src/app/api/v1/analytics/workflows/[id]/nodes/[nodeId]/executions/route';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { workspaceStore } from '../src/lib/storage/workspaceStore';
import { executionStore } from '../src/lib/storage/executionStore';
import { WorkflowExecutionRecord, StepExecutionRecord } from '../src/core/execution/types';

describe('Phase 9C: Node-Level Bottleneck Analysis & Optimization Diagnostics', () => {
  let testWorkspaceId: string;
  let otherWorkspaceId: string;
  const testWorkflowId = 'wf_phase9c_test_pipeline';

  beforeAll(() => {
    // 1. Create test workspaces
    const testWs = workspaceStore.create({
      name: 'Phase 9C Diagnostics Workspace',
      ownerId: 'usr_owner',
    });
    testWorkspaceId = testWs.id;

    const otherWs = workspaceStore.create({
      name: 'Phase 9C Isolated Other Tenant',
      ownerId: 'usr_owner',
    });
    otherWorkspaceId = otherWs.id;

    // 2. Save test workflow
    workflowStore.save(
      {
        id: testWorkflowId,
        name: 'Order Processing & Fulfillment Pipeline',
        description: 'End-to-end multi-step order workflow',
        triggerType: 'trigger.webhook',
        status: 'active',
        nodes: [
          { id: 'node_trigger', type: 'trigger.webhook', name: 'Order Webhook', category: 'trigger', config: {} },
          { id: 'node_validate', type: 'logic.ifElse', name: 'Validate Order Schema', category: 'logic', config: {} },
          { id: 'node_ai_summary', type: 'ai.generate', name: 'AI Order Insights', category: 'ai', config: {} },
          { id: 'node_http_crm', type: 'http.request', name: 'Sync CRM API', category: 'integration', config: {} },
          { id: 'node_notify_slack', type: 'notification.slack', name: 'Notify Team', category: 'action', config: {} },
        ],
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceId: testWorkspaceId,
      },
      { workspaceId: testWorkspaceId }
    );
  });

  describe('1. Node Metric Aggregation & Distinct Count Accounting', () => {
    it('should distinguish unique workflow executions from retry attempts and loop executions', () => {
      // 2 workflow executions, but node runs multiple times per execution (loop/retry)
      const mockExecutions: WorkflowExecutionRecord[] = [
        {
          id: 'exec_wf_1',
          workflowId: testWorkflowId,
          workflowName: 'Pipeline',
          status: 'COMPLETED',
          startedAt: '2026-11-13T10:00:00Z',
          durationMs: 1000,
          retryCount: 0,
          maxRetries: 3,
          trigger: { type: 'manual', timestamp: '2026-11-13T10:00:00Z' },
          traces: [
            {
              nodeId: 'node_loop_worker',
              nodeType: 'worker',
              nodeName: 'Item Processor',
              status: 'COMPLETED',
              durationMs: 100,
              attempts: 1,
              retryCount: 0,
            },
            {
              nodeId: 'node_loop_worker',
              nodeType: 'worker',
              nodeName: 'Item Processor',
              status: 'COMPLETED',
              durationMs: 120,
              attempts: 2, // 1 retry attempt
              retryCount: 1,
            },
          ],
        },
        {
          id: 'exec_wf_2',
          workflowId: testWorkflowId,
          workflowName: 'Pipeline',
          status: 'COMPLETED',
          startedAt: '2026-11-13T10:05:00Z',
          durationMs: 800,
          retryCount: 0,
          maxRetries: 3,
          trigger: { type: 'manual', timestamp: '2026-11-13T10:05:00Z' },
          traces: [
            {
              nodeId: 'node_loop_worker',
              nodeType: 'worker',
              nodeName: 'Item Processor',
              status: 'COMPLETED',
              durationMs: 110,
              attempts: 1,
              retryCount: 0,
            },
          ],
        },
      ];

      const metrics = BottleneckAnalyzer.analyze(mockExecutions);
      const node = metrics.find((m) => m.nodeId === 'node_loop_worker');

      expect(node).toBeDefined();
      expect(node!.executionCount).toBe(3); // 3 traces total
      expect(node!.uniqueWorkflowExecutions).toBe(2); // strictly 2 distinct workflow runs
      expect(node!.totalExecutionAttempts).toBe(4); // attempts: 1 + 2 + 1 = 4
      expect(node!.totalRetryCount).toBe(1);
    });

    it('should compute accurate min, max, mean, and median durations across valid node traces', () => {
      const durations = [50, 100, 200, 300, 450];
      const mockExecutions: WorkflowExecutionRecord[] = durations.map((d, i) => ({
        id: `exec_dur_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [
          {
            nodeId: 'node_timed',
            nodeType: 'step',
            nodeName: 'Timed Step',
            status: 'COMPLETED',
            durationMs: d,
            attempts: 1,
            retryCount: 0,
          },
        ],
      }));

      const metrics = BottleneckAnalyzer.analyze(mockExecutions);
      const node = metrics.find((m) => m.nodeId === 'node_timed');

      expect(node).toBeDefined();
      expect(node!.minDurationMs).toBe(50);
      expect(node!.maxDurationMs).toBe(450);
      expect(node!.meanDurationMs).toBe(220); // (50+100+200+300+450) / 5 = 220
      expect(node!.medianDurationMs).toBe(200); // sorted middle
    });

    it('should handle skipped nodes and missing duration values safely', () => {
      const mockExecutions: WorkflowExecutionRecord[] = [
        {
          id: 'exec_skip_1',
          workflowId: testWorkflowId,
          workflowName: 'Pipeline',
          status: 'COMPLETED',
          startedAt: new Date().toISOString(),
          durationMs: 500,
          retryCount: 0,
          maxRetries: 3,
          trigger: { type: 'manual', timestamp: new Date().toISOString() },
          traces: [
            {
              nodeId: 'node_skipped',
              nodeType: 'branch',
              nodeName: 'Skipped Branch',
              status: 'SKIPPED',
              durationMs: 0,
              attempts: 0,
              retryCount: 0,
            },
          ],
        },
      ];

      const metrics = BottleneckAnalyzer.analyze(mockExecutions);
      const node = metrics.find((m) => m.nodeId === 'node_skipped');

      expect(node).toBeDefined();
      expect(node!.skippedCount).toBe(1);
      expect(node!.successCount).toBe(0);
      expect(node!.failureCount).toBe(0);
      expect(node!.diagnosticStatus).toBe('INSUFFICIENT_DATA');
    });
  });

  describe('2. Diagnostic Policy, Classification & Evidence Generation', () => {
    it('should flag INSUFFICIENT_DATA when node observations are below 5', () => {
      const traces: StepExecutionRecord[] = [
        { nodeId: 'node_sparse', nodeType: 'http', nodeName: 'Sparse HTTP', status: 'COMPLETED', durationMs: 800, attempts: 1, retryCount: 0 },
        { nodeId: 'node_sparse', nodeType: 'http', nodeName: 'Sparse HTTP', status: 'FAILED', durationMs: 900, attempts: 1, retryCount: 0 },
        { nodeId: 'node_sparse', nodeType: 'http', nodeName: 'Sparse HTTP', status: 'COMPLETED', durationMs: 850, attempts: 1, retryCount: 0 },
      ]; // 3 runs (N < 5)

      const mockExecutions: WorkflowExecutionRecord[] = traces.map((t, i) => ({
        id: `exec_sparse_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [t],
      }));

      const metrics = BottleneckAnalyzer.analyze(mockExecutions, { minExecutionsThreshold: 5 });
      const node = metrics.find((m) => m.nodeId === 'node_sparse');

      expect(node!.sampleSizeAdequate).toBe(false);
      expect(node!.diagnosticStatus).toBe('INSUFFICIENT_DATA');
      expect(node!.diagnosticReasons[0]).toContain('minimum 5 required');
      expect(node!.warnings.highDuration).toBe(false);
      expect(node!.warnings.highFailureRate).toBe(false);
    });

    it('should diagnose SLOW when node duration exceeds 40% threshold with N >= 5', () => {
      const mockExecutions: WorkflowExecutionRecord[] = Array.from({ length: 6 }, (_, i) => ({
        id: `exec_slow_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000, // 1000ms workflow
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [
          {
            nodeId: 'node_slow_db',
            nodeType: 'database',
            nodeName: 'Database Query',
            status: 'COMPLETED',
            durationMs: 550, // 55% of workflow duration (>40%)
            attempts: 1,
            retryCount: 0,
          },
        ],
      }));

      const metrics = BottleneckAnalyzer.analyze(mockExecutions);
      const node = metrics.find((m) => m.nodeId === 'node_slow_db');

      expect(node!.sampleSizeAdequate).toBe(true);
      expect(node!.diagnosticStatus).toBe('SLOW');
      expect(node!.warnings.highDuration).toBe(true);
      expect(node!.warnings.highFailureRate).toBe(false);
      expect(node!.diagnosticReasons[0]).toContain('Latency bottleneck');
    });

    it('should diagnose UNRELIABLE when node failure rate exceeds 15% threshold with N >= 5', () => {
      // 5 executions: 4 completed, 1 failed = 20% failure rate (>15%)
      const statuses = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'FAILED'] as const;
      const mockExecutions: WorkflowExecutionRecord[] = statuses.map((status, i) => ({
        id: `exec_unreliable_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: status === 'FAILED' ? 'FAILED' : 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [
          {
            nodeId: 'node_unreliable_api',
            nodeType: 'http.request',
            nodeName: 'External Payment Gateway',
            status,
            durationMs: 100, // 10% duration (low)
            attempts: 1,
            retryCount: 0,
            error: status === 'FAILED' ? 'HTTP 502 Bad Gateway' : undefined,
          },
        ],
      }));

      const metrics = BottleneckAnalyzer.analyze(mockExecutions);
      const node = metrics.find((m) => m.nodeId === 'node_unreliable_api');

      expect(node!.sampleSizeAdequate).toBe(true);
      expect(node!.failureRatePercent).toBe(20.0);
      expect(node!.diagnosticStatus).toBe('UNRELIABLE');
      expect(node!.warnings.highFailureRate).toBe(true);
      expect(node!.warnings.highDuration).toBe(false);
      expect(node!.diagnosticReasons[0]).toContain('Reliability issue');
    });

    it('should diagnose NEEDS_ATTENTION when both duration > 40% and failure > 15% conditions occur', () => {
      // 6 executions: 3 failed, 3 completed = 50% failure (>15%), 600ms duration (>40%)
      const mockExecutions: WorkflowExecutionRecord[] = Array.from({ length: 6 }, (_, i) => ({
        id: `exec_critical_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: i % 2 === 0 ? 'FAILED' : 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [
          {
            nodeId: 'node_critical_heavy',
            nodeType: 'ai.generate',
            nodeName: 'Heavy AI Reasoning',
            status: i % 2 === 0 ? 'FAILED' : 'COMPLETED',
            durationMs: 700, // 70% of total
            attempts: 1,
            retryCount: 0,
            error: i % 2 === 0 ? 'Rate limit exceeded 429' : undefined,
          },
        ],
      }));

      const metrics = BottleneckAnalyzer.analyze(mockExecutions);
      const node = metrics.find((m) => m.nodeId === 'node_critical_heavy');

      expect(node!.sampleSizeAdequate).toBe(true);
      expect(node!.diagnosticStatus).toBe('NEEDS_ATTENTION');
      expect(node!.warnings.highDuration).toBe(true);
      expect(node!.warnings.highFailureRate).toBe(true);
    });

    it('should handle parallel branch execution where duration contribution exceeds 100% without clamping', () => {
      // Parallel branches can naturally exceed 1.0 wall-clock ratio
      const mockExecutions: WorkflowExecutionRecord[] = Array.from({ length: 5 }, (_, i) => ({
        id: `exec_parallel_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [
          {
            nodeId: 'node_parallel_accum',
            nodeType: 'worker',
            nodeName: 'Parallel Batch Worker',
            status: 'COMPLETED',
            durationMs: 1400, // 140% of workflow wall-clock
            attempts: 1,
            retryCount: 0,
          },
        ],
      }));

      const metrics = BottleneckAnalyzer.analyze(mockExecutions);
      const node = metrics.find((m) => m.nodeId === 'node_parallel_accum');

      expect(node!.durationContributionRatio).toBe(1.4);
      expect(node!.diagnosticStatus).toBe('SLOW');
      expect(node!.bottleneckRankingScore).toBeGreaterThan(0);
    });
  });

  describe('3. Evidence-Backed Optimization Recommendations', () => {
    it('should generate advisory recommendation for slow AI operations', () => {
      const mockExecutions: WorkflowExecutionRecord[] = Array.from({ length: 5 }, (_, i) => ({
        id: `exec_ai_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [
          {
            nodeId: 'node_ai_gen',
            nodeType: 'ai.generate',
            nodeName: 'AI Order Insights',
            status: 'COMPLETED',
            durationMs: 650, // 65% of workflow duration
            attempts: 1,
            retryCount: 0,
          },
        ],
      }));

      const nodeMetrics = BottleneckAnalyzer.analyze(mockExecutions);
      const recs = BottleneckAnalyzer.generateRecommendations(mockExecutions, nodeMetrics, testWorkflowId);

      expect(recs.length).toBeGreaterThan(0);
      const aiRec = recs.find((r) => r.ruleId === 'SLOW_AI_INFERENCE');
      expect(aiRec).toBeDefined();
      expect(aiRec!.nodeId).toBe('node_ai_gen');
      expect(aiRec!.suggestedAction).toContain('lightweight inference model');
      expect(aiRec!.supportingMeasurements.nodeMeanDurationMs).toBe(650);
    });

    it('should generate advisory recommendation for excessive retries', () => {
      const mockExecutions: WorkflowExecutionRecord[] = Array.from({ length: 5 }, (_, i) => ({
        id: `exec_retry_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 2,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [
          {
            nodeId: 'node_flaky_retry',
            nodeType: 'http.request',
            nodeName: 'Flaky Inventory Sync',
            status: 'COMPLETED',
            durationMs: 300,
            attempts: 3, // 2 retries
            retryCount: 2,
          },
        ],
      }));

      const nodeMetrics = BottleneckAnalyzer.analyze(mockExecutions);
      const recs = BottleneckAnalyzer.generateRecommendations(mockExecutions, nodeMetrics, testWorkflowId);

      const retryRec = recs.find((r) => r.ruleId === 'EXCESSIVE_RETRIES');
      expect(retryRec).toBeDefined();
      expect(retryRec!.supportingMeasurements.retryCount).toBe(10); // 2 * 5 = 10
      expect(retryRec!.suggestedAction).toContain('idempotency keys');
    });

    it('should NOT generate recommendations when sample size is insufficient (< 5)', () => {
      // 3 runs with failures and retries
      const mockExecutions: WorkflowExecutionRecord[] = Array.from({ length: 3 }, (_, i) => ({
        id: `exec_insufficient_${i}`,
        workflowId: testWorkflowId,
        workflowName: 'Pipeline',
        status: 'FAILED',
        startedAt: new Date().toISOString(),
        durationMs: 1000,
        retryCount: 3,
        maxRetries: 3,
        trigger: { type: 'manual', timestamp: new Date().toISOString() },
        traces: [
          {
            nodeId: 'node_sparse_fail',
            nodeType: 'http.request',
            nodeName: 'Sparse HTTP Node',
            status: 'FAILED',
            durationMs: 800,
            attempts: 3,
            retryCount: 2,
            error: 'Timeout 504',
          },
        ],
      }));

      const nodeMetrics = BottleneckAnalyzer.analyze(mockExecutions, { minExecutionsThreshold: 5 });
      const recs = BottleneckAnalyzer.generateRecommendations(mockExecutions, nodeMetrics, testWorkflowId);

      // Recommendations must be empty because N < 5
      expect(recs.length).toBe(0);
    });
  });

  describe('4. Server-Side REST APIs & Workspace Security Enforcement', () => {
    it('should return node diagnostics and recommendations via GET /api/v1/analytics/workflows/[id]/nodes', async () => {
      // Seed 6 executions for test workflow
      for (let i = 0; i < 6; i++) {
        await executionStore.create({
          id: `exec_diag_seed_${i}`,
          workflowId: testWorkflowId,
          workflowName: 'Order Processing & Fulfillment Pipeline',
          workspaceId: testWorkspaceId,
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 3600000 * (i + 1)).toISOString(),
          durationMs: 1000,
          retryCount: 0,
          maxRetries: 3,
          trigger: { type: 'trigger.webhook', payload: {}, timestamp: new Date().toISOString() },
          traces: [
            {
              nodeId: 'node_http_crm',
              nodeType: 'http.request',
              nodeName: 'Sync CRM API',
              status: i === 0 ? 'FAILED' : 'COMPLETED',
              durationMs: 500, // 50% duration
              attempts: 1,
              retryCount: 0,
              error: i === 0 ? 'ETIMEDOUT gateway timeout' : undefined,
            },
          ],
        });
      }

      const req = new NextRequest(
        `http://localhost:3000/api/v1/analytics/workflows/${testWorkflowId}/nodes?timeWindow=30d`,
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': testWorkspaceId,
          },
        }
      );

      const res = await getWorkflowNodes(req, {
        params: Promise.resolve({ id: testWorkflowId }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.workflowId).toBe(testWorkflowId);
      expect(Array.isArray(json.data.nodeDiagnostics)).toBe(true);
      expect(json.data.nodeDiagnostics.length).toBeGreaterThan(0);

      const crmNode = json.data.nodeDiagnostics.find((n: any) => n.nodeId === 'node_http_crm');
      expect(crmNode).toBeDefined();
      expect(crmNode.sampleSizeAdequate).toBe(true);
      expect(crmNode.diagnosticStatus).toBe('NEEDS_ATTENTION');
      expect(Array.isArray(json.data.recommendations)).toBe(true);
    });

    it('should return paginated and sanitized node execution traces via GET /nodes/[nodeId]/executions', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/analytics/workflows/${testWorkflowId}/nodes/node_http_crm/executions?limit=3&offset=0`,
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': testWorkspaceId,
          },
        }
      );

      const res = await getNodeExecutions(req, {
        params: Promise.resolve({ id: testWorkflowId, nodeId: 'node_http_crm' }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.limit).toBe(3);
      expect(json.data.offset).toBe(0);
      expect(json.data.items.length).toBeLessThanOrEqual(3);

      const trace = json.data.items[0];
      expect(trace.nodeId).toBe('node_http_crm');
      expect(trace.durationMs).toBeDefined();
      // Crucial: Raw payload must not be exposed in node trace summaries
      expect((trace as any).input).toBeUndefined();
      expect((trace as any).output).toBeUndefined();
    });

    it('should enforce cross-tenant isolation and return 404 when querying workflow from another workspace', async () => {
      // Attempt to access testWorkflowId from otherWorkspaceId
      const req = new NextRequest(
        `http://localhost:3000/api/v1/analytics/workflows/${testWorkflowId}/nodes?timeWindow=30d`,
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': otherWorkspaceId,
          },
        }
      );

      const res = await getWorkflowNodes(req, {
        params: Promise.resolve({ id: testWorkflowId }),
      });
      const json = await res.json();

      // Must return 404 to avoid leaking workflow existence
      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found in active workspace');
    });
  });
});
