import { describe, expect, it } from 'vitest';
import { CronParser } from '../src/core/scheduler/cronParser';
import { scheduleStore } from '../src/lib/storage/scheduleStore';
import { schedulerEngine } from '../src/core/scheduler/schedulerEngine';
import { delayDriver } from '../src/core/runtime/drivers/delay';
import { waitUntilDriver } from '../src/core/runtime/drivers/waitUntil';
import { loopDriver } from '../src/core/runtime/drivers/loop';
import { advancedConditionDriver } from '../src/core/runtime/drivers/advancedCondition';
import { mergeDriver } from '../src/core/runtime/drivers/merge';
import { subWorkflowDriver } from '../src/core/runtime/drivers/subWorkflow';
import { versionStore } from '../src/lib/storage/versionStore';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { executionQueue } from '../src/core/execution/queue';
import { NodeExecutionContext } from '../src/core/runtime/types';

describe('Phase 6: Advanced Automation & Scheduling', () => {
  const mockContext: NodeExecutionContext = {
    executionId: 'exec_test_phase6',
    workflowId: 'wf_crm_sync',
    node: { id: 'test_node', type: 'logic.delay', category: 'logic', name: 'Test', config: {} },
    trigger: { type: 'trigger.manual', payload: {}, timestamp: new Date().toISOString() },
    steps: {},
  };

  describe('1. Cron Parser & Scheduling Calculations', () => {
    it('should parse standard 5-part cron expressions correctly', () => {
      const parts = CronParser.parse('15 9 1 6 1'); // June 1st at 09:15 if Monday
      expect(parts.minutes).toEqual([15]);
      expect(parts.hours).toEqual([9]);
      expect(parts.daysOfMonth).toEqual([1]);
      expect(parts.months).toEqual([6]);
      expect(parts.daysOfWeek).toEqual([1]);
    });

    it('should support step expressions and aliases', () => {
      const partsStep = CronParser.parse('*/15 * * * *');
      expect(partsStep.minutes).toEqual([0, 15, 30, 45]);

      const hourlyParts = CronParser.parse('@hourly');
      expect(hourlyParts.minutes).toEqual([0]);

      const dailyParts = CronParser.parse('@daily');
      expect(dailyParts.minutes).toEqual([0]);
      expect(dailyParts.hours).toEqual([0]);
    });

    it('should reject invalid cron expressions', () => {
      expect(CronParser.isValid('not a cron')).toBe(false);
      expect(CronParser.isValid('65 * * * *')).toBe(false); // Minute > 59
      expect(CronParser.isValid('* * * 13 *')).toBe(false); // Month > 12
    });

    it('should compute the next execution date accurately', () => {
      const fromDate = new Date('2026-06-01T08:00:00Z');
      const nextRun = CronParser.getNextRun('0 9 * * *', fromDate, 'UTC');
      expect(nextRun.getUTCHours()).toBe(9);
      expect(nextRun.getUTCMinutes()).toBe(0);
      expect(nextRun.getUTCDate()).toBe(1);
    });
  });

  describe('2. Durable Schedule Store & Engine', () => {
    it('should save, list, and calculate nextRunAt for schedules', async () => {
      const saved = await scheduleStore.save({
        workflowId: 'wf_crm_sync',
        workflowName: 'Home-grown CRM System',
        name: 'Unit Test Schedule',
        type: 'cron',
        cronExpression: '0 12 * * *',
        timezone: 'UTC',
        status: 'active',
        catchUpMissed: true,
      });

      expect(saved.id).toBeDefined();
      expect(saved.nextRunAt).toBeDefined();

      const retrieved = await scheduleStore.getById(saved.id);
      expect(retrieved?.name).toBe('Unit Test Schedule');

      // Cleanup
      await scheduleStore.delete(saved.id);
      expect(await scheduleStore.getById(saved.id)).toBeNull();
    });

    it('should identify due schedules and advance execution counts', async () => {
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const testSched = await scheduleStore.save({
        workflowId: 'wf_crm_sync',
        workflowName: 'Home-grown CRM System',
        name: 'Due Schedule Test',
        type: 'cron',
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        status: 'active',
        nextRunAt: pastTime,
        catchUpMissed: true,
      });

      const due = await scheduleStore.getDueSchedules(new Date());
      const found = due.find((s) => s.id === testSched.id);
      expect(found).toBeDefined();

      // Record a run
      const updated = await scheduleStore.recordRun(testSched.id, 'exec_mock_123');
      expect(updated?.runCount).toBe(1);
      expect(updated?.lastExecutionId).toBe('exec_mock_123');

      await scheduleStore.delete(testSched.id);
    });

    it('should trigger due schedules via SchedulerEngine without duplicates', async () => {
      const pastTime = new Date(Date.now() - 10000).toISOString();
      const sched = await scheduleStore.save({
        workflowId: 'wf_crm_sync',
        workflowName: 'Home-grown CRM System',
        name: 'Engine Trigger Test',
        type: 'cron',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        status: 'active',
        nextRunAt: pastTime,
        catchUpMissed: true,
      });

      const tickResult = await schedulerEngine.tick(new Date());
      expect(tickResult.checkedCount).toBeGreaterThan(0);
      expect(tickResult.triggeredScheduleIds).toContain(sched.id);

      await scheduleStore.delete(sched.id);
    });
  });

  describe('3. Delay & Wait Until Drivers', () => {
    it('should execute delay with unit conversion', async () => {
      const result = await delayDriver(mockContext, { duration: 50, unit: 'seconds', durationMs: 20 });
      expect(result.completed).toBe(true);
      expect(result.delayedDurationMs).toBe(20);
      expect(result.resumeAt).toBeDefined();
    });

    it('should reject delays exceeding maximum 30 days', async () => {
      const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
      await expect(
        delayDriver(mockContext, { durationMs: thirtyOneDaysMs })
      ).rejects.toThrow('exceeds maximum limit of 30 days');
    });

    it('should resume Wait Until immediately if target date has already passed', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const result = await waitUntilDriver(mockContext, { targetDateTime: pastDate });
      expect(result.status).toBe('already_passed');
      expect(result.waitMs).toBe(0);
      expect(result.completed).toBe(true);
    });

    it('should reject invalid date strings in Wait Until', async () => {
      await expect(
        waitUntilDriver(mockContext, { targetDateTime: 'invalid-date' })
      ).rejects.toThrow('Invalid ISO date format');
    });
  });

  describe('4. Loop Node & Controlled Iteration', () => {
    it('should iterate over arrays and generate batch metadata', async () => {
      const items = ['apple', 'banana', 'cherry', 'dates'];
      const result = await loopDriver(mockContext, { items, batchSize: 2 });

      expect(result.totalItems).toBe(4);
      expect(result.processedCount).toBe(4);
      expect(result.results.length).toBe(4);
      expect(result.results[0]).toEqual({
        index: 0,
        item: 'apple',
        batch: 0,
        isFirst: true,
        isLast: false,
      });
      expect(result.results[3].isLast).toBe(true);
    });

    it('should enforce maxIterations limit to prevent runaway loops', async () => {
      const largeArray = new Array(250).fill('item');
      const result = await loopDriver(mockContext, { items: largeArray, maxIterations: 50 });

      expect(result.totalItems).toBe(250);
      expect(result.processedCount).toBe(50);
      expect(result.cappedAtLimit).toBe(true);
    });
  });

  describe('5. Advanced Branching & Merge Node', () => {
    it('should evaluate multi-rule AND / OR condition groups', async () => {
      // AND combinator: both must match
      const andResult = await advancedConditionDriver(mockContext, {
        combinator: 'AND',
        rules: [
          { field: 150, operator: 'greater_than', value: 100 },
          { field: 'gold', operator: 'equals', value: 'gold' },
        ],
      });
      expect(andResult.result).toBe(true);
      expect(andResult.branch).toBe('true');

      // AND failure
      const andFail = await advancedConditionDriver(mockContext, {
        combinator: 'AND',
        rules: [
          { field: 50, operator: 'greater_than', value: 100 },
          { field: 'gold', operator: 'equals', value: 'gold' },
        ],
      });
      expect(andFail.result).toBe(false);
      expect(andFail.branch).toBe('false');

      // OR combinator: one match suffices
      const orResult = await advancedConditionDriver(mockContext, {
        combinator: 'OR',
        rules: [
          { field: 50, operator: 'greater_than', value: 100 },
          { field: 'silver', operator: 'equals', value: 'silver' },
        ],
      });
      expect(orResult.result).toBe(true);
      expect(orResult.branch).toBe('true');
    });

    it('should evaluate switch/case branching with default handle', async () => {
      const cases = [
        { case: 'VIP', handle: 'vip_branch' },
        { case: 'STANDARD', handle: 'standard_branch' },
      ];

      const vipMatch = await advancedConditionDriver(mockContext, {
        mode: 'switch',
        value: 'VIP',
        cases,
      });
      expect(vipMatch.branch).toBe('vip_branch');

      const fallbackMatch = await advancedConditionDriver(mockContext, {
        mode: 'switch',
        value: 'UNKNOWN_TIER',
        cases,
        defaultHandle: 'fallback_branch',
      });
      expect(fallbackMatch.branch).toBe('fallback_branch');
    });

    it('should aggregate parent branch outputs in Merge driver', async () => {
      const mergeContext: NodeExecutionContext = {
        ...mockContext,
        steps: {
          node_step_1: {
            status: 'COMPLETED',
            output: { leadScore: 92 },
            durationMs: 10,
          },
          node_step_2: {
            status: 'SKIPPED',
            output: {},
            durationMs: 0,
          },
        },
      };

      const result = await mergeDriver(mergeContext, { mode: 'wait_all' });
      expect(result.mergedCount).toBe(1);
      expect(result.activeSources).toContain('node_step_1');
      expect(result.skippedSources).toContain('node_step_2');
      expect(result.data).toHaveProperty('node_step_1');
    });
  });

  describe('6. Sub-Workflows & Circular Recursion Protection', () => {
    it('should detect and reject circular sub-workflow calls', async () => {
      const circularContext: NodeExecutionContext = {
        ...mockContext,
        workflowId: 'wf_parent',
        trigger: {
          type: 'trigger.manual',
          payload: {
            $callStack: ['wf_parent', 'wf_order_enrichment'],
          },
          timestamp: new Date().toISOString(),
        },
      };

      // Calling 'wf_parent' which is already in $callStack must throw error
      await expect(
        subWorkflowDriver(circularContext, { subWorkflowId: 'wf_parent' })
      ).rejects.toThrow('Circular workflow recursion detected');
    });

    it('should enforce maximum sub-workflow nesting depth of 5', async () => {
      const deepContext: NodeExecutionContext = {
        ...mockContext,
        workflowId: 'wf_5',
        trigger: {
          type: 'trigger.manual',
          payload: {
            $callStack: ['wf_1', 'wf_2', 'wf_3', 'wf_4', 'wf_5'],
          },
          timestamp: new Date().toISOString(),
        },
      };

      await expect(
        subWorkflowDriver(deepContext, { subWorkflowId: 'wf_crm_sync' })
      ).rejects.toThrow('Maximum sub-workflow nesting depth limit of 5 exceeded');
    });
  });

  describe('7. Workflow Versioning & Rollback', () => {
    it('should create version snapshots and list version history', async () => {
      const v = await versionStore.createVersion(
        'wf_crm_sync',
        'Added Switch node and automated schedule',
        true,
        'shahid'
      );

      expect(v.id).toBeDefined();
      expect(v.versionNumber).toBeGreaterThanOrEqual(1);
      expect(v.workflowId).toBe('wf_crm_sync');

      const versions = await versionStore.listVersions('wf_crm_sync');
      expect(versions.length).toBeGreaterThanOrEqual(2);
      expect(versions[0].versionNumber).toBeGreaterThan(versions[1].versionNumber);
    });

    it('should compare structural diffs between two versions', async () => {
      const versions = await versionStore.listVersions('wf_crm_sync');
      expect(versions.length).toBeGreaterThanOrEqual(2);

      const diff = await versionStore.compareVersions(versions[1].id, versions[0].id);
      expect(diff).toHaveProperty('addedNodes');
      expect(diff).toHaveProperty('removedNodes');
      expect(diff).toHaveProperty('modifiedNodes');
    });

    it('should restore a workflow to a previous version snapshot', async () => {
      const versions = await versionStore.listVersions('wf_crm_sync');
      const targetVersion = versions[versions.length - 1]; // Oldest version

      const restored = await versionStore.restoreVersion('wf_crm_sync', targetVersion.id);
      expect(restored.restoredVersion.id).toBe(targetVersion.id);
      expect(restored.workflow.id).toBe('wf_crm_sync');
    });
  });
});
