import { executionStore } from '../../lib/storage/executionStore';
import { workflowStore } from '../../lib/storage/workflowStore';
import { aiUsageStore, AIUsageLogEntry } from '../../lib/storage/aiUsageStore';
import { scheduleStore } from '../../lib/storage/scheduleStore';
import { webhookStore } from '../../lib/storage/webhookStore';
import { WorkflowExecutionRecord, WorkflowExecutionStatus } from '../execution/types';
import {
  AnalyticsQueryOptions,
  DateRangeFilter,
  ExecutionSummaryMetrics,
  IntegrationHealthSummary,
  NodePerformanceMetric,
  SchedulerHealthMetrics,
  TimeBucketInterval,
  TimeSeriesResult,
  TimeWindow,
  WorkflowPerformanceReport,
  WorkflowAnalyticsSummaryItem,
  AIUsageMetricsSummary,
} from './types';
import {
  calculateFailureRate,
  calculateMeanDuration,
  calculateMedianDuration,
  calculateP95Duration,
  calculateSuccessRate,
  filterValidDurations,
  formatCurrency,
} from './metricDefinitions';
import { bucketExecutions } from './timeSeries';
import { BottleneckAnalyzer } from './bottleneckAnalyzer';
import { AIPricingManager } from './pricing';

export class AnalyticsService {
  /**
   * Resolves a TimeWindow or custom date range into strict [from, to) boundaries.
   */
  public static parseTimeWindow(
    window: TimeWindow = '30d',
    custom?: DateRangeFilter
  ): { from: Date; to: Date } {
    const to = new Date();
    let from: Date;

    if (window === 'custom' && custom?.startDate && custom?.endDate) {
      from = new Date(custom.startDate);
      const customTo = new Date(custom.endDate);
      return { from, to: customTo };
    }

    switch (window) {
      case '24h':
        from = new Date(to.getTime() - 24 * 3600 * 1000);
        break;
      case '7d':
        from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
        break;
      case '30d':
        from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
        break;
      case '90d':
        from = new Date(to.getTime() - 90 * 24 * 3600 * 1000);
        break;
      default:
        from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    }

    return { from, to };
  }

  /**
   * Retrieves filtered workflow execution records adhering to tenant isolation and time range.
   */
  private async getFilteredExecutions(
    options: AnalyticsQueryOptions
  ): Promise<{ executions: WorkflowExecutionRecord[]; from: Date; to: Date }> {
    const { from, to } = AnalyticsService.parseTimeWindow(
      options.timeWindow,
      options.customDateRange
    );

    const fromTime = from.getTime();
    const toTime = to.getTime();

    // Query storage
    const all = await executionStore.list({
      workspaceId: options.workspaceId,
      workflowId: options.workflowId,
      limit: 10000,
    });

    // Enforce strict [from, to) boundary filtering
    const executions = all.items.filter((e) => {
      const started = new Date(e.startedAt).getTime();
      return started >= fromTime && started < toTime;
    });

    return { executions, from, to };
  }

  /**
   * Generates high-level execution summary metrics strictly from actual storage data.
   * Excludes in-flight and cancelled runs from success/failure denominators.
   */
  public async getExecutionSummary(
    options: AnalyticsQueryOptions
  ): Promise<ExecutionSummaryMetrics> {
    const { executions, from, to } = await this.getFilteredExecutions(options);

    const totalExecutions = executions.length;
    let completedExecutions = 0;
    let failedExecutions = 0;
    let cancelledExecutions = 0;
    let inFlightExecutions = 0;

    const inFlightStatuses: WorkflowExecutionStatus[] = [
      'RUNNING',
      'QUEUED',
      'WAITING',
      'VALIDATING',
    ];

    for (const e of executions) {
      if (e.status === 'COMPLETED') completedExecutions++;
      else if (e.status === 'FAILED') failedExecutions++;
      else if (e.status === 'CANCELLED') cancelledExecutions++;
      else if (inFlightStatuses.includes(e.status)) inFlightExecutions++;
    }

    const terminalExecutions = completedExecutions + failedExecutions;

    // Durations calculation: only consider completed runs with valid durationMs
    const completedDurations = executions
      .filter((e) => e.status === 'COMPLETED' && typeof e.durationMs === 'number' && e.durationMs >= 0)
      .map((e) => e.durationMs as number);

    const successRate = calculateSuccessRate(completedExecutions, failedExecutions);
    const failureRate = calculateFailureRate(completedExecutions, failedExecutions);
    const meanDurationMs = calculateMeanDuration(completedDurations);
    const medianDurationMs = calculateMedianDuration(completedDurations);
    const p95DurationMs = calculateP95Duration(completedDurations);

    return {
      totalExecutions,
      terminalExecutions,
      completedExecutions,
      failedExecutions,
      cancelledExecutions,
      inFlightExecutions,
      successRate,
      failureRate,
      meanDurationMs,
      medianDurationMs,
      p95DurationMs,
      timeWindow: options.timeWindow || '30d',
      reportingPeriod: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    };
  }

  /**
   * Generates time-series data bucketed continuously with zero-filled empty intervals.
   */
  public async getExecutionTimeSeries(
    options: AnalyticsQueryOptions,
    interval?: TimeBucketInterval
  ): Promise<TimeSeriesResult> {
    const { executions, from, to } = await this.getFilteredExecutions(options);

    // Pick sensible interval default based on window if not explicitly provided
    let chosenInterval = interval;
    if (!chosenInterval) {
      const window = options.timeWindow || '30d';
      if (window === '24h') chosenInterval = 'hour';
      else if (window === '7d' || window === '30d') chosenInterval = 'day';
      else chosenInterval = 'week';
    }

    return bucketExecutions(executions, from, to, chosenInterval);
  }

  /**
   * Generates a comprehensive performance report for a specific workflow.
   */
  public async getWorkflowPerformance(
    workflowId: string,
    options: AnalyticsQueryOptions
  ): Promise<WorkflowPerformanceReport> {
    const workflow = await workflowStore.getById(workflowId);
    const workflowName = workflow?.name || `Workflow ${workflowId}`;

    const queryOptions: AnalyticsQueryOptions = {
      ...options,
      workflowId,
    };

    const summary = await this.getExecutionSummary(queryOptions);
    const durationTrend = await this.getExecutionTimeSeries(queryOptions, 'day');

    const { executions } = await this.getFilteredExecutions(queryOptions);
    const nodeMetrics = BottleneckAnalyzer.analyze(executions);

    const mostProblematicNodes = nodeMetrics.filter(
      (m) => m.warnings.highDuration || m.warnings.highFailureRate
    );

    return {
      workflowId,
      workflowName,
      workspaceId: options.workspaceId,
      summary,
      durationTrend,
      nodeMetrics,
      mostProblematicNodes,
    };
  }

  /**
   * Retrieves summary performance metrics for all workflows in a workspace for the reporting period.
   */
  public async getWorkspaceWorkflowsOverview(
    options: AnalyticsQueryOptions
  ): Promise<WorkflowAnalyticsSummaryItem[]> {
    const workflows = workflowStore.getAll(options.workspaceId);
    const { executions } = await this.getFilteredExecutions(options);

    // Group executions by workflowId
    const execsByWorkflow = new Map<string, WorkflowExecutionRecord[]>();
    for (const e of executions) {
      const list = execsByWorkflow.get(e.workflowId) || [];
      list.push(e);
      execsByWorkflow.set(e.workflowId, list);
    }

    const items: WorkflowAnalyticsSummaryItem[] = workflows.map((wf) => {
      const wfExecs = execsByWorkflow.get(wf.id) || [];
      const totalExecutions = wfExecs.length;
      const completedExecutions = wfExecs.filter((e) => e.status === 'COMPLETED').length;
      const failedExecutions = wfExecs.filter((e) => e.status === 'FAILED').length;

      const completedDurations = wfExecs
        .filter((e) => e.status === 'COMPLETED' && typeof e.durationMs === 'number' && e.durationMs >= 0)
        .map((e) => e.durationMs as number);

      const successRate = calculateSuccessRate(completedExecutions, failedExecutions);
      const meanDurationMs = calculateMeanDuration(completedDurations);

      let lastExecutedAt: string | null = null;
      if (wfExecs.length > 0) {
        lastExecutedAt = wfExecs[0].startedAt;
      } else if (wf.lastExecutedAt) {
        lastExecutedAt = wf.lastExecutedAt;
      }

      const triggerNode = wf.nodes?.find((n) => n.category === 'trigger' || n.type?.startsWith('trigger'));
      const triggerType = triggerNode?.type || (wfExecs.length > 0 ? wfExecs[0].trigger?.type : 'manual') || 'manual';

      return {
        id: wf.id,
        name: wf.name,
        status: wf.status,
        triggerType,
        totalExecutions,
        completedExecutions,
        failedExecutions,
        successRate,
        meanDurationMs,
        lastExecutedAt,
        updatedAt: wf.updatedAt,
      };
    });

    // Also include any execution records from workflows not in store
    const knownWorkflowIds = new Set(workflows.map((w) => w.id));
    for (const [wfId, wfExecs] of execsByWorkflow.entries()) {
      if (!knownWorkflowIds.has(wfId)) {
        const sample = wfExecs[0];
        const completedExecutions = wfExecs.filter((e) => e.status === 'COMPLETED').length;
        const failedExecutions = wfExecs.filter((e) => e.status === 'FAILED').length;
        const completedDurations = wfExecs
          .filter((e) => e.status === 'COMPLETED' && typeof e.durationMs === 'number' && e.durationMs >= 0)
          .map((e) => e.durationMs as number);

        items.push({
          id: wfId,
          name: sample.workflowName || `Workflow ${wfId}`,
          status: 'active',
          triggerType: sample.trigger?.type || 'manual',
          totalExecutions: wfExecs.length,
          completedExecutions,
          failedExecutions,
          successRate: calculateSuccessRate(completedExecutions, failedExecutions),
          meanDurationMs: calculateMeanDuration(completedDurations),
          lastExecutedAt: sample.startedAt,
          updatedAt: sample.startedAt,
        });
      }
    }

    items.sort(
      (a, b) =>
        b.totalExecutions - a.totalExecutions ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return items;
  }

  /**
   * Generates node performance and bottleneck metrics across all workflows or a specific workflow.
   */
  public async getNodePerformanceMetrics(
    options: AnalyticsQueryOptions
  ): Promise<NodePerformanceMetric[]> {
    const { executions } = await this.getFilteredExecutions(options);
    return BottleneckAnalyzer.analyze(executions);
  }

  /**
   * Aggregates AI token usage and estimated costs using versioned pricing tiers.
   */
  public async getAIUsageAnalytics(
    options: AnalyticsQueryOptions
  ): Promise<AIUsageMetricsSummary> {
    const { from, to } = AnalyticsService.parseTimeWindow(
      options.timeWindow,
      options.customDateRange
    );

    const fromTime = from.getTime();
    const toTime = to.getTime();

    const rawLogs = aiUsageStore.getRawLogs(options.workspaceId);
    const matchingLogs = rawLogs.filter((l) => {
      const t = new Date(l.timestamp).getTime();
      return t >= fromTime && t < toTime;
    });

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCostUsd = 0;
    let totalLatencyMs = 0;
    let allPriced = true;

    const byProvider: Record<string, { requests: number; tokens: number; estimatedCostUsd: number | null }> = {};
    const byModel: Record<string, { requests: number; tokens: number; estimatedCostUsd: number | null }> = {};

    for (const log of matchingLogs) {
      const pTokens = log.usage?.promptTokens || 0;
      const cTokens = log.usage?.completionTokens || 0;
      const tTokens = log.usage?.totalTokens || pTokens + cTokens;

      totalPromptTokens += pTokens;
      totalCompletionTokens += cTokens;
      totalLatencyMs += log.durationMs || 0;

      // Calculate cost dynamically using versioned pricing as of log timestamp
      const costResult = AIPricingManager.calculateCost(
        log.provider,
        log.model,
        pTokens,
        cTokens,
        new Date(log.timestamp)
      );

      if (costResult.isAvailable && costResult.costUsd !== null) {
        totalCostUsd += costResult.costUsd;
      } else {
        allPriced = false;
      }

      // Aggregate by provider
      if (!byProvider[log.provider]) {
        byProvider[log.provider] = { requests: 0, tokens: 0, estimatedCostUsd: 0 };
      }
      byProvider[log.provider].requests += 1;
      byProvider[log.provider].tokens += tTokens;
      if (byProvider[log.provider].estimatedCostUsd !== null && costResult.isAvailable && costResult.costUsd !== null) {
        byProvider[log.provider].estimatedCostUsd! += costResult.costUsd;
      }

      // Aggregate by model
      if (!byModel[log.model]) {
        byModel[log.model] = { requests: 0, tokens: 0, estimatedCostUsd: 0 };
      }
      byModel[log.model].requests += 1;
      byModel[log.model].tokens += tTokens;
      if (byModel[log.model].estimatedCostUsd !== null && costResult.isAvailable && costResult.costUsd !== null) {
        byModel[log.model].estimatedCostUsd! += costResult.costUsd;
      }
    }

    const totalRequests = matchingLogs.length;
    const meanLatencyMs = totalRequests > 0 ? Math.round(totalLatencyMs / totalRequests) : null;
    const finalCost = Number(totalCostUsd.toFixed(6));

    return {
      workspaceId: options.workspaceId,
      totalRequests,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalPromptTokens,
      totalCompletionTokens,
      meanLatencyMs,
      estimatedCostUsd: {
        value: totalRequests === 0 ? null : finalCost,
        formatted: totalRequests === 0 ? 'N/A' : formatCurrency(finalCost, 4),
        sampleSize: totalRequests,
        isAvailable: totalRequests > 0 && allPriced,
        notes: !allPriced ? 'Some model tiers were uninstrumented in pricing registry' : undefined,
      },
      pricingVersionUsed: '2026-Q1',
      byProvider,
      byModel,
    };
  }

  /**
   * Evaluates scheduler health based solely on confirmed configurations.
   * Does not fabricate worker heartbeats or queue depth.
   */
  public async getSchedulerHealth(
    workspaceId: string
  ): Promise<SchedulerHealthMetrics> {
    const schedules = await scheduleStore.list({ workspaceId });
    const now = Date.now();

    let activeCount = 0;
    let pausedCount = 0;
    let dueCount = 0;

    const upcomingRuns: SchedulerHealthMetrics['upcomingScheduledRuns'] = [];

    for (const s of schedules) {
      if (s.status === 'active') {
        activeCount++;
        const nextTime = s.nextRunAt ? new Date(s.nextRunAt).getTime() : Infinity;
        if (nextTime <= now) {
          dueCount++;
        }
        if (s.nextRunAt) {
          upcomingRuns.push({
            scheduleId: s.id,
            scheduleName: s.name,
            workflowName: s.workflowName,
            nextRunAt: s.nextRunAt,
          });
        }
      } else {
        pausedCount++;
      }
    }

    // Sort upcoming runs by nextRunAt ascending
    upcomingRuns.sort(
      (a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime()
    );

    return {
      workspaceId,
      activeSchedulesCount: activeCount,
      pausedSchedulesCount: pausedCount,
      dueSchedulesCount: dueCount,
      upcomingScheduledRuns: upcomingRuns.slice(0, 10),
      recentlyExecutedCount: schedules.reduce((acc, s) => acc + (s.runCount || 0), 0),
      instrumentationStatus: {
        workerHeartbeatInstrumented: false,
        queueDepthInstrumented: false,
        note: 'Worker heartbeat and distributed queue depth require external Redis/BullMQ instrumentation (Phase 10+). Showing confirmed schedule configs only.',
      },
    };
  }

  /**
   * Summarizes webhook delivery health from actual delivery logs.
   * Explicitly documents the 500-record circular buffer boundary.
   */
  public async getIntegrationHealth(
    workspaceId: string
  ): Promise<IntegrationHealthSummary> {
    // Deliveries are capped to 500 in WebhookStore
    const deliveries = await webhookStore.getDeliveries(undefined, 500);

    let accepted = 0;
    let rejected = 0;
    let failed = 0;
    let totalDuration = 0;
    const httpStatusDistribution: Record<string, number> = {};

    for (const d of deliveries) {
      if (d.status === 'ACCEPTED') accepted++;
      else if (d.status === 'REJECTED') rejected++;
      else failed++;

      totalDuration += d.durationMs || 0;
      const statusKey = String(d.httpStatus || 200);
      httpStatusDistribution[statusKey] = (httpStatusDistribution[statusKey] || 0) + 1;
    }

    const total = deliveries.length;
    const meanDuration = total > 0 ? Number((totalDuration / total).toFixed(2)) : null;

    return {
      workspaceId,
      totalDeliveriesSampled: total,
      acceptedDeliveries: accepted,
      rejectedDeliveries: rejected,
      failedDeliveries: failed,
      meanDeliveryDurationMs: meanDuration,
      httpStatusDistribution,
      historyLimitation: 'Capped to 500 recent deliveries per WebhookStore buffer.',
    };
  }
}

export const analyticsService = new AnalyticsService();
