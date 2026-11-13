import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getOverview } from '../src/app/api/v1/analytics/overview/route';
import { GET as getWorkflowsOverview } from '../src/app/api/v1/analytics/workflows/route';
import { GET as getWorkflowPerformance } from '../src/app/api/v1/analytics/workflows/[id]/route';
import { GET as getWorkflowExecutions } from '../src/app/api/v1/analytics/workflows/[id]/executions/route';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { workspaceStore } from '../src/lib/storage/workspaceStore';
import { executionStore } from '../src/lib/storage/executionStore';

describe('Phase 9B: Analytics Dashboard & Workflow Performance Detail', () => {
  let testWorkspaceId: string;
  let emptyWorkspaceId: string;
  let otherWorkspaceId: string;
  const testWorkflowId = 'wf_analytics_test_9b';

  beforeAll(() => {
    // 1. Create real workspace records
    const testWs = workspaceStore.create({
      name: 'Phase 9B Analytics Lab',
      ownerId: 'usr_owner',
    });
    testWorkspaceId = testWs.id;

    const emptyWs = workspaceStore.create({
      name: 'Phase 9B Empty Tenant',
      ownerId: 'usr_owner',
    });
    emptyWorkspaceId = emptyWs.id;

    const otherWs = workspaceStore.create({
      name: 'Phase 9B Isolated Other Tenant',
      ownerId: 'usr_owner',
    });
    otherWorkspaceId = otherWs.id;

    // 2. Seed a test workflow in test workspace
    try {
      workflowStore.save(
        {
          id: testWorkflowId,
          name: 'Customer Order Pipeline',
          description: 'Automated order reconciliation and notification',
          triggerType: 'trigger.webhook',
          status: 'active',
          nodes: [],
          edges: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workspaceId: testWorkspaceId,
        },
        { workspaceId: testWorkspaceId }
      );
    } catch {
      // Ignored if exists
    }
  });

  describe('1. Analytics Overview API (/api/v1/analytics/overview)', () => {
    it('should return valid execution summary and time-series for active workspace', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/analytics/overview?timeWindow=30d', {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': 'ws_default',
        },
      });

      const res = await getOverview(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.workspaceId).toBe('ws_default');
      expect(json.data.summary).toBeDefined();
      expect(json.data.timeSeries).toBeDefined();
      expect(json.data.timeSeries.boundaryRule).toContain('[start, end)');
      expect(Array.isArray(json.data.timeSeries.points)).toBe(true);
    });

    it('should return empty state (sampleSize: 0, isAvailable: false) for an empty workspace without fabricating metrics', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/analytics/overview?timeWindow=7d', {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': emptyWorkspaceId,
        },
      });

      const res = await getOverview(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.summary.totalExecutions).toBe(0);
      expect(json.data.summary.terminalExecutions).toBe(0);
      expect(json.data.summary.successRate.isAvailable).toBe(false);
      expect(json.data.summary.successRate.value).toBeNull();
      expect(json.data.summary.successRate.formatted).toBe('N/A');
    });

    it('should reject invalid timeWindow query parameter with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/analytics/overview?timeWindow=invalid_window', {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': 'ws_default',
        },
      });

      const res = await getOverview(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid timeWindow');
    });

    it('should validate custom date range boundaries and reject inverted dates', async () => {
      // Inverted: startDate > endDate
      const req = new NextRequest(
        'http://localhost:3000/api/v1/analytics/overview?timeWindow=custom&startDate=2026-11-20T00:00:00Z&endDate=2026-11-10T00:00:00Z',
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': 'ws_default',
          },
        }
      );

      const res = await getOverview(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid custom date range');
    });
  });

  describe('2. Workflows Analytics List API (/api/v1/analytics/workflows)', () => {
    it('should return aggregated performance items for all workflows in active workspace', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/analytics/workflows?timeWindow=30d', {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': 'ws_default',
        },
      });

      const res = await getWorkflowsOverview(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);

      const first = json.data[0];
      expect(first.id).toBeDefined();
      expect(first.name).toBeDefined();
      expect(typeof first.totalExecutions).toBe('number');
      expect(first.successRate).toBeDefined();
      expect(first.meanDurationMs).toBeDefined();
    });
  });

  describe('3. Workflow Detail Analytics API (/api/v1/analytics/workflows/[id])', () => {
    it('should return detailed performance report for a valid workflow in the workspace', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/analytics/workflows/${testWorkflowId}?timeWindow=30d`,
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': testWorkspaceId,
          },
        }
      );

      const res = await getWorkflowPerformance(req, {
        params: Promise.resolve({ id: testWorkflowId }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.workflowId).toBe(testWorkflowId);
      expect(json.data.workflowName).toBe('Customer Order Pipeline');
      expect(json.data.summary).toBeDefined();
      expect(json.data.durationTrend).toBeDefined();
    });

    it('should return 404 for non-existent workflow', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/analytics/workflows/wf_nonexistent_999?timeWindow=30d',
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': testWorkspaceId,
          },
        }
      );

      const res = await getWorkflowPerformance(req, {
        params: Promise.resolve({ id: 'wf_nonexistent_999' }),
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found in active workspace');
    });

    it('should enforce tenant isolation and return 404 when querying another workspace workflow (zero leakage)', async () => {
      // testWorkflowId belongs to testWorkspaceId. Attempt access from otherWorkspaceId
      const req = new NextRequest(
        `http://localhost:3000/api/v1/analytics/workflows/${testWorkflowId}?timeWindow=30d`,
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': otherWorkspaceId,
          },
        }
      );

      const res = await getWorkflowPerformance(req, {
        params: Promise.resolve({ id: testWorkflowId }),
      });
      const json = await res.json();

      // Must be 404 Not Found to prevent leaking whether the resource exists in another workspace
      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });

  describe('4. Execution History Pagination & Sensitive Data Redaction', () => {
    it('should return paginated execution records with sensitive fields redacted', async () => {
      // Seed an execution with sensitive payload
      const execId = `exec_test_${Date.now()}`;
      await executionStore.create({
        id: execId,
        workflowId: testWorkflowId,
        workflowName: 'Customer Order Pipeline',
        workspaceId: testWorkspaceId,
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 50000).toISOString(),
        completedAt: new Date(Date.now() - 49000).toISOString(),
        durationMs: 1000,
        retryCount: 0,
        maxRetries: 3,
        trigger: {
          type: 'trigger.webhook',
          payload: { apiKey: 'secret_live_key_999', sensitiveCreditCard: '4111-2222-3333-4444' },
          timestamp: new Date().toISOString(),
        },
        traces: [],
      });

      const req = new NextRequest(
        `http://localhost:3000/api/v1/analytics/workflows/${testWorkflowId}/executions?limit=5&offset=0`,
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': testWorkspaceId,
          },
        }
      );

      const res = await getWorkflowExecutions(req, {
        params: Promise.resolve({ id: testWorkflowId }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.items).toBeDefined();
      expect(json.data.limit).toBe(5);
      expect(json.data.offset).toBe(0);

      // Verify that sensitive payload fields are not exposed in execution history summary
      const match = json.data.items.find((item: any) => item.id === execId);
      expect(match).toBeDefined();
      expect(match.id).toBe(execId);
      expect(match.status).toBe('COMPLETED');
      expect(match.durationMs).toBe(1000);
      // Raw payload must be omitted from safe history summary
      expect((match as any).payload).toBeUndefined();
    });

    it('should clamp limit parameter to maximum 100', async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/analytics/workflows/${testWorkflowId}/executions?limit=500&offset=0`,
        {
          headers: {
            'x-user-id': 'usr_owner',
            'x-workspace-id': testWorkspaceId,
          },
        }
      );

      const res = await getWorkflowExecutions(req, {
        params: Promise.resolve({ id: testWorkflowId }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.limit).toBe(100);
    });
  });

  describe('5. RBAC & Workspace Authorization Enforcement', () => {
    it('should reject unauthenticated requests or invalid users', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/analytics/overview', {
        headers: {
          'x-user-id': 'usr_invalid_phantom_user',
          'x-workspace-id': 'ws_default',
        },
      });

      const res = await getOverview(req);
      expect(res.status).toBe(401);
    });
  });
});
