import { describe, expect, it } from 'vitest';
import { FlowPilotExecutor } from '../src/core/engine/executor';
import { compileGraphTopology, CyclicWorkflowError } from '../src/core/engine/topologicalSort';
import { resolveExpressions } from '../src/core/engine/expressionResolver';
import { SSRFProtectionViolationException, validateOutboundUrl } from '../src/core/security/ssrf';
import { WorkflowExecutionContext, WorkflowGraph } from '../src/core/types/workflow';

describe('FlowPilot Core Execution Engine (Phase 1 Architecture)', () => {
  it('should compile and topologically sort a valid linear workflow', () => {
    const graph: WorkflowGraph = {
      id: 'wf_test_1',
      name: 'Linear Pipeline',
      nodes: [
        { id: 'node_action', type: 'action.httpRequest', category: 'action', name: 'HTTP Action', config: {} },
        { id: 'node_trigger', type: 'trigger.manual', category: 'trigger', name: 'Start', config: {} },
        { id: 'node_email', type: 'action.sendEmail', category: 'action', name: 'Email Lead', config: {} },
      ],
      edges: [
        { id: 'e1', source: 'node_trigger', target: 'node_action' },
        { id: 'e2', source: 'node_action', target: 'node_email' },
      ],
    };

    const topology = compileGraphTopology(graph);
    expect(topology.orderedNodes.map((n) => n.id)).toEqual(['node_trigger', 'node_action', 'node_email']);
  });

  it('should detect cycles and throw CyclicWorkflowError', () => {
    const cyclicGraph: WorkflowGraph = {
      id: 'wf_cyclic',
      name: 'Cyclic Pipeline',
      nodes: [
        { id: 'node_a', type: 'action.httpRequest', category: 'action', name: 'A', config: {} },
        { id: 'node_b', type: 'action.httpRequest', category: 'action', name: 'B', config: {} },
      ],
      edges: [
        { id: 'e1', source: 'node_a', target: 'node_b' },
        { id: 'e2', source: 'node_b', target: 'node_a' }, // Cycle!
      ],
    };

    expect(() => compileGraphTopology(cyclicGraph)).toThrowError(CyclicWorkflowError);
  });

  it('should safely resolve template expressions without eval()', () => {
    const mockContext: WorkflowExecutionContext = {
      executionId: 'exec_100',
      workflowId: 'wf_100',
      trigger: {
        type: 'trigger.webhook',
        timestamp: '2026-11-12T00:00:00Z',
        payload: {
          lead: { email: 'sarah@connor.org', name: 'Sarah Connor', budget: 50000 },
        },
      },
      steps: {
        step_crm: {
          status: 'completed',
          durationMs: 45,
          output: { contactId: 'crm_992' },
        },
      },
      skippedNodeIds: new Set(),
    };

    const template = {
      to: '{{ $trigger.payload.lead.email }}',
      subject: 'Welcome {{ $trigger.payload.lead.name }}!',
      crmReference: '{{ $steps.step_crm.output.contactId }}',
    };

    const resolved = resolveExpressions(template, mockContext);
    expect(resolved.to).toBe('sarah@connor.org');
    expect(resolved.subject).toBe('Welcome Sarah Connor!');
    expect(resolved.crmReference).toBe('crm_992');
  });

  it('should execute a workflow and pass output between steps', async () => {
    const executor = new FlowPilotExecutor();

    // Register a mock HTTP action driver
    executor.registerHandler('action.httpRequest', async ({ resolvedConfig }) => {
      return {
        status: 200,
        data: { message: `Enriched ${resolvedConfig.url}` },
      };
    });

    const graph: WorkflowGraph = {
      id: 'wf_lead_flow',
      name: 'Lead Routing',
      nodes: [
        {
          id: 'start',
          type: 'trigger.webhook',
          category: 'trigger',
          name: 'Webhook Inbound',
          config: {},
        },
        {
          id: 'fetch_data',
          type: 'action.httpRequest',
          category: 'action',
          name: 'Enrichment API',
          config: {
            url: 'https://api.example.com/lookup?user={{ $trigger.payload.userId }}',
          },
        },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'fetch_data' }],
    };

    const result = await executor.execute(graph, { userId: 'usr_771' });

    expect(result.status).toBe('completed');
    expect(result.traces).toHaveLength(2);
    expect(result.traces[0].status).toBe('completed');
    expect(result.traces[1].status).toBe('completed');
    expect(result.traces[1].input.url).toBe('https://api.example.com/lookup?user=usr_771');
    expect(result.traces[1].output.data).toEqual({ message: 'Enriched https://api.example.com/lookup?user=usr_771' });
  });

  it('should handle If/Else conditional branching and skip non-matching branch', async () => {
    const executor = new FlowPilotExecutor();

    const graph: WorkflowGraph = {
      id: 'wf_conditional',
      name: 'VIP Lead Filter',
      nodes: [
        {
          id: 'trigger',
          type: 'trigger.manual',
          category: 'trigger',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'check_vip',
          type: 'logic.ifElse',
          category: 'logic',
          name: 'Is Budget >= 10000?',
          config: {
            field: '{{ $trigger.payload.budget }}',
            operator: 'greater_than',
            value: 9999,
          },
        },
        {
          id: 'vip_action',
          type: 'data.transform',
          category: 'data',
          name: 'Assign to Senior Rep',
          config: { tier: 'VIP' },
        },
        {
          id: 'standard_action',
          type: 'data.transform',
          category: 'data',
          name: 'Assign to Self-Serve',
          config: { tier: 'Standard' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'check_vip' },
        { id: 'e2', source: 'check_vip', target: 'vip_action', sourceHandle: 'true' },
        { id: 'e3', source: 'check_vip', target: 'standard_action', sourceHandle: 'false' },
      ],
    };

    // Run with budget = 25000 (condition is TRUE)
    const resultVip = await executor.execute(graph, { budget: 25000 });
    expect(resultVip.status).toBe('completed');

    const vipTrace = resultVip.traces.find((t) => t.nodeId === 'vip_action');
    const standardTrace = resultVip.traces.find((t) => t.nodeId === 'standard_action');

    expect(vipTrace?.status).toBe('completed');
    expect(standardTrace?.status).toBe('skipped');
  });

  it('should enforce SSRF protection and block unsafe/internal requests', () => {
    // Should block loopback
    expect(() => validateOutboundUrl('http://127.0.0.1:8080/admin')).toThrowError(
      SSRFProtectionViolationException
    );
    expect(() => validateOutboundUrl('http://localhost/secret')).toThrowError(
      SSRFProtectionViolationException
    );

    // Should block AWS/GCP cloud metadata
    expect(() => validateOutboundUrl('http://169.254.169.254/latest/meta-data/')).toThrowError(
      SSRFProtectionViolationException
    );

    // Should block private RFC 1918 subnets
    expect(() => validateOutboundUrl('http://10.0.1.50/metrics')).toThrowError(
      SSRFProtectionViolationException
    );
    expect(() => validateOutboundUrl('http://192.168.1.1/router')).toThrowError(
      SSRFProtectionViolationException
    );

    // Should block file:// or gopher:// protocols
    expect(() => validateOutboundUrl('file:///etc/passwd')).toThrowError(
      SSRFProtectionViolationException
    );

    // Should allow valid public web URLs
    expect(() => validateOutboundUrl('https://api.github.com/users')).not.toThrow();
    expect(() => validateOutboundUrl('https://hooks.slack.com/services/xxx')).not.toThrow();
  });
});
