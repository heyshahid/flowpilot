import { alertDetector } from './alertDetector';
import { executionMonitor } from './executionMonitor';
import { schedulerMonitor } from './schedulerMonitor';
import { workerHeartbeatManager } from './workerHeartbeat';
import {
  ExecutionMonitoringFilter,
  ExecutionMonitoringSummary,
  MonitoredExecutionItem,
  MonitoredScheduleItem,
  MonitoringOverviewData,
  OperationalIncident,
  QueueObservabilityMetric,
  SchedulerHealthSummary,
  WorkerInstanceRecord,
} from './types';

export class MonitoringService {
  private static instance: MonitoringService;

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Retrieves unified monitoring overview across executions, schedules, workers, and active alerts.
   */
  public async getMonitoringOverview(
    workspaceId: string = 'ws_default',
    asOfDate: Date = new Date()
  ): Promise<MonitoringOverviewData> {
    // 1. Record automatic heartbeat on overview query
    workerHeartbeatManager.recordHeartbeat();

    // 2. Query execution summary
    const { summary: executionSummary } = await executionMonitor.getExecutions({
      workspaceId,
      limit: 1, // Only need summary calculation
    });

    // 3. Query scheduler health
    const { summary: schedulerHealth } = await schedulerMonitor.getSchedulerHealth(
      workspaceId,
      asOfDate
    );

    // 4. Query worker & queue observability
    const workerHealth = workerHeartbeatManager.getWorkerObservability(asOfDate);

    // 5. Detect active operational incidents
    const incidents = await alertDetector.detectIncidents(workspaceId, asOfDate);

    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    for (const inc of incidents) {
      if (inc.severity === 'CRITICAL') criticalCount++;
      else if (inc.severity === 'WARNING') warningCount++;
      else infoCount++;
    }

    return {
      workspaceId,
      timestamp: asOfDate.toISOString(),
      executionSummary,
      schedulerHealth,
      workerHealth,
      alertsSummary: {
        criticalCount,
        warningCount,
        infoCount,
        activeIncidents: incidents,
      },
    };
  }

  /**
   * Retrieves paginated, filtered executions with payload sanitization.
   */
  public async getExecutions(filter: ExecutionMonitoringFilter = {}): Promise<{
    items: MonitoredExecutionItem[];
    total: number;
    summary: ExecutionMonitoringSummary;
  }> {
    return executionMonitor.getExecutions(filter);
  }

  /**
   * Retrieves schedules, upcoming queue, and missed schedule detection.
   */
  public async getSchedulerHealth(
    workspaceId: string = 'ws_default',
    asOfDate: Date = new Date()
  ): Promise<{
    schedules: MonitoredScheduleItem[];
    summary: SchedulerHealthSummary;
  }> {
    return schedulerMonitor.getSchedulerHealth(workspaceId, asOfDate);
  }

  /**
   * Retrieves worker heartbeat and queue metrics.
   */
  public getWorkerObservability(asOfDate: Date = new Date()): {
    workers: WorkerInstanceRecord[];
    primaryWorker: WorkerInstanceRecord | null;
    queueMetrics: QueueObservabilityMetric;
  } {
    return workerHeartbeatManager.getWorkerObservability(asOfDate);
  }

  /**
   * Records or updates a worker heartbeat.
   */
  public recordWorkerHeartbeat(
    workerId?: string,
    overrides?: Partial<WorkerInstanceRecord>
  ): WorkerInstanceRecord {
    return workerHeartbeatManager.recordHeartbeat(workerId, overrides);
  }

  /**
   * Retrieves deduplicated active operational alerts.
   */
  public async getAlerts(
    workspaceId: string = 'ws_default',
    asOfDate: Date = new Date()
  ): Promise<OperationalIncident[]> {
    return alertDetector.detectIncidents(workspaceId, asOfDate);
  }
}

export const monitoringService = MonitoringService.getInstance();
