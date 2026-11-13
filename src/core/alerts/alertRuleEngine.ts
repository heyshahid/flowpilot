import { alertRuleStore } from '@/lib/storage/alertRuleStore';
import { alertIncidentStore } from '@/lib/storage/alertIncidentStore';
import { notificationService } from './notificationService';
import { executionStore } from '@/lib/storage/executionStore';
import { scheduleStore } from '@/lib/storage/scheduleStore';
import { aiUsageStore } from '@/lib/storage/aiUsageStore';
import { integrationHealthService } from '@/core/analytics/integrationHealthService';
import { webhookStore } from '@/lib/storage/webhookStore';
import { usageService } from '@/core/usage/usageService';
import { AIPricingManager } from '@/core/analytics/pricing';
import {
  AlertRule,
  AlertIncident,
  AlertOperator,
} from './types';

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  currentValue: number;
  threshold: number;
  incident?: AlertIncident;
  reason: string;
}

export interface WorkspaceEvaluationSummary {
  workspaceId: string;
  evaluatedRulesCount: number;
  triggeredCount: number;
  cooldownSkippedCount: number;
  results: RuleEvaluationResult[];
  evaluatedAt: string;
}

export class AlertRuleEngine {
  /**
   * Compare a value against threshold using operator
   */
  public static compare(
    current: number,
    operator: AlertOperator,
    threshold: number
  ): boolean {
    switch (operator) {
      case 'gt':
        return current > threshold;
      case 'gte':
        return current >= threshold;
      case 'lt':
        return current < threshold;
      case 'lte':
        return current <= threshold;
      case 'eq':
        return Math.abs(current - threshold) < 0.0001;
      default:
        return false;
    }
  }

  /**
   * Evaluate a single alert rule against real persistent workspace data
   */
  public async evaluateRule(
    inputRule: AlertRule,
    asOfDate: Date = new Date()
  ): Promise<RuleEvaluationResult> {
    const rule = alertRuleStore.getById(inputRule.id, inputRule.workspaceId) || inputRule;
    const windowMs = (rule.evaluationWindowMinutes || 15) * 60 * 1000;
    const windowStart = new Date(asOfDate.getTime() - windowMs);
    let currentValue = 0;
    let metricDescription = '';

    // Calculate metric value based on category and metric
    switch (rule.metric) {
      case 'failure_rate': {
        const executions = await executionStore.list({
          workspaceId: rule.workspaceId,
          workflowId: rule.targetWorkflowId,
          limit: 1000,
        });
        const inWindow = executions.items.filter((e) => {
          const d = new Date(e.startedAt);
          return d >= windowStart && d <= asOfDate;
        });
        const completed = inWindow.filter((e) => e.status === 'COMPLETED').length;
        const failed = inWindow.filter((e) => e.status === 'FAILED').length;
        const terminal = completed + failed;
        currentValue =
          terminal > 0 ? Math.round((failed / terminal) * 1000) / 10 : 0;
        metricDescription = `Failure rate: ${currentValue}% (${failed}/${terminal} runs in window)`;
        break;
      }

      case 'consecutive_failures': {
        const executions = await executionStore.list({
          workspaceId: rule.workspaceId,
          workflowId: rule.targetWorkflowId,
          limit: 50,
        });
        let count = 0;
        for (const ex of executions.items) {
          if (ex.status === 'FAILED') {
            count++;
          } else if (ex.status === 'COMPLETED') {
            break;
          }
        }
        currentValue = count;
        metricDescription = `Consecutive failures: ${currentValue}`;
        break;
      }

      case 'execution_duration_p95': {
        const executions = await executionStore.list({
          workspaceId: rule.workspaceId,
          workflowId: rule.targetWorkflowId,
          limit: 500,
        });
        const inWindow = executions.items
          .filter((e) => {
            const d = new Date(e.startedAt);
            return (
              d >= windowStart &&
              d <= asOfDate &&
              (e.status === 'COMPLETED' || e.status === 'FAILED')
            );
          })
          .map((e) => e.durationMs)
          .sort((a, b) => a - b);

        if (inWindow.length === 0) {
          currentValue = 0;
        } else {
          const p95Index = Math.floor(inWindow.length * 0.95);
          currentValue = inWindow[p95Index] || inWindow[inWindow.length - 1];
        }
        metricDescription = `P95 execution duration: ${currentValue}ms`;
        break;
      }

      case 'stuck_executions': {
        const executions = await executionStore.list({
          workspaceId: rule.workspaceId,
          limit: 500,
        });
        const stuckThresholdMs = 15 * 60 * 1000; // 15 mins
        const stuck = executions.items.filter((e) => {
          if (e.status === 'RUNNING' || e.status === 'QUEUED') {
            const age = asOfDate.getTime() - new Date(e.startedAt).getTime();
            return age > stuckThresholdMs;
          }
          return false;
        });
        currentValue = stuck.length;
        metricDescription = `Stuck executions: ${currentValue}`;
        break;
      }

      case 'missed_schedules': {
        const schedules = await scheduleStore.list({
          workspaceId: rule.workspaceId,
          status: 'active',
        });
        let missedCount = 0;
        for (const s of schedules) {
          if (s.nextRunAt) {
            const dueTime = new Date(s.nextRunAt).getTime();
            // Due > 5 minutes ago and hasn't run since
            if (asOfDate.getTime() - dueTime > 5 * 60 * 1000) {
              const lastRun = s.lastRunAt ? new Date(s.lastRunAt).getTime() : 0;
              if (lastRun < dueTime) {
                missedCount++;
              }
            }
          }
        }
        currentValue = missedCount;
        metricDescription = `Missed schedules: ${currentValue}`;
        break;
      }

      case 'schedule_failure_rate': {
        const executions = await executionStore.list({
          workspaceId: rule.workspaceId,
          limit: 500,
        });
        const scheduledInWindow = executions.items.filter((e) => {
          const d = new Date(e.startedAt);
          return (
            d >= windowStart &&
            d <= asOfDate &&
            e.trigger?.type === 'schedule'
          );
        });
        const completed = scheduledInWindow.filter(
          (e) => e.status === 'COMPLETED'
        ).length;
        const failed = scheduledInWindow.filter(
          (e) => e.status === 'FAILED'
        ).length;
        const total = completed + failed;
        currentValue = total > 0 ? Math.round((failed / total) * 1000) / 10 : 0;
        metricDescription = `Schedule failure rate: ${currentValue}% (${failed}/${total} runs)`;
        break;
      }

      case 'integration_failure_rate': {
        const overview = await integrationHealthService.getOverview(
          rule.workspaceId
        );
        currentValue = overview.failureRatePercent || 0;
        metricDescription = `Integration failure rate: ${currentValue}%`;
        break;
      }

      case 'webhook_error_rate': {
        const deliveries = await webhookStore.getDeliveries(undefined, 500);
        const wsDeliveries = deliveries.filter((d) => {
          const dt = new Date(d.timestamp);
          return dt >= windowStart && dt <= asOfDate;
        });
        const failed = wsDeliveries.filter((d) => d.status === 'FAILED' || d.status === 'REJECTED').length;
        currentValue =
          wsDeliveries.length > 0
            ? Math.round((failed / wsDeliveries.length) * 1000) / 10
            : 0;
        metricDescription = `Webhook error rate: ${currentValue}% (${failed}/${wsDeliveries.length} deliveries)`;
        break;
      }

      case 'monthly_cost_usd': {
        const aiLogs = aiUsageStore.getRawLogs(rule.workspaceId);
        const thirtyDaysAgo = new Date(
          asOfDate.getTime() - 30 * 24 * 60 * 60 * 1000
        );
        let cost = 0;
        for (const log of aiLogs) {
          const logDate = new Date(log.timestamp);
          if (logDate >= thirtyDaysAgo && logDate <= asOfDate) {
            const pricing = AIPricingManager.calculateCost(
              log.provider,
              log.model,
              log.usage.promptTokens || 0,
              log.usage.completionTokens || 0,
              logDate
            );
            if (pricing.isAvailable && pricing.costUsd) {
              cost += pricing.costUsd;
            }
          }
        }
        currentValue = Math.round(cost * 100) / 100;
        metricDescription = `Monthly AI cost: $${currentValue.toFixed(2)} USD`;
        break;
      }

      case 'monthly_tokens': {
        const aiLogs = aiUsageStore.getRawLogs(rule.workspaceId);
        const thirtyDaysAgo = new Date(
          asOfDate.getTime() - 30 * 24 * 60 * 60 * 1000
        );
        let tokens = 0;
        for (const log of aiLogs) {
          const logDate = new Date(log.timestamp);
          if (logDate >= thirtyDaysAgo && logDate <= asOfDate) {
            tokens += log.usage.totalTokens || 0;
          }
        }
        currentValue = tokens;
        metricDescription = `Monthly AI tokens: ${currentValue}`;
        break;
      }

      case 'unpriced_requests_count': {
        const aiLogs = aiUsageStore.getRawLogs(rule.workspaceId);
        let unpriced = 0;
        for (const log of aiLogs) {
          const pricing = AIPricingManager.calculateCost(
            log.provider,
            log.model,
            log.usage.promptTokens || 0,
            log.usage.completionTokens || 0,
            new Date(log.timestamp)
          );
          if (!pricing.isAvailable) unpriced++;
        }
        currentValue = unpriced;
        metricDescription = `Unpriced AI requests: ${currentValue}`;
        break;
      }

      case 'workflow_limit_pct':
      case 'execution_limit_pct':
      case 'schedule_limit_pct':
      case 'ai_cost_limit_pct': {
        const usage = await usageService.getWorkspaceUsageSummary(
          rule.workspaceId,
          '30d'
        );
        if (rule.metric === 'workflow_limit_pct') {
          currentValue = usage.limits.workflows?.percentage || 0;
        } else if (rule.metric === 'execution_limit_pct') {
          currentValue = usage.limits.monthlyExecutions?.percentage || 0;
        } else if (rule.metric === 'schedule_limit_pct') {
          currentValue = usage.limits.activeSchedules?.percentage || 0;
        } else if (rule.metric === 'ai_cost_limit_pct') {
          currentValue = usage.limits.aiCost?.percentage || 0;
        }
        metricDescription = `${rule.metric}: ${currentValue}% of quota`;
        break;
      }

      default:
        currentValue = 0;
        metricDescription = `Unknown metric: ${rule.metric}`;
    }

    const matchesCondition = AlertRuleEngine.compare(
      currentValue,
      rule.operator,
      rule.threshold
    );

    // Update rule's lastEvaluatedAt
    alertRuleStore.update(
      rule.id,
      { lastEvaluatedAt: asOfDate.toISOString() },
      rule.workspaceId
    );

    if (!matchesCondition) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: false,
        currentValue,
        threshold: rule.threshold,
        reason: `${metricDescription} did not meet condition (${rule.operator} ${rule.threshold})`,
      };
    }

    // Condition triggered! Check cooldown
    const cooldownMs = (rule.cooldownMinutes || 15) * 60 * 1000;
    if (rule.lastTriggeredAt) {
      const lastTriggerTime = new Date(rule.lastTriggeredAt).getTime();
      if (asOfDate.getTime() - lastTriggerTime < cooldownMs) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          triggered: false,
          currentValue,
          threshold: rule.threshold,
          reason: `Rule condition met (${metricDescription}), but alert is in cooldown until ${new Date(
            lastTriggerTime + cooldownMs
          ).toISOString()}`,
        };
      }
    }

    // Trigger incident
    const dedupKey = `inc_${rule.workspaceId}_${rule.id}_${rule.targetWorkflowId || 'global'}`;
    const message = `Alert rule "${rule.name}" triggered: ${metricDescription} (Threshold: ${rule.operator} ${rule.threshold})`;

    const { incident, isNew } = alertIncidentStore.createOrUpdateIncident({
      workspaceId: rule.workspaceId,
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      severity: rule.severity,
      dedupKey,
      metric: rule.metric,
      currentValue,
      threshold: rule.threshold,
      message,
      targetType: rule.targetWorkflowId ? 'workflow' : 'workspace',
      targetId: rule.targetWorkflowId || rule.workspaceId,
    });

    // Update rule's lastTriggeredAt
    alertRuleStore.update(
      rule.id,
      { lastTriggeredAt: asOfDate.toISOString() },
      rule.workspaceId
    );

    // Dispatch notifications
    await notificationService.dispatchIncidentNotifications(
      incident,
      rule.channels
    );

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: true,
      currentValue,
      threshold: rule.threshold,
      incident,
      reason: `Incident ${isNew ? 'created' : 'updated'}: ${message}`,
    };
  }

  /**
   * Evaluate all enabled rules for a workspace
   */
  public async evaluateAll(
    workspaceId: string = 'ws_default',
    asOfDate: Date = new Date()
  ): Promise<WorkspaceEvaluationSummary> {
    const rules = alertRuleStore.list(workspaceId, { enabled: true });
    const results: RuleEvaluationResult[] = [];
    let triggeredCount = 0;
    let cooldownSkippedCount = 0;

    for (const rule of rules) {
      const res = await this.evaluateRule(rule, asOfDate);
      results.push(res);
      if (res.triggered) {
        triggeredCount++;
      } else if (res.reason.includes('cooldown')) {
        cooldownSkippedCount++;
      }
    }

    return {
      workspaceId,
      evaluatedRulesCount: rules.length,
      triggeredCount,
      cooldownSkippedCount,
      results,
      evaluatedAt: asOfDate.toISOString(),
    };
  }
}

export const alertRuleEngine = new AlertRuleEngine();
