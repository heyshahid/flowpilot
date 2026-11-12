import { describe, expect, it } from 'vitest';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { FlowPilotExecutor } from '../src/core/engine/executor';

describe('FlowPilot Phase 2 Store & UI Integration Tests', () => {
  it('should retrieve seeded workflows on initial load', () => {
    const list = workflowStore.getAll();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((w) => w.id === 'wf_lead_qualification')).toBe(true);
  });

  it('should create a new workflow with valid Phase 1 schema', () => {
    const created = workflowStore.create({
      name: 'Customer Retention Pulse',
      description: 'Sends automated check-in after 30 days',
      triggerType: 'trigger.manual',
    });

    expect(created.id).toMatch(/^wf_/);
    expect(created.name).toBe('Customer Retention Pulse');
    expect(created.status).toBe('draft');
    expect(created.nodes).toHaveLength(1);
    expect(created.nodes[0].type).toBe('trigger.manual');

    const found = workflowStore.getById(created.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Customer Retention Pulse');
  });

  it('should rename a workflow cleanly', () => {
    const created = workflowStore.create({ name: 'Old Name' });
    const renamed = workflowStore.rename(created.id, 'Renamed Pipeline');

    expect(renamed?.name).toBe('Renamed Pipeline');
    expect(workflowStore.getById(created.id)?.name).toBe('Renamed Pipeline');
  });

  it('should duplicate a workflow and preserve nodes/edges with copy suffix', () => {
    const original = workflowStore.getById('wf_lead_qualification');
    expect(original).not.toBeNull();

    const copy = workflowStore.duplicate(original!.id);
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(original!.id);
    expect(copy?.name).toBe(`${original!.name} (Copy)`);
    expect(copy?.nodes).toHaveLength(original!.nodes.length);
    expect(copy?.edges).toHaveLength(original!.edges.length);
  });

  it('should toggle workflow status between active and draft', () => {
    const created = workflowStore.create({ name: 'Toggle Test' });
    expect(created.status).toBe('draft');

    const activated = workflowStore.toggleStatus(created.id);
    expect(activated?.status).toBe('active');

    const drafted = workflowStore.toggleStatus(created.id);
    expect(drafted?.status).toBe('draft');
  });

  it('should delete a workflow', () => {
    const created = workflowStore.create({ name: 'Delete Me' });
    expect(workflowStore.getById(created.id)).not.toBeNull();

    const deleted = workflowStore.delete(created.id);
    expect(deleted).toBe(true);
    expect(workflowStore.getById(created.id)).toBeNull();
  });

  it('should compute real-time dashboard statistics from stored workflows', () => {
    const stats = workflowStore.getDashboardStats();
    expect(stats.totalWorkflows).toBeGreaterThanOrEqual(1);
    expect(typeof stats.activeWorkflows).toBe('number');
    expect(typeof stats.successfulRuns).toBe('number');
  });

  it('should execute a created workflow graph using Phase 1 FlowPilotExecutor', async () => {
    // 1. Create a workflow
    const wf = workflowStore.create({
      name: 'E2E Executor Verification',
      triggerType: 'trigger.webhook',
    });

    // 2. Add action node and edge
    wf.nodes.push({
      id: 'node_notify',
      type: 'data.transform',
      category: 'data',
      name: 'Format Payload',
      config: { status: 'OK', user: '{{ $trigger.payload.user }}' },
      position: { x: 400, y: 150 },
    });
    wf.edges.push({
      id: 'e1',
      source: wf.nodes[0].id,
      target: 'node_notify',
    });

    workflowStore.save(wf);

    // 3. Execute with real engine
    const executor = new FlowPilotExecutor();
    const result = await executor.execute(wf, { user: 'Shahid' });

    expect(result.status).toBe('completed');
    expect(result.traces).toHaveLength(2);
    expect(result.traces[0].status).toBe('completed');
    expect(result.traces[1].status).toBe('completed');
    expect(result.traces[1].input.user).toBe('Shahid');
  });
});

