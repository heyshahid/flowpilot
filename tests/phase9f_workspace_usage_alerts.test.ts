import { describe, it, expect, beforeEach } from 'vitest';
import { usageService } from '@/core/usage/usageService';
import { workspaceLimitsStore } from '@/lib/storage/workspaceLimitsStore';
import { alertRuleStore } from '@/lib/storage/alertRuleStore';
import { alertIncidentStore } from '@/lib/storage/alertIncidentStore';
import { notificationStore } from '@/lib/storage/notificationStore';
import { alertRuleEngine } from '@/core/alerts/alertRuleEngine';
import { notificationService } from '@/core/alerts/notificationService';
import { RBACManager } from '@/core/auth/rbac';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { executionStore } from '@/lib/storage/executionStore';
import { workflowStore } from '@/lib/storage/workflowStore';
import { aiUsageStore } from '@/lib/storage/aiUsageStore';
import { AlertRule } from '@/core/alerts/types';

describe('Phase 9F: Workspace Usage, Resource Quotas & Configurable Alerts System', () => {
  const TEST_WS = 'ws_phase9f_test';

  beforeEach(() => {
    // Reset limits for test workspace
    workspaceLimitsStore.setLimits(TEST_WS, {
      maxWorkflows: 10,
      maxMonthlyExecutions: 100,
      maxConcurrentExecutions: 3,
      maxActiveSchedules: 5,
      maxAiTokensMonthly: 50000,
      maxAiCostMonthlyUsd: 15.0,
      maxMonthlyIntegrationOps: 1000,
    });
  });

  describe('1. Workspace Usage Analytics (Module 9F-A)', () => {
    it('should parse time windows accurately into date ranges', () => {
      const now = new Date();
      const res30d = usageService.constructor.prototype.constructor.parseTimeWindow('30d');
      expect(res30d.to.getTime()).toBeGreaterThan(res30d.from.getTime());
      const diffDays = Math.round((res30d.to.getTime() - res30d.from.getTime()) / (1000 * 3600 * 24));
      expect(diffDays).toBe(30);

      const res7d = usageService.constructor.prototype.constructor.parseTimeWindow('7d');
      const diff7d = Math.round((res7d.to.getTime() - res7d.from.getTime()) / (1000 * 3600 * 24));
      expect(diff7d).toBe(7);

      const customFrom = '2026-01-01T00:00:00.000Z';
      const customTo = '2026-01-10T00:00:00.000Z';
      const resCustom = usageService.constructor.prototype.constructor.parseTimeWindow('custom', {
        from: customFrom,
        to: customTo,
      });
      expect(resCustom.from.toISOString()).toBe(customFrom);
      expect(resCustom.to.toISOString()).toBe(customTo);
    });

    it('should aggregate real workspace usage metrics across all subsystems', async () => {
      const summary = await usageService.getWorkspaceUsageSummary('ws_default', '30d');

      expect(summary).toBeDefined();
      expect(summary.workspaceId).toBe('ws_default');
      expect(summary.workflows.total).toBeGreaterThanOrEqual(0);
      expect(summary.executions.total).toBeGreaterThanOrEqual(0);
      expect(summary.schedules.total).toBeGreaterThanOrEqual(0);
      expect(summary.aiUsage.totalRequests).toBeGreaterThanOrEqual(0);
      expect(summary.integrations.totalOperations).toBeGreaterThanOrEqual(0);
      expect(summary.limits).toBeDefined();
      expect(summary.limits.workflows).toBeDefined();
      expect(summary.limits.monthlyExecutions).toBeDefined();
    });

    it('should produce daily time-series trend points for usage charts', async () => {
      const trends = await usageService.getUsageTrends('ws_default', 7);
      expect(Array.isArray(trends)).toBe(true);
      expect(trends.length).toBeGreaterThanOrEqual(7);
      const point = trends[0];
      expect(point).toHaveProperty('date');
      expect(point).toHaveProperty('executions');
      expect(point).toHaveProperty('aiTokens');
      expect(point).toHaveProperty('aiCostUsd');
      expect(point).toHaveProperty('integrationOps');
    });
  });

  describe('2. Workspace Resource Limits & Quotas (Module 9F-B)', () => {
    it('should evaluate resource threshold states correctly: NORMAL, WARNING, CRITICAL, LIMIT_REACHED, UNLIMITED', () => {
      const evalNormal = usageService.constructor.prototype.constructor.evaluateThresholdState(50, 100);
      expect(evalNormal.state).toBe('NORMAL');
      expect(evalNormal.percentage).toBe(50);

      const evalWarning = usageService.constructor.prototype.constructor.evaluateThresholdState(85, 100);
      expect(evalWarning.state).toBe('WARNING');
      expect(evalWarning.percentage).toBe(85);

      const evalCritical = usageService.constructor.prototype.constructor.evaluateThresholdState(100, 100);
      expect(evalCritical.state).toBe('CRITICAL');
      expect(evalCritical.percentage).toBe(100);

      const evalExceeded = usageService.constructor.prototype.constructor.evaluateThresholdState(112, 100);
      expect(evalExceeded.state).toBe('LIMIT_REACHED');
      expect(evalExceeded.percentage).toBe(112);

      const evalUnlimited = usageService.constructor.prototype.constructor.evaluateThresholdState(999, null);
      expect(evalUnlimited.state).toBe('UNLIMITED');
      expect(evalUnlimited.percentage).toBeNull();
    });

    it('should support admin configuration and persistence of custom resource limits', () => {
      const updated = workspaceLimitsStore.setLimits(
        TEST_WS,
        {
          maxWorkflows: 25,
          maxMonthlyExecutions: 2000,
          maxAiCostMonthlyUsd: 50.0,
        },
        'usr_admin'
      );

      expect(updated.maxWorkflows).toBe(25);
      expect(updated.maxMonthlyExecutions).toBe(2000);
      expect(updated.maxAiCostMonthlyUsd).toBe(50.0);
      expect(updated.updatedBy).toBe('usr_admin');

      const fetched = workspaceLimitsStore.getByWorkspaceId(TEST_WS);
      expect(fetched?.maxWorkflows).toBe(25);
    });
  });

  describe('3. Configurable Alert Rules (Module 9F-C)', () => {
    let createdRuleId: string;

    it('should create, list, and filter alert rules with workspace isolation', () => {
      const rule = alertRuleStore.create({
        workspaceId: TEST_WS,
        name: 'Test Failure Rate Alert',
        description: 'Testing rule creation',
        category: 'EXECUTION',
        metric: 'failure_rate',
        operator: 'gte',
        threshold: 20.0,
        evaluationWindowMinutes: 30,
        cooldownMinutes: 15,
        severity: 'CRITICAL',
        enabled: true,
        channels: ['in_app'],
        createdBy: 'usr_owner',
      });

      createdRuleId = rule.id;
      expect(rule.id).toBeDefined();
      expect(rule.workspaceId).toBe(TEST_WS);

      const list = alertRuleStore.list(TEST_WS);
      expect(list.some((r) => r.id === createdRuleId)).toBe(true);

      // Verify workspace isolation
      const crossList = alertRuleStore.list('ws_other_non_existent');
      expect(crossList.some((r) => r.id === createdRuleId)).toBe(false);
      expect(alertRuleStore.getById(createdRuleId, 'ws_other_non_existent')).toBeNull();
    });

    it('should update rule fields and toggle enabled status', () => {
      const updated = alertRuleStore.update(
        createdRuleId,
        {
          threshold: 35.0,
          enabled: false,
        },
        TEST_WS
      );

      expect(updated).not.toBeNull();
      expect(updated?.threshold).toBe(35.0);
      expect(updated?.enabled).toBe(false);

      const fetched = alertRuleStore.getById(createdRuleId, TEST_WS);
      expect(fetched?.enabled).toBe(false);
    });

    it('should delete an alert rule', () => {
      const deleted = alertRuleStore.delete(createdRuleId, TEST_WS);
      expect(deleted).toBe(true);
      expect(alertRuleStore.getById(createdRuleId, TEST_WS)).toBeNull();
    });
  });

  describe('4. Alert Rule Engine, Evaluation & Cooldown Safeguards', () => {
    it('should correctly evaluate threshold comparison operators', () => {
      expect(alertRuleEngine.constructor.prototype.constructor.compare(50, 'gt', 40)).toBe(true);
      expect(alertRuleEngine.constructor.prototype.constructor.compare(40, 'gt', 40)).toBe(false);
      expect(alertRuleEngine.constructor.prototype.constructor.compare(40, 'gte', 40)).toBe(true);
      expect(alertRuleEngine.constructor.prototype.constructor.compare(30, 'lt', 40)).toBe(true);
      expect(alertRuleEngine.constructor.prototype.constructor.compare(40, 'lte', 40)).toBe(true);
      expect(alertRuleEngine.constructor.prototype.constructor.compare(40, 'eq', 40)).toBe(true);
      expect(alertRuleEngine.constructor.prototype.constructor.compare(40.1, 'eq', 40)).toBe(false);
    });

    it('should trigger incident when real condition threshold is met', async () => {
      const rule = alertRuleStore.create({
        workspaceId: TEST_WS,
        name: 'Triggered Test Rule',
        category: 'WORKSPACE_USAGE',
        metric: 'workflow_limit_pct',
        operator: 'gte',
        threshold: 0.0, // Guaranteed to trigger since workflows >= 0%
        evaluationWindowMinutes: 15,
        cooldownMinutes: 60,
        severity: 'WARNING',
        enabled: true,
        channels: ['in_app'],
        createdBy: 'usr_admin',
      });

      const result = await alertRuleEngine.evaluateRule(rule);
      expect(result.triggered).toBe(true);
      expect(result.incident).toBeDefined();
      expect(result.incident?.status).toBe('TRIGGERED');
      expect(result.incident?.ruleId).toBe(rule.id);

      // Verify cooldown: immediate re-evaluation must be skipped due to cooldown
      const secondEval = await alertRuleEngine.evaluateRule(rule);
      expect(secondEval.triggered).toBe(false);
      expect(secondEval.reason).toContain('cooldown');

      // Clean up
      alertRuleStore.delete(rule.id, TEST_WS);
    });

    it('should evaluate all enabled rules in a workspace idempotently', async () => {
      const summary = await alertRuleEngine.evaluateAll('ws_default');
      expect(summary.workspaceId).toBe('ws_default');
      expect(summary.evaluatedRulesCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(summary.results)).toBe(true);
    });
  });

  describe('5. Incident Management Lifecycle & Deduplication', () => {
    let incidentId: string;

    it('should create and deduplicate incidents with occurrence counting', () => {
      const dedupKey = `test_dedup_${Date.now()}`;
      const first = alertIncidentStore.createOrUpdateIncident({
        workspaceId: TEST_WS,
        ruleId: 'rule_dummy',
        ruleName: 'Dummy Rule',
        category: 'EXECUTION',
        severity: 'CRITICAL',
        dedupKey,
        metric: 'failure_rate',
        currentValue: 40.0,
        threshold: 25.0,
        message: 'High failure rate',
      });

      expect(first.isNew).toBe(true);
      expect(first.incident.occurrenceCount).toBe(1);
      expect(first.incident.status).toBe('TRIGGERED');
      incidentId = first.incident.id;

      // Second trigger with same dedupKey should update existing incident, NOT create a duplicate
      const second = alertIncidentStore.createOrUpdateIncident({
        workspaceId: TEST_WS,
        ruleId: 'rule_dummy',
        ruleName: 'Dummy Rule',
        category: 'EXECUTION',
        severity: 'CRITICAL',
        dedupKey,
        metric: 'failure_rate',
        currentValue: 45.0,
        threshold: 25.0,
        message: 'High failure rate',
      });

      expect(second.isNew).toBe(false);
      expect(second.incident.id).toBe(incidentId);
      expect(second.incident.occurrenceCount).toBe(2);
      expect(second.incident.currentValue).toBe(45.0);
    });

    it('should transition incident lifecycle: TRIGGERED -> ACKNOWLEDGED -> RESOLVED', () => {
      // 1. Acknowledge
      const acked = alertIncidentStore.acknowledge(incidentId, 'usr_operator', TEST_WS);
      expect(acked?.status).toBe('ACKNOWLEDGED');
      expect(acked?.acknowledgedBy).toBe('usr_operator');
      expect(acked?.acknowledgedAt).toBeDefined();

      // 2. Resolve with notes
      const resolved = alertIncidentStore.resolve(
        incidentId,
        'usr_lead',
        'Resolved root cause by scaling worker pool',
        TEST_WS
      );
      expect(resolved?.status).toBe('RESOLVED');
      expect(resolved?.resolvedBy).toBe('usr_lead');
      expect(resolved?.resolutionNotes).toBe('Resolved root cause by scaling worker pool');
      expect(resolved?.resolvedAt).toBeDefined();
    });
  });

  describe('6. Notification Dispatch & Delivery Telemetry (Module 9F-D)', () => {
    it('should deliver in-app notifications and record NOT_CONFIGURED status for unconfigured external channels', async () => {
      const mockIncident = {
        id: 'inc_test_telemetry',
        workspaceId: TEST_WS,
        ruleId: 'rule_telemetry',
        ruleName: 'Telemetry Rule',
        category: 'EXECUTION' as const,
        severity: 'CRITICAL' as const,
        status: 'TRIGGERED' as const,
        dedupKey: 'dedup_tel',
        metric: 'failure_rate' as const,
        currentValue: 50,
        threshold: 25,
        message: 'Critical error spike',
        triggeredAt: new Date().toISOString(),
        occurrenceCount: 1,
        lastSeenAt: new Date().toISOString(),
      };

      const notifs = await notificationService.dispatchIncidentNotifications(mockIncident, [
        'in_app',
        'email',
        'slack',
      ]);

      expect(notifs.length).toBe(3);

      const inApp = notifs.find((n) => n.channel === 'in_app');
      expect(inApp?.deliveryStatus).toBe('DELIVERED');

      const email = notifs.find((n) => n.channel === 'email');
      expect(email?.deliveryStatus).toBe('NOT_CONFIGURED');
      expect(email?.deliveryError).toContain('SMTP/Email');

      const slack = notifs.find((n) => n.channel === 'slack');
      expect(slack?.deliveryStatus).toBe('NOT_CONFIGURED');
      expect(slack?.deliveryError).toContain('Slack');
    });

    it('should manage read/unread state on notifications', () => {
      const notif = notificationStore.create({
        workspaceId: TEST_WS,
        incidentId: 'inc_sample',
        ruleId: 'rule_sample',
        channel: 'in_app',
        title: 'Sample Notification',
        message: 'Sample message',
        severity: 'INFO',
        deliveryStatus: 'DELIVERED',
      });

      expect(notif.read).toBe(false);

      const markOk = notificationStore.markAsRead(notif.id, TEST_WS);
      expect(markOk).toBe(true);

      const list = notificationStore.list(TEST_WS);
      const updated = list.items.find((n) => n.id === notif.id);
      expect(updated?.read).toBe(true);
    });
  });

  describe('7. RBAC & Security Matrix (Phase 9F)', () => {
    it('should verify OWNER and ADMIN have full usage, quota, and alert permissions', () => {
      expect(RBACManager.hasPermission('OWNER', 'usage:read')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'quota:read')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'quota:manage')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'alert:read')).toBe(true);
      expect(RBACManager.hasPermission('OWNER', 'alert:manage')).toBe(true);

      expect(RBACManager.hasPermission('ADMIN', 'usage:read')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'quota:manage')).toBe(true);
      expect(RBACManager.hasPermission('ADMIN', 'alert:manage')).toBe(true);
    });

    it('should enforce that EDITOR and VIEWER can read usage & alerts, but cannot manage quotas or alert rules', () => {
      expect(RBACManager.hasPermission('EDITOR', 'usage:read')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'alert:read')).toBe(true);
      expect(RBACManager.hasPermission('EDITOR', 'quota:manage')).toBe(false);
      expect(RBACManager.hasPermission('EDITOR', 'alert:manage')).toBe(false);

      expect(RBACManager.hasPermission('VIEWER', 'usage:read')).toBe(true);
      expect(RBACManager.hasPermission('VIEWER', 'alert:read')).toBe(true);
      expect(RBACManager.hasPermission('VIEWER', 'quota:manage')).toBe(false);
      expect(RBACManager.hasPermission('VIEWER', 'alert:manage')).toBe(false);
    });
  });

  describe('8. Audit Logging Integration for Quotas and Alerts', () => {
    it('should log audit entries with resourceType quota and alert without recording secrets', () => {
      const quotaLog = auditLogStore.log({
        workspaceId: TEST_WS,
        actorId: 'usr_admin',
        actorName: 'Admin User',
        actorEmail: 'admin@flowpilot.internal',
        action: 'quota.updated',
        resourceType: 'quota',
        resourceId: TEST_WS,
        resourceName: 'Workspace Resource Limits',
        metadata: { maxWorkflows: 50, secretKey: 'REDACT_ME' },
      });

      expect(quotaLog.resourceType).toBe('quota');
      expect(quotaLog.metadata?.secretKey).toBe('[REDACTED]');

      const alertLog = auditLogStore.log({
        workspaceId: TEST_WS,
        actorId: 'usr_admin',
        actorName: 'Admin User',
        actorEmail: 'admin@flowpilot.internal',
        action: 'alert.rule_created',
        resourceType: 'alert',
        resourceId: 'rule_123',
        resourceName: 'Critical Failure Rate',
        metadata: { threshold: 25 },
      });

      expect(alertLog.resourceType).toBe('alert');
      expect(alertLog.action).toBe('alert.rule_created');
    });
  });
});

