import { workflowStore } from '@/lib/storage/workflowStore';
import { executionStore } from '@/lib/storage/executionStore';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { aiUsageStore } from '@/lib/storage/aiUsageStore';
import { integrationHealthService } from '@/core/analytics/integrationHealthService';
import { credentialStore } from '@/lib/storage/credentialStore';
import { workspaceLimitsStore } from '@/lib/storage/workspaceLimitsStore';
import { AIPricingManager } from '@/core/analytics/pricing';
import {
  WorkspaceUsageSummary,
  ResourceLimitStatus,
  ResourceLimitThresholdState,
  UsageTimeWindow,
  UsageTrendPoint,
} from './types';

export class UsageService {
  /**
   * Parse time window into Date range
   */
  public static parseTimeWindow(
    window: UsageTimeWindow = '30d',
    custom?: { from?: string; to?: string }
  ): { from: Date; to: Date } {
    const to = custom?.to ? new Date(custom.to) : new Date();
    let from: Date;

    if (window === 'custom' && custom?.from) {
      from = new Date(custom.from);
    } else {
      from = new Date(to.getTime());
      switch (window) {
        case '7d':
          from.setDate(to.getDate() - 7);
          break;
        case '90d':
          from.setDate(to.getDate() - 90);
          break;
        case '30d':
        default:
          from.setDate(to.getDate() - 30);
          break;
      }
    }

    return { from, to };
  }

  /**
   * Determine threshold state
   */
  public static evaluateThresholdState(
    current: number,
    limit: number | null
  ): { percentage: number | null; state: ResourceLimitThresholdState } {
    if (limit === null || limit <= 0) {
      return { percentage: null, state: 'UNLIMITED' };
    }

    const pct = Math.round((current / limit) * 1000) / 10; // 1 decimal place

    if (pct > 100) {
      return { percentage: pct, state: 'LIMIT_REACHED' };
    } else if (pct === 100) {
      return { percentage: pct, state: 'CRITICAL' };
    } else if (pct >= 80) {
      return { percentage: pct, state: 'WARNING' };
    } else {
      return { percentage: pct, state: 'NORMAL' };
    }
  }

  /**
   * Retrieve holistic usage summary for a workspace
   */
  public async getWorkspaceUsageSummary(
    workspaceId: string = 'ws_default',
    timeWindow: UsageTimeWindow = '30d',
    customRange?: { from?: string; to?: string }
  ): Promise<WorkspaceUsageSummary> {
    const { from, to } = UsageService.parseTimeWindow(timeWindow, customRange);

    // 1. Workflows
    const allWorkflows = workflowStore.getAll(workspaceId);
    const workflows = {
      total: allWorkflows.length,
      active: allWorkflows.filter((w) => w.status === 'active').length,
      paused: allWorkflows.filter((w) => w.status === 'paused').length,
      draft: allWorkflows.filter((w) => w.status === 'draft').length,
    };

    // 2. Executions within date window
    const executionList = await executionStore.list({ workspaceId, limit: 1000 });
    const executionsInPeriod = executionList.items.filter((e) => {
      const execDate = new Date(e.startedAt);
      return execDate >= from && execDate <= to;
    });

    const completed = executionsInPeriod.filter((e) => e.status === 'COMPLETED').length;
    const failed = executionsInPeriod.filter((e) => e.status === 'FAILED').length;
    const cancelled = executionsInPeriod.filter((e) => e.status === 'CANCELLED').length;
    const running = executionsInPeriod.filter(
      (e) => e.status === 'RUNNING' || e.status === 'QUEUED'
    ).length;
    const terminal = completed + failed;
    const failureRate =
      terminal > 0 ? Math.round((failed / terminal) * 1000) / 10 : null;

    // Peak concurrency estimate
    let concurrencyPeak = 0;
    if (executionsInPeriod.length > 0) {
      // Find overlapping intervals
      const timePoints: Array<{ time: number; delta: number }> = [];
      for (const ex of executionsInPeriod) {
        const start = new Date(ex.startedAt).getTime();
        const end = ex.completedAt
          ? new Date(ex.completedAt).getTime()
          : start + (ex.durationMs || 1000);
        timePoints.push({ time: start, delta: 1 });
        timePoints.push({ time: end, delta: -1 });
      }
      timePoints.sort((a, b) => a.time - b.time);
      let currentRunning = 0;
      for (const pt of timePoints) {
        currentRunning += pt.delta;
        if (currentRunning > concurrencyPeak) {
          concurrencyPeak = currentRunning;
        }
      }
    }

    const executions = {
      total: executionsInPeriod.length,
      completed,
      failed,
      cancelled,
      running,
      concurrencyPeak,
      failureRate,
    };

    // 3. Schedules
    const allSchedules = await scheduleStore.list({ workspaceId });
    const schedules = {
      total: allSchedules.length,
      active: allSchedules.filter((s) => s.status === 'active').length,
      paused: allSchedules.filter((s) => s.status === 'paused').length,
      completed: allSchedules.filter((s) => s.status === 'completed').length,
    };

    // 4. AI Usage & Pricing
    const aiLogs = aiUsageStore.getRawLogs(workspaceId);
    const aiLogsInPeriod = aiLogs.filter((log) => {
      const logDate = new Date(log.timestamp);
      return logDate >= from && logDate <= to;
    });

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let estimatedCostUsd = 0;
    let unpricedRequests = 0;

    for (const log of aiLogsInPeriod) {
      promptTokens += log.usage.promptTokens || 0;
      completionTokens += log.usage.completionTokens || 0;
      totalTokens += log.usage.totalTokens || 0;

      const costResult = AIPricingManager.calculateCost(
        log.provider,
        log.model,
        log.usage.promptTokens || 0,
        log.usage.completionTokens || 0,
        new Date(log.timestamp)
      );

      if (costResult.isAvailable && costResult.costUsd !== null) {
        estimatedCostUsd += costResult.costUsd;
      } else {
        unpricedRequests++;
      }
    }

    estimatedCostUsd = Math.round(estimatedCostUsd * 10000) / 10000;

    const aiUsage = {
      totalRequests: aiLogsInPeriod.length,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      unpricedRequests,
    };

    // 5. Integrations & Credentials
    const integrationOverview = await integrationHealthService.getOverview(workspaceId);
    const credentials = await credentialStore.list({ workspaceId });

    const integrations = {
      totalOperations: integrationOverview.totalOperations,
      successful: integrationOverview.successfulOperations,
      failed: integrationOverview.failedOperations,
      webhookDeliveries: integrationOverview.inboundWebhookDeliveriesCount,
      configuredCredentials: credentials.length,
    };

    // 6. Limits Evaluation
    const limitsConfig = workspaceLimitsStore.getByWorkspaceId(workspaceId);

    const limits: Record<string, ResourceLimitStatus> = {};

    const wfEval = UsageService.evaluateThresholdState(
      workflows.total,
      limitsConfig?.maxWorkflows ?? null
    );
    limits.workflows = {
      metric: 'workflows',
      name: 'Total Workflows',
      current: workflows.total,
      limit: limitsConfig?.maxWorkflows ?? null,
      percentage: wfEval.percentage,
      state: wfEval.state,
      unit: 'workflows',
    };

    const execEval = UsageService.evaluateThresholdState(
      executions.total,
      limitsConfig?.maxMonthlyExecutions ?? null
    );
    limits.monthlyExecutions = {
      metric: 'monthlyExecutions',
      name: 'Executions in Window',
      current: executions.total,
      limit: limitsConfig?.maxMonthlyExecutions ?? null,
      percentage: execEval.percentage,
      state: execEval.state,
      unit: 'runs',
    };

    const concEval = UsageService.evaluateThresholdState(
      executions.concurrencyPeak,
      limitsConfig?.maxConcurrentExecutions ?? null
    );
    limits.concurrentExecutions = {
      metric: 'concurrentExecutions',
      name: 'Concurrent Executions',
      current: executions.concurrencyPeak,
      limit: limitsConfig?.maxConcurrentExecutions ?? null,
      percentage: concEval.percentage,
      state: concEval.state,
      unit: 'concurrent',
    };

    const schedEval = UsageService.evaluateThresholdState(
      schedules.active,
      limitsConfig?.maxActiveSchedules ?? null
    );
    limits.activeSchedules = {
      metric: 'activeSchedules',
      name: 'Active Schedules',
      current: schedules.active,
      limit: limitsConfig?.maxActiveSchedules ?? null,
      percentage: schedEval.percentage,
      state: schedEval.state,
      unit: 'schedules',
    };

    const aiTokensEval = UsageService.evaluateThresholdState(
      aiUsage.totalTokens,
      limitsConfig?.maxAiTokensMonthly ?? null
    );
    limits.aiTokens = {
      metric: 'aiTokens',
      name: 'AI Tokens Used',
      current: aiUsage.totalTokens,
      limit: limitsConfig?.maxAiTokensMonthly ?? null,
      percentage: aiTokensEval.percentage,
      state: aiTokensEval.state,
      unit: 'tokens',
    };

    const aiCostEval = UsageService.evaluateThresholdState(
      aiUsage.estimatedCostUsd,
      limitsConfig?.maxAiCostMonthlyUsd ?? null
    );
    limits.aiCost = {
      metric: 'aiCost',
      name: 'Estimated AI Cost',
      current: aiUsage.estimatedCostUsd,
      limit: limitsConfig?.maxAiCostMonthlyUsd ?? null,
      percentage: aiCostEval.percentage,
      state: aiCostEval.state,
      unit: 'USD',
    };

    const intOpsEval = UsageService.evaluateThresholdState(
      integrations.totalOperations,
      limitsConfig?.maxMonthlyIntegrationOps ?? null
    );
    limits.integrationOps = {
      metric: 'integrationOps',
      name: 'Integration Operations',
      current: integrations.totalOperations,
      limit: limitsConfig?.maxMonthlyIntegrationOps ?? null,
      percentage: intOpsEval.percentage,
      state: intOpsEval.state,
      unit: 'ops',
    };

    return {
      workspaceId,
      period: {
        timeWindow,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      workflows,
      executions,
      schedules,
      aiUsage,
      integrations,
      limits,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieve time-series usage trend points
   */
  public async getUsageTrends(
    workspaceId: string = 'ws_default',
    days: number = 30
  ): Promise<UsageTrendPoint[]> {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);

    const executionList = await executionStore.list({ workspaceId, limit: 1000 });
    const aiLogs = aiUsageStore.getRawLogs(workspaceId);

    // Group by YYYY-MM-DD
    const pointsMap = new Map<string, UsageTrendPoint>();

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      pointsMap.set(dateStr, {
        date: dateStr,
        executions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        aiTokens: 0,
        aiCostUsd: 0,
        integrationOps: 0,
      });
    }

    // Populate execution metrics
    for (const ex of executionList.items) {
      const dateStr = ex.startedAt.split('T')[0];
      const point = pointsMap.get(dateStr);
      if (point) {
        point.executions += 1;
        if (ex.status === 'COMPLETED') point.successfulExecutions += 1;
        if (ex.status === 'FAILED') point.failedExecutions += 1;
      }
    }

    // Populate AI metrics
    for (const log of aiLogs) {
      const dateStr = log.timestamp.split('T')[0];
      const point = pointsMap.get(dateStr);
      if (point) {
        point.aiTokens += log.usage.totalTokens || 0;
        const cost = AIPricingManager.calculateCost(
          log.provider,
          log.model,
          log.usage.promptTokens || 0,
          log.usage.completionTokens || 0,
          new Date(log.timestamp)
        );
        if (cost.isAvailable && cost.costUsd) {
          point.aiCostUsd += cost.costUsd;
        }
      }
    }

    // Round cost values
    for (const pt of pointsMap.values()) {
      pt.aiCostUsd = Math.round(pt.aiCostUsd * 10000) / 10000;
    }

    return Array.from(pointsMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }
}

export const usageService = new UsageService();

