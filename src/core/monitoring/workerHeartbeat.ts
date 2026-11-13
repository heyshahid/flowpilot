import { executionQueue } from '../execution/queue';
import { workerStore } from '../../lib/storage/workerStore';
import { QueueObservabilityMetric, WorkerHealthStatus, WorkerInstanceRecord } from './types';

export class WorkerHeartbeatManager {
  private static instance: WorkerHeartbeatManager;
  private primaryWorkerId = 'worker_standalone_primary';
  private startedAt = new Date().toISOString();

  public static getInstance(): WorkerHeartbeatManager {
    if (!WorkerHeartbeatManager.instance) {
      WorkerHeartbeatManager.instance = new WorkerHeartbeatManager();
    }
    return WorkerHeartbeatManager.instance;
  }

  public recordHeartbeat(
    workerId: string = this.primaryWorkerId,
    overrides?: Partial<WorkerInstanceRecord>
  ): WorkerInstanceRecord {
    const existing = workerStore.getById(workerId);
    const now = new Date().toISOString();

    const pid = typeof process !== 'undefined' ? process.pid || 1 : 1;
    const nodeVersion = typeof process !== 'undefined' ? process.version || 'v20.0.0' : 'browser';
    const uptimeSeconds = typeof process !== 'undefined' ? Math.floor(process.uptime ? process.uptime() : 0) : 0;
    const memoryUsageMb =
      typeof process !== 'undefined' && process.memoryUsage
        ? Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
        : 64;

    const activeJobsCount = executionQueue.getRunningCount();
    const queuedJobsCount = executionQueue.getQueueLength();
    const maxConcurrency = executionQueue.getMaxConcurrency();

    const record: WorkerInstanceRecord = {
      id: workerId,
      name: overrides?.name || existing?.name || 'Primary FlowPilot In-Process Worker',
      type: overrides?.type || existing?.type || 'standalone_in_process',
      status: 'HEALTHY',
      lastHeartbeatAt: overrides?.lastHeartbeatAt || now,
      startedAt: existing?.startedAt || this.startedAt,
      activeJobsCount: overrides?.activeJobsCount ?? activeJobsCount,
      queuedJobsCount: overrides?.queuedJobsCount ?? queuedJobsCount,
      maxConcurrency: overrides?.maxConcurrency ?? maxConcurrency,
      uptimeSeconds: overrides?.uptimeSeconds ?? uptimeSeconds,
      memoryUsageMb: overrides?.memoryUsageMb ?? memoryUsageMb,
      pid: overrides?.pid ?? pid,
      nodeVersion: overrides?.nodeVersion ?? nodeVersion,
      isStale: false,
      metadata: {
        architecture: 'single_node_embedded',
        distributedClusteringEnabled: false,
        ...(existing?.metadata || {}),
        ...(overrides?.metadata || {}),
      },
    };

    // Re-evaluate health status based on recorded timestamp vs current time
    const evaluated = this.evaluateWorkerHealth(record, new Date());
    return workerStore.upsert(evaluated);
  }

  public evaluateWorkerHealth(
    worker: WorkerInstanceRecord,
    asOfDate: Date = new Date()
  ): WorkerInstanceRecord {
    const lastBeatTime = new Date(worker.lastHeartbeatAt).getTime();
    const asOfTime = asOfDate.getTime();
    const ageMs = Math.max(0, asOfTime - lastBeatTime);

    let status: WorkerHealthStatus = 'HEALTHY';
    let isStale = false;

    if (ageMs > 90000) {
      status = 'OFFLINE';
      isStale = true;
    } else if (ageMs > 30000) {
      status = 'STALE';
      isStale = true;
    }

    return {
      ...worker,
      status,
      isStale,
    };
  }

  public getWorkerObservability(asOfDate: Date = new Date()): {
    workers: WorkerInstanceRecord[];
    primaryWorker: WorkerInstanceRecord | null;
    queueMetrics: QueueObservabilityMetric;
  } {
    let workers = workerStore.list();

    if (workers.length === 0) {
      // Initialize primary worker on first inquiry
      const initialized = this.recordHeartbeat();
      workers = [initialized];
    }

    // Evaluate health statuses
    const evaluatedWorkers = workers.map((w) => this.evaluateWorkerHealth(w, asOfDate));

    const primaryWorker =
      evaluatedWorkers.find((w) => w.id === this.primaryWorkerId) || evaluatedWorkers[0] || null;

    const queueDepth = executionQueue.getQueueLength();
    const activeConcurrency = executionQueue.getRunningCount();
    const maxConcurrency = executionQueue.getMaxConcurrency();
    const utilizationPercent =
      maxConcurrency > 0 ? Math.min(100, Math.round((activeConcurrency / maxConcurrency) * 100)) : 0;

    const queueMetrics: QueueObservabilityMetric = {
      queueDepth,
      activeConcurrency,
      maxConcurrency,
      utilizationPercent,
      isSaturated: activeConcurrency >= maxConcurrency,
      isQueueAvailable: true,
      mode: 'in_process_fifo',
    };

    return {
      workers: evaluatedWorkers,
      primaryWorker,
      queueMetrics,
    };
  }
}

export const workerHeartbeatManager = WorkerHeartbeatManager.getInstance();

