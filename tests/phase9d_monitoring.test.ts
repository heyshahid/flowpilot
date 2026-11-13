import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { executionStore } from '../src/lib/storage/executionStore';
import { scheduleStore } from '../src/lib/storage/scheduleStore';
import { workerStore } from '../src/lib/storage/workerStore';
import { workspaceStore } from '../src/lib/storage/workspaceStore';
import { userStore } from '../src/lib/storage/userStore';
import { executionMonitor } from '../src/core/monitoring/executionMonitor';
import { schedulerMonitor } from '../src/core/monitoring/schedulerMonitor';
import { workerHeartbeatManager } from '../src/core/monitoring/workerHeartbeat';
import { alertDetector } from '../src/core/monitoring/alertDetector';
import { monitoringService } from '../src/core/monitoring/monitoringService';
import { GET as getOverviewRoute } from '../src/app/api/v1/monitoring/overview/route';
import { GET as getExecutionsRoute } from '../src/app/api/v1/monitoring/executions/route';
import { GET as getSchedulesRoute } from '../src/app/api/v1/monitoring/schedules/route';
import { GET as getWorkersRoute, POST as postWorkerRoute } from '../src/app/api/v1/monitoring/workers/route';
import { GET as getAlertsRoute } from '../src/app/api/v1/monitoring/alerts/route';

describe('Phase 9D: Execution Monitoring & Scheduler Health', () => {
  let testWorkspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    // 1. Create real workspace records
    const testWs = workspaceStore.create({
      name: 'Monitoring Test Workspace',
      ownerId: 'usr_owner',
      slug: 'monitoring-test',
    });
    testWorkspaceId = testWs.id;

    const otherWs = workspaceStore.create({
      name: 'Other Tenant Workspace',
      ownerId: 'usr_owner',
      slug: 'other-tenant',
    });
    otherWorkspaceId = otherWs.id;
  });

  afterAll(async () => {
    // Clean up created schedules
    const scheds = await scheduleStore.list({ workspaceId: testWorkspaceId });
    for (const s of scheds) {
      await scheduleStore.delete(s.id);
    }
  });

  beforeEach(() => {
    alertDetector.clearHistory();
    workerStore.clear();
  });

  // -------------------------------------------------------------
  // 1. Execution Monitor & Status Categorization
  // -------------------------------------------------------------
  it('1. should categorize active vs terminal executions accurately', async () => {
    const now = new Date();

    // Seed diverse status executions in test workspace
    await executionStore.create({
      id: 'exec_mon_running',
      workflowId: 'wf_monitor_1',
      workflowName: 'Customer Ingestion',
      workspaceId: testWorkspaceId,
      status: 'RUNNING',
      trigger: { type: 'trigger.webhook', payload: {}, timestamp: now.toISOString() },
      startedAt: new Date(now.getTime() - 5000).toISOString(),
      durationMs: 5000,
      traces: [],
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    await executionStore.create({
      id: 'exec_mon_queued',
      workflowId: 'wf_monitor_1',
      workflowName: 'Customer Ingestion',
      workspaceId: testWorkspaceId,
      status: 'QUEUED',
      trigger: { type: 'trigger.manual', payload: {}, timestamp: now.toISOString() },
      startedAt: now.toISOString(),
      durationMs: 0,
      traces: [],
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    await executionStore.create({
      id: 'exec_mon_waiting',
      workflowId: 'wf_monitor_2',
      workflowName: 'Delayed Notification',
      workspaceId: testWorkspaceId,
      status: 'WAITING',
      trigger: { type: 'trigger.schedule', payload: {}, timestamp: now.toISOString() },
      startedAt: new Date(now.getTime() - 10000).toISOString(),
      durationMs: 10000,
      traces: [],
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    await executionStore.create({
      id: 'exec_mon_completed',
      workflowId: 'wf_monitor_1',
      workflowName: 'Customer Ingestion',
      workspaceId: testWorkspaceId,
      status: 'COMPLETED',
      trigger: { type: 'trigger.webhook', payload: {}, timestamp: now.toISOString() },
      startedAt: new Date(now.getTime() - 60000).toISOString(),
      completedAt: new Date(now.getTime() - 59800).toISOString(),
      durationMs: 200,
      traces: [],
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    await executionStore.create({
      id: 'exec_mon_failed',
      workflowId: 'wf_monitor_1',
      workflowName: 'Customer Ingestion',
      workspaceId: testWorkspaceId,
      status: 'FAILED',
      error: 'HTTP 500 Server Error on CRM sync',
      trigger: { type: 'trigger.webhook', payload: {}, timestamp: now.toISOString() },
      startedAt: new Date(now.getTime() - 120000).toISOString(),
      completedAt: new Date(now.getTime() - 119500).toISOString(),
      durationMs: 500,
      traces: [],
      stateHistory: [],
      retryCount: 1,
      maxRetries: 3,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const result = await executionMonitor.getExecutions({ workspaceId: testWorkspaceId });

    expect(result.summary.runningCount).toBe(1);
    expect(result.summary.queuedCount).toBe(1);
    expect(result.summary.waitingCount).toBe(1);
    expect(result.summary.activeCount).toBe(3); // 1 running + 1 queued + 1 waiting
    expect(result.summary.completedCount).toBe(1);
    expect(result.summary.failedCount).toBe(1);
    expect(result.summary.successRatePercent).toBe(50); // 1 / (1 + 1) * 100
  });

  // -------------------------------------------------------------
  // 2. Server-Side Filtering & Pagination
  // -------------------------------------------------------------
  it('2. should filter executions by status, triggerType, duration and apply pagination', async () => {
    // Query active only
    const activeOnly = await executionMonitor.getExecutions({
      workspaceId: testWorkspaceId,
      status: 'ACTIVE',
    });
    expect(activeOnly.items.length).toBe(3);
    expect(activeOnly.items.every((i) => ['RUNNING', 'QUEUED', 'WAITING'].includes(i.status))).toBe(true);

    // Query terminal only
    const terminalOnly = await executionMonitor.getExecutions({
      workspaceId: testWorkspaceId,
      status: 'TERMINAL',
    });
    expect(terminalOnly.items.length).toBe(2);
    expect(terminalOnly.items.every((i) => ['COMPLETED', 'FAILED'].includes(i.status))).toBe(true);

    // Query triggerType
    const webhookOnly = await executionMonitor.getExecutions({
      workspaceId: testWorkspaceId,
      triggerType: 'trigger.webhook',
    });
    expect(webhookOnly.items.every((i) => i.triggerType === 'trigger.webhook')).toBe(true);

    // Pagination test
    const page1 = await executionMonitor.getExecutions({
      workspaceId: testWorkspaceId,
      offset: 0,
      limit: 2,
    });
    expect(page1.items.length).toBe(2);

    const page2 = await executionMonitor.getExecutions({
      workspaceId: testWorkspaceId,
      offset: 2,
      limit: 2,
    });
    expect(page2.items.length).toBe(2);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });

  // -------------------------------------------------------------
  // 3. Timeout and Stuck Execution Detection
  // -------------------------------------------------------------
  it('3. should detect timeouts and identify stuck executions', async () => {
    const now = new Date();

    // Seed timed-out execution
    await executionStore.create({
      id: 'exec_mon_timeout',
      workflowId: 'wf_monitor_1',
      workflowName: 'Customer Ingestion',
      workspaceId: testWorkspaceId,
      status: 'FAILED',
      error: 'Upstream gateway timed out with ETIMEDOUT after 30000ms',
      trigger: { type: 'trigger.webhook', payload: {}, timestamp: now.toISOString() },
      startedAt: new Date(now.getTime() - 40000).toISOString(),
      durationMs: 30000,
      traces: [
        {
          nodeId: 'node_http',
          nodeType: 'integration.http',
          nodeName: 'HTTP CRM API',
          status: 'FAILED',
          durationMs: 30000,
          attempts: 1,
          retryCount: 0,
          error: 'Connection timeout: 504 Gateway Timeout',
          input: {},
          output: {},
        },
      ],
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    // Seed stuck execution (RUNNING for 20 minutes)
    await executionStore.create({
      id: 'exec_mon_stuck',
      workflowId: 'wf_monitor_3',
      workflowName: 'Long Batch Processing',
      workspaceId: testWorkspaceId,
      status: 'RUNNING',
      trigger: { type: 'trigger.manual', payload: {}, timestamp: now.toISOString() },
      startedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(), // 20m ago
      durationMs: 20 * 60 * 1000,
      traces: [],
      stateHistory: [],
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
    });

    const result = await executionMonitor.getExecutions({ workspaceId: testWorkspaceId });
    expect(result.summary.timeoutCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.stuckCount).toBeGreaterThanOrEqual(1);

    const timeoutItem = result.items.find((i) => i.id === 'exec_mon_timeout');
    expect(timeoutItem?.isTimedOut).toBe(true);

    const stuckItem = result.items.find((i) => i.id === 'exec_mon_stuck');
    expect(stuckItem?.isStuck).toBe(true);
  });

  // -------------------------------------------------------------
  // 4. Sensitive Data and Error Redaction
  // -------------------------------------------------------------
  it('4. should redact bearer tokens, API secrets and payload bodies from monitoring feeds', async () => {
    const rawError = 'Authorization failure: Bearer eyJhbGciOiJIUzI1NiJ9.test and secret fpsec_98124901824901248091248901284901 exposed';
    const sanitized = executionMonitor.sanitizeError(rawError);

    expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(sanitized).not.toContain('fpsec_98124901824901248091248901284901');
    expect(sanitized).toContain('Bearer [REDACTED]');
    expect(sanitized).toContain('[REDACTED_SECRET]');

    // Confirm that toMonitoredItem does not return input/output payload objects
    const record = await executionStore.getById('exec_mon_timeout');
    const monitored = executionMonitor.toMonitoredItem(record!);
    expect((monitored as any).input).toBeUndefined();
    expect((monitored as any).output).toBeUndefined();
    expect((monitored as any).traces).toBeUndefined(); // Only high-level counts provided
  });

  // -------------------------------------------------------------
  // 5. Scheduler Health & Upcoming Queue
  // -------------------------------------------------------------
  it('5. should report scheduler health and build upcoming queue with live countdowns', async () => {
    const now = new Date();

    // Seed future schedule
    await scheduleStore.save({
      workflowId: 'wf_monitor_1',
      workflowName: 'Customer Ingestion',
      workspaceId: testWorkspaceId,
      name: 'Future Ingestion Run',
      type: 'cron',
      cronExpression: '0 0 * * *',
      status: 'active',
      nextRunAt: new Date(now.getTime() + 120000).toISOString(), // 2 minutes in future
      lastRunAt: new Date(now.getTime() - 86400000).toISOString(),
      catchUpMissed: true,
    });

    const health = await schedulerMonitor.getSchedulerHealth(testWorkspaceId, now);

    expect(health.summary.activeCount).toBeGreaterThanOrEqual(1);
    expect(health.summary.upcomingRunsCount).toBeGreaterThanOrEqual(1);
    expect(health.summary.upcomingQueue.length).toBeGreaterThanOrEqual(1);

    const upcoming = health.summary.upcomingQueue.find((u) => u.scheduleName === 'Future Ingestion Run');
    expect(upcoming).toBeDefined();
    expect(upcoming!.countdownSeconds).toBeGreaterThan(0);
    expect(upcoming!.countdownSeconds).toBeLessThanOrEqual(120);
  });

  // -------------------------------------------------------------
  // 6. Missed Schedule Detection & Catch-Up Policy
  // -------------------------------------------------------------
  it('6. should detect missed schedules when overdue beyond grace period without execution', async () => {
    const now = new Date();

    // Schedule was due 10 minutes ago, but lastRunAt was yesterday
    const missedSchedule = await scheduleStore.save({
      workflowId: 'wf_monitor_1',
      workflowName: 'Customer Ingestion',
      workspaceId: testWorkspaceId,
      name: 'Overdue Daily Sync',
      type: 'cron',
      cronExpression: '0 9 * * *',
      status: 'active',
      nextRunAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
      lastRunAt: new Date(now.getTime() - 86400000).toISOString(),
      catchUpMissed: true,
    });

    const isMissed = schedulerMonitor.isScheduleMissed(missedSchedule, now);
    expect(isMissed).toBe(true);

    const health = await schedulerMonitor.getSchedulerHealth(testWorkspaceId, now);
    expect(health.summary.missedSchedulesCount).toBeGreaterThanOrEqual(1);

    const found = health.schedules.find((s) => s.id === missedSchedule.id);
    expect(found?.isMissed).toBe(true);
    expect(found?.catchUpMissed).toBe(true);
    expect(found?.missedLapseMs).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // 7. Worker Heartbeat & Status States (HEALTHY, STALE, OFFLINE)
  // -------------------------------------------------------------
  it('7. should evaluate worker health states: HEALTHY (<=30s), STALE (30-90s), OFFLINE (>90s)', () => {
    const now = new Date();

    // Record fresh heartbeat
    const fresh = workerHeartbeatManager.recordHeartbeat('worker_test_primary');
    const evaluatedFresh = workerHeartbeatManager.evaluateWorkerHealth(fresh, now);
    expect(evaluatedFresh.status).toBe('HEALTHY');
    expect(evaluatedFresh.isStale).toBe(false);

    // Stale heartbeat (45 seconds old)
    const staleBeat = workerHeartbeatManager.evaluateWorkerHealth(
      {
        ...fresh,
        lastHeartbeatAt: new Date(now.getTime() - 45000).toISOString(),
      },
      now
    );
    expect(staleBeat.status).toBe('STALE');
    expect(staleBeat.isStale).toBe(true);

    // Offline heartbeat (120 seconds old)
    const offlineBeat = workerHeartbeatManager.evaluateWorkerHealth(
      {
        ...fresh,
        lastHeartbeatAt: new Date(now.getTime() - 120000).toISOString(),
      },
      now
    );
    expect(offlineBeat.status).toBe('OFFLINE');
    expect(offlineBeat.isStale).toBe(true);
  });

  // -------------------------------------------------------------
  // 8. Queue Observability Metrics
  // -------------------------------------------------------------
  it('8. should report queue depth, active concurrency, max concurrency and mode', () => {
    const observability = workerHeartbeatManager.getWorkerObservability();

    expect(observability.queueMetrics).toBeDefined();
    expect(observability.queueMetrics.mode).toBe('in_process_fifo');
    expect(observability.queueMetrics.isQueueAvailable).toBe(true);
    expect(observability.queueMetrics.maxConcurrency).toBe(5);
    expect(typeof observability.queueMetrics.queueDepth).toBe('number');
    expect(typeof observability.queueMetrics.activeConcurrency).toBe('number');
  });

  // -------------------------------------------------------------
  // 9. Operational Incident Detection & Deduplication
  // -------------------------------------------------------------
  it('9. should detect incidents and deduplicate continuing events without creating duplicate alerts', async () => {
    const now = new Date();

    // Create 3 consecutive failed executions for wf_failing_workflow
    for (let i = 0; i < 3; i++) {
      await executionStore.create({
        id: `exec_streak_fail_${i}`,
        workflowId: 'wf_failing_workflow',
        workflowName: 'Failing Payment Webhook',
        workspaceId: testWorkspaceId,
        status: 'FAILED',
        error: 'Payment Gateway Connection Refused',
        trigger: { type: 'trigger.webhook', payload: {}, timestamp: new Date(now.getTime() - i * 1000).toISOString() },
        startedAt: new Date(now.getTime() - i * 1000).toISOString(),
        durationMs: 100,
        traces: [],
        stateHistory: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }

    // First detection tick
    const alertsTick1 = await alertDetector.detectIncidents(testWorkspaceId, now);
    const failureAlertTick1 = alertsTick1.find((a) => a.type === 'REPEATED_WORKFLOW_FAILURES');
    expect(failureAlertTick1).toBeDefined();
    expect(failureAlertTick1?.severity).toBe('CRITICAL');
    expect(failureAlertTick1?.occurrenceCount).toBe(1);

    // Second detection tick (same incident continues)
    const alertsTick2 = await alertDetector.detectIncidents(testWorkspaceId, new Date(now.getTime() + 10000));
    const matchingAlerts = alertsTick2.filter((a) => a.dedupKey === 'wf_fail_wf_failing_workflow');

    // DEDUPLICATION ASSERTION: Exactly 1 alert exists for this dedupKey, but occurrenceCount incremented to 2
    expect(matchingAlerts.length).toBe(1);
    expect(matchingAlerts[0].occurrenceCount).toBe(2);
    expect(matchingAlerts[0].firstSeenAt).toBe(failureAlertTick1?.firstSeenAt);
  });

  // -------------------------------------------------------------
  // 10. Monitoring Overview REST API
  // -------------------------------------------------------------
  it('10. should serve GET /api/v1/monitoring/overview with unified statistics', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/overview?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const res = await getOverviewRoute(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.workspaceId).toBe(testWorkspaceId);
    expect(json.data.executionSummary).toBeDefined();
    expect(json.data.schedulerHealth).toBeDefined();
    expect(json.data.workerHealth).toBeDefined();
    expect(json.data.alertsSummary).toBeDefined();
  });

  // -------------------------------------------------------------
  // 11. Monitoring Executions REST API
  // -------------------------------------------------------------
  it('11. should serve GET /api/v1/monitoring/executions with status filters and pagination', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/executions?workspaceId=${testWorkspaceId}&status=ALL&limit=5`,
      {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const res = await getExecutionsRoute(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.items)).toBe(true);
    expect(json.data.limit).toBe(5);
    expect(json.data.total).toBeGreaterThanOrEqual(1);
    expect(json.data.summary).toBeDefined();
  });

  // -------------------------------------------------------------
  // 12. Monitoring Schedules REST API
  // -------------------------------------------------------------
  it('12. should serve GET /api/v1/monitoring/schedules with schedule items and upcoming queue', async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/schedules?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const res = await getSchedulesRoute(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.schedules)).toBe(true);
    expect(json.data.summary).toBeDefined();
    expect(Array.isArray(json.data.summary.upcomingQueue)).toBe(true);
  });

  // -------------------------------------------------------------
  // 13. Monitoring Workers REST API (GET & POST heartbeat)
  // -------------------------------------------------------------
  it('13. should serve GET /api/v1/monitoring/workers and accept worker heartbeats via POST', async () => {
    // GET workers
    const getReq = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/workers?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const getRes = await getWorkersRoute(getReq);
    const getJson = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getJson.success).toBe(true);
    expect(getJson.data.workers.length).toBeGreaterThanOrEqual(1);
    expect(getJson.data.queueMetrics).toBeDefined();

    // POST worker heartbeat
    const postReq = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/workers?workspaceId=${testWorkspaceId}`,
      {
        method: 'POST',
        body: JSON.stringify({ activeJobsCount: 2 }),
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const postRes = await postWorkerRoute(postReq);
    const postJson = await postRes.json();

    expect(postRes.status).toBe(200);
    expect(postJson.success).toBe(true);
    expect(postJson.data.activeJobsCount).toBe(2);
  });

  // -------------------------------------------------------------
  // 14. Monitoring Alerts REST API & Cross-Workspace Isolation
  // -------------------------------------------------------------
  it('14. should serve GET /api/v1/monitoring/alerts and enforce cross-workspace isolation with 404', async () => {
    // Valid workspace query
    const validReq = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/alerts?workspaceId=${testWorkspaceId}`,
      {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const validRes = await getAlertsRoute(validReq);
    const validJson = await validRes.json();

    expect(validRes.status).toBe(200);
    expect(validJson.success).toBe(true);
    expect(Array.isArray(validJson.data.items)).toBe(true);

    // Cross-workspace query attempt using mismatch workspace ID
    const crossReq = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/overview?workspaceId=ws_unauthorized_external`,
      {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const crossRes = await getOverviewRoute(crossReq);
    expect(crossRes.status).toBe(404);

    const crossExecReq = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/executions?workspaceId=ws_unauthorized_external`,
      {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const crossExecRes = await getExecutionsRoute(crossExecReq);
    expect(crossExecRes.status).toBe(404);

    const crossSchedReq = new NextRequest(
      `http://localhost:3000/api/v1/monitoring/schedules?workspaceId=ws_unauthorized_external`,
      {
        headers: {
          'x-user-id': 'usr_owner',
          'x-workspace-id': testWorkspaceId,
        },
      }
    );
    const crossSchedRes = await getSchedulesRoute(crossSchedReq);
    expect(crossSchedRes.status).toBe(404);
  });
});
