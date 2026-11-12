import { describe, expect, it } from 'vitest';
import {
  getAllNodeDefinitions,
  getNodeDefinition,
  NODE_REGISTRY,
} from '../src/core/registry/nodeRegistry';
import { validateWorkflowGraph } from '../src/core/validation/graphValidator';
import { WorkflowGraph } from '../src/core/types/workflow';

describe('FlowPilot Phase 3: Visual Builder & Node Registry Tests', () => {
  it('should register all 15 core nodes across 5 categories', () => {
    const all = getAllNodeDefinitions();
    expect(all.length).toBe(15);

    const categories = new Set(all.map((n) => n.category));
    expect(categories).toContain('trigger');
    expect(categories).toContain('action');
    expect(categories).toContain('logic');
    expect(categories).toContain('data');
    expect(categories).toContain('ai');
  });

  it('should validate node configuration against Zod schemas', () => {
    const httpDef = getNodeDefinition('action.httpRequest');
    expect(httpDef).toBeDefined();

    // Valid config
    const validResult = httpDef!.validate({
      url: 'https://api.github.com/repos/heyshahid/flowpilot',
      method: 'GET',
    });
    expect(validResult.isValid).toBe(true);
    expect(validResult.errors).toHaveLength(0);

    // Invalid config (malformed URL)
    const invalidResult = httpDef!.validate({
      url: 'not-a-url',
      method: 'GET',
    });
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  it('should validate If/Else logic node output handles', () => {
    const ifElseDef = getNodeDefinition('logic.ifElse');
    expect(ifElseDef).toBeDefined();
    expect(ifElseDef!.outputs).toHaveLength(2);
    expect(ifElseDef!.outputs.map((p) => p.id)).toEqual(['true', 'false']);
  });

  it('should detect missing trigger error in graph validation', () => {
    const graphWithoutTrigger: WorkflowGraph = {
      id: 'wf_no_trigger',
      name: 'Orphan Action Pipeline',
      nodes: [
        {
          id: 'action_1',
          type: 'action.httpRequest',
          category: 'action',
          name: 'HTTP Call',
          config: { url: 'https://api.example.com' },
        },
      ],
      edges: [],
    };

    const report = validateWorkflowGraph(graphWithoutTrigger);
    expect(report.isValid).toBe(false);
    expect(report.errorsCount).toBeGreaterThanOrEqual(1);
    expect(report.issues.some((i) => i.code === 'MISSING_TRIGGER')).toBe(true);
  });

  it('should detect invalid node configurations in graph validation', () => {
    const graphWithBadConfig: WorkflowGraph = {
      id: 'wf_bad_config',
      name: 'Bad Config Pipeline',
      nodes: [
        {
          id: 'trig',
          type: 'trigger.manual',
          category: 'trigger',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'email_bad',
          type: 'action.sendEmail',
          category: 'action',
          name: 'Email with no recipient or subject',
          config: { to: '', subject: '', content: '' },
        },
      ],
      edges: [{ id: 'e1', source: 'trig', target: 'email_bad' }],
    };

    const report = validateWorkflowGraph(graphWithBadConfig);
    expect(report.isValid).toBe(false);
    expect(report.nodeErrors['email_bad']).toBeDefined();
    expect(report.issues.some((i) => i.code === 'INVALID_CONFIG')).toBe(true);
  });

  it('should detect cycles in graph validation', () => {
    const cyclicGraph: WorkflowGraph = {
      id: 'wf_cyclic_test',
      name: 'Cyclic Graph',
      nodes: [
        {
          id: 'trig',
          type: 'trigger.webhook',
          category: 'trigger',
          name: 'Inbound Webhook',
          config: { httpMethod: 'POST' },
        },
        {
          id: 'node_a',
          type: 'data.transform',
          category: 'data',
          name: 'Transform A',
          config: {},
        },
        {
          id: 'node_b',
          type: 'data.transform',
          category: 'data',
          name: 'Transform B',
          config: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'node_a' },
        { id: 'e2', source: 'node_a', target: 'node_b' },
        { id: 'e3', source: 'node_b', target: 'node_a' }, // Loop back
      ],
    };

    const report = validateWorkflowGraph(cyclicGraph);
    expect(report.isValid).toBe(false);
    expect(report.issues.some((i) => i.code === 'CYCLIC_DEPENDENCY')).toBe(true);
  });

  it('should validate complete valid workflow graph with 0 errors', () => {
    const validGraph: WorkflowGraph = {
      id: 'wf_valid',
      name: 'Lead Routing',
      nodes: [
        {
          id: 'trig',
          type: 'trigger.webhook',
          category: 'trigger',
          name: 'Inbound Webhook',
          config: { httpMethod: 'POST', responseStatusCode: 200 },
        },
        {
          id: 'check',
          type: 'logic.ifElse',
          category: 'logic',
          name: 'Check Lead',
          config: { field: '{{ $trigger.payload.score }}', operator: 'greater_than', value: '50' },
        },
        {
          id: 'send_email',
          type: 'action.sendEmail',
          category: 'action',
          name: 'Send Email',
          config: { to: 'sales@example.com', subject: 'New Lead', content: 'Details...' },
        },
        {
          id: 'nurture',
          type: 'data.transform',
          category: 'data',
          name: 'Nurture',
          config: { outputVariableName: 'nurture' },
        },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'check' },
        { id: 'e2', source: 'check', target: 'send_email', sourceHandle: 'true' },
        { id: 'e3', source: 'check', target: 'nurture', sourceHandle: 'false' },
      ],
    };

    const report = validateWorkflowGraph(validGraph);
    expect(report.isValid).toBe(true);
    expect(report.errorsCount).toBe(0);
  });
});
