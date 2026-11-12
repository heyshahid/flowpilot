import { describe, expect, it } from 'vitest';
import { ExecutionStateManager, InvalidStateTransitionError } from '../src/core/execution/stateManager';
import { ExecutionPlanner, ExecutionPlanningError } from '../src/core/execution/planner';
import { manualTriggerDriver } from '../src/core/runtime/drivers/manualTrigger';
import { ifElseDriver } from '../src/core/runtime/drivers/ifElse';
import { dataTransformDriver } from '../src/core/runtime/drivers/dataTransform';
import { sendEmailDriver } from '../src/core/runtime/drivers/sendEmail';
import { httpRequestDriver } from '../src/core/runtime/drivers/httpRequest';
import { SSRFProtectionViolationException } from '../src/core/security/ssrf';
import { maskSensitiveData } from '../src/core/security/masking';
import { executionQueue } from '../src/core/execution/queue';
import { executionStore } from '../src/lib/storage/executionStore';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { WorkflowGraph } from '../src/core/types/workflow';

describe('Phase 4: Backend Workflow Execution Engine', () => {
  describe('1. Execution State Manager & Lifecycle Transitions', () => {
    it('should permit valid linear workflow state transitions', () => {
      expect(ExecutionStateManager.canTransitionWorkflow('QUEUED', 'VALIDATING')).toBe(true);
      expect(ExecutionStateManager.canTransitionWorkflow('VALIDATING', 'RUNNING')).toBe(true);
      expect(ExecutionStateManager.canTransitionWorkflow('RUNNING', 'COMPLETED')).toBe(true);
      expect(ExecutionStateManager.canTransitionWorkflow('RUNNING', 'FAILED')).toBe(true);
      expect(ExecutionStateManager.canTransitionWorkflow('RUNNING', 'CANCELLED')).toBe(true);
    });

    it('should forbid illegal transitions from terminal states', () => {
      expect(ExecutionStateManager.canTransitionWorkflow('COMPLETED', 'RUNNING')).toBe(false);
      expect(ExecutionStateManager.canTransitionWorkflow('FAILED', 'RUNNING')).toBe(false);
      expect(ExecutionStateManager.canTransitionWorkflow('CANCELLED', 'QUEUED')).toBe(false);

      expect(() => {
        ExecutionStateManager.validateWorkflowTransition('COMPLETED', 'RUNNING', 'exec_123');
      }).toThrowError(InvalidStateTransitionError);
    });

    it('should validate node-level transitions and identify terminal states', () => {
      expect(ExecutionStateManager.canTransitionNode('PENDING', 'READY')).toBe(true);
      expect(ExecutionStateManager.canTransitionNode('READY', 'RUNNING')).toBe(true);
      expect(ExecutionStateManager.canTransitionNode('RUNNING', 'COMPLETED')).toBe(true);
      expect(ExecutionStateManager.canTransitionNode('PENDING', 'SKIPPED')).toBe(true);

      expect(ExecutionStateManager.isTerminalNodeStatus('COMPLETED')).toBe(true);
      expect(ExecutionStateManager.isTerminalNodeStatus('SKIPPED')).toBe(true);
      expect(ExecutionStateManager.isTerminalNodeStatus('FAILED')).toBe(true);
      expect(ExecutionStateManager.isTerminalNodeStatus('RUNNING')).toBe(false);
    });
  });

  describe('2. Execution Planner & Topological Dependency Resolution', () => {
    it('should generate multi-stage execution plan for a DAG', () => {
      const graph: WorkflowGraph = {
        id: 'wf_plan_test',
        name: 'Planning Test DAG',
        nodes: [
          { id: 'trigger_1', type: 'trigger.manual', category: 'trigger', name: 'Start', config: {} },
          { id: 'node_action_1', type: 'data.transform', category: 'data', name: 'Step 1', config: {} },
          { id: 'node_action_2', type: 'action.sendEmail', category: 'action', name: 'Step 2', config: {} },
        ],
        edges: [
          { id: 'e1', source: 'trigger_1', target: 'node_action_1' },
          { id: 'e2', source: 'node_action_1', target: 'node_action_2' },
        ],
      };

      const plan = ExecutionPlanner.plan(graph);
      expect(plan.orderedNodes.map((n) => n.id)).toEqual(['trigger_1', 'node_action_1', 'node_action_2']);
      expect(plan.stages.length).toBe(3);
      expect(plan.triggerNode.id).toBe('trigger_1');
    });

    it('should detect cycles and throw ExecutionPlanningError', () => {
      const cyclicGraph: WorkflowGraph = {
        id: 'wf_cyclic',
        name: 'Cyclic Graph',
        nodes: [
          { id: 't1', type: 'trigger.manual', category: 'trigger', name: 'Trigger', config: {} },
          { id: 'a1', type: 'data.transform', category: 'data', name: 'A', config: {} },
          { id: 'b1', type: 'data.transform', category: 'data', name: 'B', config: {} },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'a1' },
          { id: 'e2', source: 'a1', target: 'b1' },
          { id: 'e3', source: 'b1', target: 'a1' }, // Cycle
        ],
      };

      expect(() => ExecutionPlanner.plan(cyclicGraph)).toThrowError(ExecutionPlanningError);
    });

    it('should correctly calculate skipped nodes when conditional branch is taken', () => {
      const graph: WorkflowGraph = {
        id: 'wf_branching',
        name: 'Branching DAG',
        nodes: [
          { id: 'trigger', type: 'trigger.webhook', category: 'trigger', name: 'Trigger', config: {} },
          { id: 'decision', type: 'logic.ifElse', category: 'logic', name: 'If/Else', config: {} },
          { id: 'action_true', type: 'action.sendEmail', category: 'action', name: 'True Path', config: {} },
          { id: 'action_false', type: 'data.transform', category: 'data', name: 'False Path', config: {} },
          { id: 'false_sub', type: 'action.sendEmail', category: 'action', name: 'False Sub Action', config: {} },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'decision' },
          { id: 'e2', source: 'decision', target: 'action_true', sourceHandle: 'true' },
          { id: 'e3', source: 'decision', target: 'action_false', sourceHandle: 'false' },
          { id: 'e4', source: 'action_false', target: 'false_sub' },
        ],
      };

      const plan = ExecutionPlanner.plan(graph);
      // If decision is 'true', action_false and false_sub must be marked SKIPPED
      const skipped = ExecutionPlanner.calculateSkippedNodes(
        'decision',
        'true',
        plan.adjacencyList,
        plan.predecessors,
        new Set()
      );

      expect(skipped.has('action_false')).toBe(true);
      expect(skipped.has('false_sub')).toBe(true);
      expect(skipped.has('action_true')).toBe(false);
    });
  });

  describe('3. Modular Node Drivers & Zero-Trust SSRF Protection', () => {
    it('should execute manual trigger driver and pass context payload', async () => {
      const mockContext: any = {
        executionId: 'exec_test',
        trigger: { payload: { orderId: 'ord_123', amount: 99.99 } },
      };

      const output = await manualTriggerDriver(mockContext, {});
      expect(output.triggered).toBe(true);
      expect(output.payload).toEqual({ orderId: 'ord_123', amount: 99.99 });
    });

    it('should evaluate If/Else driver conditions accurately', async () => {
      const mockContext: any = {};

      const trueResult = await ifElseDriver(mockContext, {
        field: 500,
        operator: 'greater_than',
        value: 100,
      });
      expect(trueResult.result).toBe(true);
      expect(trueResult.branch).toBe('true');

      const falseResult = await ifElseDriver(mockContext, {
        field: 'sarah@acme.com',
        operator: 'contains',
        value: 'enterprise',
      });
      expect(falseResult.result).toBe(false);
      expect(falseResult.branch).toBe('false');
    });

    it('should transform data with json stringify, uppercase, and extract_field', async () => {
      const mockContext: any = {};

      const upperResult = await dataTransformDriver(mockContext, {
        mode: 'to_uppercase',
        input: 'flowpilot automation',
      });
      expect(upperResult.result).toBe('FLOWPILOT AUTOMATION');

      const extracted = await dataTransformDriver(mockContext, {
        mode: 'extract_field',
        fieldPath: 'customer.profile.name',
        input: { customer: { profile: { name: 'Shahid Akram' } } },
      });
      expect(extracted.result).toBe('Shahid Akram');
    });

    it('should validate email in sendEmail driver', async () => {
      const mockContext: any = {};

      // Invalid email
      await expect(
        sendEmailDriver(mockContext, { to: 'invalid-email', subject: 'Hello' })
      ).rejects.toThrowError(/Invalid recipient email/);

      // Valid email
      const result = await sendEmailDriver(mockContext, {
        to: 'shahid@flowpilot.dev',
        subject: 'Deal Closed',
        content: 'Congratulations on closing the deal!',
      });
      expect(result.delivered).toBe(true);
      expect(result.recipient).toBe('shahid@flowpilot.dev');
    });

    it('should strictly block SSRF internal, loopback, and cloud metadata in httpRequestDriver', async () => {
      const mockContext: any = {};

      // Localhost blocked
      await expect(
        httpRequestDriver(mockContext, { url: 'http://localhost:8080/metrics' })
      ).rejects.toThrowError(SSRFProtectionViolationException);

      // Loopback 127.0.0.1 blocked
      await expect(
        httpRequestDriver(mockContext, { url: 'http://127.0.0.1:3000/api/keys' })
      ).rejects.toThrowError(SSRFProtectionViolationException);

      // AWS/GCP metadata endpoint blocked
      await expect(
        httpRequestDriver(mockContext, { url: 'http://169.254.169.254/latest/meta-data/' })
      ).rejects.toThrowError(SSRFProtectionViolationException);

      // Private RFC 1918 network blocked
      await expect(
        httpRequestDriver(mockContext, { url: 'http://192.168.1.1/admin' })
      ).rejects.toThrowError(SSRFProtectionViolationException);
    });

    it('should mask sensitive authorization and secret credentials in logs', () => {
      const sensitivePayload = {
        url: 'https://api.github.com/user',
        apiKey: 'secret_live_9921490192',
        headers: {
          Authorization: 'Bearer sk-proj-1234567890abcdef',
          'Content-Type': 'application/json',
        },
        user: {
          username: 'shahid',
          password: 'my-super-secret-password',
        },
      };

      const masked = maskSensitiveData(sensitivePayload);
      expect(masked.apiKey).toBe('[REDACTED]');
      expect(masked.headers.Authorization).toBe('[REDACTED]');
      expect(masked.headers['Content-Type']).toBe('application/json');
      expect(masked.user.password).toBe('[REDACTED]');
      expect(masked.user.username).toBe('shahid');
    });
  });

  describe('4. Durable Job Queue & Background Worker Execution', () => {
    it('should enqueue, execute to completion, and store execution traces', async () => {
      // 1. Create a test workflow in store
      const testWf = workflowStore.create({
        name: 'Automated Lead Qualification Pipeline',
        triggerType: 'trigger.manual',
      });

      // Add a data transform node and email node connected linearly
      testWf.nodes.push(
        {
          id: 'step_transform',
          type: 'data.transform',
          category: 'data',
          name: 'Transform Lead Name',
          config: { mode: 'to_uppercase', input: '{{ $trigger.payload.leadName }}' },
        },
        {
          id: 'step_email',
          type: 'action.sendEmail',
          category: 'action',
          name: 'Email Confirmation',
          config: {
            to: 'lead@enterprise.org',
            subject: 'Welcome to FlowPilot',
            content: 'Hello {{ $steps.step_transform.output.result }}',
          },
        }
      );

      testWf.edges = [
        { id: 'e1', source: testWf.nodes[0].id, target: 'step_transform' },
        { id: 'e2', source: 'step_transform', target: 'step_email' },
      ];
      workflowStore.save(testWf);

      // 2. Enqueue workflow execution
      const execution = await executionQueue.enqueue(testWf.id, {
        leadName: 'Alex Mercer',
      });

      expect(execution.id).toBeDefined();
      expect(execution.status).toBe('QUEUED');

      // 3. Wait for background worker completion
      const completed = await executionQueue.waitForExecution(execution.id, 5000);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.durationMs).toBeGreaterThanOrEqual(0);
      expect(completed.traces.length).toBe(3);

      const emailTrace = completed.traces.find((t) => t.nodeId === 'step_email');
      expect(emailTrace?.status).toBe('COMPLETED');
      expect(emailTrace?.output.delivered).toBe(true);
    });

    it('should handle execution cancellation cleanly', async () => {
      const cancelWf = workflowStore.create({
        name: 'Long Running Task',
        triggerType: 'trigger.manual',
      });

      cancelWf.nodes.push({
        id: 'delay_step',
        type: 'logic.delay',
        category: 'logic',
        name: 'Long Sleep',
        config: { durationMs: 2000 },
      });
      cancelWf.edges = [{ id: 'e1', source: cancelWf.nodes[0].id, target: 'delay_step' }];
      workflowStore.save(cancelWf);

      const enqueued = await executionQueue.enqueue(cancelWf.id, {});
      // Immediately cancel
      const cancelled = await executionQueue.cancel(enqueued.id);
      expect(cancelled).toBe(true);

      const record = await executionStore.getById(enqueued.id);
      expect(record?.status).toBe('CANCELLED');
    });

    it('should retry a failed execution and increment retry count', async () => {
      // Create a workflow with a failing node
      const failWf = workflowStore.create({
        name: 'Failing Pipeline',
        triggerType: 'trigger.manual',
      });

      failWf.nodes.push({
        id: 'bad_email',
        type: 'action.sendEmail',
        category: 'action',
        name: 'Send Bad Email',
        config: { to: 'not-an-email', subject: 'Test' },
      });
      failWf.edges = [{ id: 'e1', source: failWf.nodes[0].id, target: 'bad_email' }];
      workflowStore.save(failWf);

      const enqueued = await executionQueue.enqueue(failWf.id, {});
      const completed = await executionQueue.waitForExecution(enqueued.id, 5000);
      expect(completed.status).toBe('FAILED');
      expect(completed.retryCount).toBe(0);

      // Retry the execution
      const retried = await executionQueue.retry(completed.id);
      expect(retried.status).toBe('QUEUED');
      expect(retried.retryCount).toBe(1);
    });
  });
});
