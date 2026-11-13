import { executionStore } from '../../lib/storage/executionStore';
import { scheduleStore } from '../../lib/storage/scheduleStore';
import { executionMonitor } from './executionMonitor';
import { schedulerMonitor } from './schedulerMonitor';
import { workerHeartbeatManager } from './workerHeartbeat';
import { OperationalIncident } from './types';

export class AlertDetector {
  private static instance: AlertDetector;
  // In-memory registry for tracking continuing incident history across ticks
  private incidentHistory: Map<string, OperationalIncident> = new Map();

  public static getInstance(): AlertDetector {
    if (!AlertDetector.instance) {
      AlertDetector.instance = new AlertDetector();
    }
    return AlertDetector.instance;
  }

  public async detectIncidents(
    workspaceId: string = 'ws_default',
    asOfDate: Date = new Date()
  ): Promise<OperationalIncident[]> {
    const activeIncidents: Map<string, OperationalIncident> = new Map();
    const nowIso = asOfDate.toISOString();

    // 1. Query workspace executions
    const execRes = await executionStore.list({ workspaceId, limit: 1000 });
    const executions = execRes.items;

    // Group executions by workflowId
    const executionsByWorkflow = new Map<string, typeof executions>();
    for (const exec of executions) {
      const list = executionsByWorkflow.get(exec.workflowId) || [];
      list.push(exec);
      executionsByWorkflow.set(exec.workflowId, list);
    }

    // A. Detect Repeated Workflow Failures (3+ consecutive terminal failures)
    for (const [wfId, wfExecs] of executionsByWorkflow.entries()) {
      // Sort by startedAt descending
      wfExecs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

      let consecutiveFailures = 0;
      const failedExecIds: string[] = [];
      const wfName = wfExecs[0]?.workflowName || wfId;

      for (const exec of wfExecs) {
        if (exec.status === 'FAILED') {
          consecutiveFailures++;
          failedExecIds.push(exec.id);
        } else if (exec.status === 'COMPLETED') {
          // Failure streak broken
          break;
        }
      }

      if (consecutiveFailures >= 3) {
        const dedupKey = `wf_fail_${wfId}`;
        const existing = this.incidentHistory.get(dedupKey);

        const incident: OperationalIncident = {
          id: existing?.id || `alert_${dedupKey}_${Date.now()}`,
          dedupKey,
          type: 'REPEATED_WORKFLOW_FAILURES',
          severity: 'CRITICAL',
          title: `Repeated Workflow Failures: ${wfName}`,
          message: `Workflow has failed ${consecutiveFailures} consecutive times in recent executions.`,
          targetType: 'workflow',
          targetId: wfId,
          targetName: wfName,
          firstSeenAt: existing?.firstSeenAt || nowIso,
          lastSeenAt: nowIso,
          occurrenceCount: (existing?.occurrenceCount || 0) + 1,
          resolved: false,
          affectedExecutionIds: failedExecIds.slice(0, 5),
          metrics: {
            consecutiveFailures,
            totalWorkflowRunsSampled: wfExecs.length,
          },
        };

        this.incidentHistory.set(dedupKey, incident);
        activeIncidents.set(dedupKey, incident);
      }
    }

    // B. Detect Execution Timeouts
    const timedOutExecutions = executions.filter((e) => executionMonitor.isExecutionTimedOut(e));
    if (timedOutExecutions.length > 0) {
      // Group timeouts by workflow
      const timeoutsByWf = new Map<string, string[]>();
      for (const exec of timedOutExecutions) {
        const list = timeoutsByWf.get(exec.workflowId) || [];
        list.push(exec.id);
        timeoutsByWf.set(exec.workflowId, list);
      }

      for (const [wfId, execIds] of timeoutsByWf.entries()) {
        const dedupKey = `exec_timeout_${wfId}`;
        const existing = this.incidentHistory.get(dedupKey);
        const wfName = executions.find((e) => e.workflowId === wfId)?.workflowName || wfId;

        const incident: OperationalIncident = {
          id: existing?.id || `alert_${dedupKey}_${Date.now()}`,
          dedupKey,
          type: 'EXECUTION_TIMEOUT',
          severity: 'WARNING',
          title: `Execution Timeout Observed: ${wfName}`,
          message: `${execIds.length} execution(s) timed out due to network latency, gateway timeouts, or execution limits.`,
          targetType: 'workflow',
          targetId: wfId,
          targetName: wfName,
          firstSeenAt: existing?.firstSeenAt || nowIso,
          lastSeenAt: nowIso,
          occurrenceCount: (existing?.occurrenceCount || 0) + 1,
          resolved: false,
          affectedExecutionIds: execIds.slice(0, 5),
          metrics: {
            timeoutCount: execIds.length,
          },
        };

        this.incidentHistory.set(dedupKey, incident);
        activeIncidents.set(dedupKey, incident);
      }
    }

    // C. Detect Stuck Executions
    const stuckExecutions = executions.filter((e) => executionMonitor.isExecutionStuck(e, asOfDate));
    for (const stuck of stuckExecutions) {
      const dedupKey = `exec_stuck_${stuck.id}`;
      const existing = this.incidentHistory.get(dedupKey);

      const incident: OperationalIncident = {
        id: existing?.id || `alert_${dedupKey}_${Date.now()}`,
        dedupKey,
        type: 'STUCK_EXECUTION',
        severity: 'CRITICAL',
        title: `Stuck Execution: ${stuck.workflowName}`,
        message: `Execution "${stuck.id}" has remained in status ${stuck.status} for > 15 minutes without progress.`,
        targetType: 'execution',
        targetId: stuck.id,
        targetName: stuck.workflowName,
        firstSeenAt: existing?.firstSeenAt || nowIso,
        lastSeenAt: nowIso,
        occurrenceCount: (existing?.occurrenceCount || 0) + 1,
        resolved: false,
        affectedExecutionIds: [stuck.id],
        metrics: {
          status: stuck.status,
          startedAt: stuck.startedAt,
        },
      };

      this.incidentHistory.set(dedupKey, incident);
      activeIncidents.set(dedupKey, incident);
    }

    // D. Detect Missed Schedules
    const rawSchedules = await scheduleStore.list({ workspaceId });
    for (const schedule of rawSchedules) {
      if (schedulerMonitor.isScheduleMissed(schedule, asOfDate)) {
        const dedupKey = `sched_missed_${schedule.id}`;
        const existing = this.incidentHistory.get(dedupKey);
        const nextRunTime = schedule.nextRunAt ? new Date(schedule.nextRunAt).getTime() : 0;
        const lapseMinutes = Math.max(1, Math.round((asOfDate.getTime() - nextRunTime) / 60000));

        const incident: OperationalIncident = {
          id: existing?.id || `alert_${dedupKey}_${Date.now()}`,
          dedupKey,
          type: 'MISSED_SCHEDULE',
          severity: 'WARNING',
          title: `Missed Schedule Run: ${schedule.name}`,
          message: `Schedule was due at ${schedule.nextRunAt} (${lapseMinutes}m ago) but did not trigger. Catch-up policy: ${schedule.catchUpMissed ? 'Catch up on tick' : 'Skip'}.`,
          targetType: 'schedule',
          targetId: schedule.id,
          targetName: schedule.name,
          firstSeenAt: existing?.firstSeenAt || nowIso,
          lastSeenAt: nowIso,
          occurrenceCount: (existing?.occurrenceCount || 0) + 1,
          resolved: false,
          metrics: {
            lapseMinutes,
            catchUpMissed: !!schedule.catchUpMissed,
          },
        };

        this.incidentHistory.set(dedupKey, incident);
        activeIncidents.set(dedupKey, incident);
      }
    }

    // E. Detect Worker Health (Stale / Offline)
    const { primaryWorker } = workerHeartbeatManager.getWorkerObservability(asOfDate);
    if (primaryWorker && (primaryWorker.status === 'STALE' || primaryWorker.status === 'OFFLINE')) {
      const dedupKey = `worker_unhealthy_${primaryWorker.id}`;
      const existing = this.incidentHistory.get(dedupKey);

      const incident: OperationalIncident = {
        id: existing?.id || `alert_${dedupKey}_${Date.now()}`,
        dedupKey,
        type: 'WORKER_STALE_OR_OFFLINE',
        severity: primaryWorker.status === 'OFFLINE' ? 'CRITICAL' : 'WARNING',
        title: `Worker Heartbeat ${primaryWorker.status}: ${primaryWorker.name}`,
        message: `Last heartbeat was received at ${primaryWorker.lastHeartbeatAt}. Worker process may be unresponsive or terminated.`,
        targetType: 'worker',
        targetId: primaryWorker.id,
        targetName: primaryWorker.name,
        firstSeenAt: existing?.firstSeenAt || nowIso,
        lastSeenAt: nowIso,
        occurrenceCount: (existing?.occurrenceCount || 0) + 1,
        resolved: false,
        metrics: {
          workerStatus: primaryWorker.status,
          lastHeartbeatAt: primaryWorker.lastHeartbeatAt,
        },
      };

      this.incidentHistory.set(dedupKey, incident);
      activeIncidents.set(dedupKey, incident);
    }

    // Return list of deduplicated active incidents
    return Array.from(activeIncidents.values()).sort((a, b) => {
      // Sort critical first, then most recent
      if (a.severity === 'CRITICAL' && b.severity !== 'CRITICAL') return -1;
      if (b.severity === 'CRITICAL' && a.severity !== 'CRITICAL') return 1;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });
  }

  public clearHistory(): void {
    this.incidentHistory.clear();
  }
}

export const alertDetector = AlertDetector.getInstance();

