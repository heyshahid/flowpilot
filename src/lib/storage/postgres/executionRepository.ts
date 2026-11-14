import { PrismaClient } from '@prisma/client';
import {
  ExecutionFilter,
  StepExecutionRecord,
  WorkflowExecutionRecord,
  WorkflowExecutionStatus,
} from '../../../core/execution/types';
import { getPrismaClient } from './db';

export interface ExecutionRepository {
  create(record: WorkflowExecutionRecord): Promise<WorkflowExecutionRecord>;
  getById(id: string, workspaceId?: string): Promise<WorkflowExecutionRecord | null>;
  update(id: string, updates: Partial<WorkflowExecutionRecord>): Promise<WorkflowExecutionRecord>;
  list(filter?: ExecutionFilter): Promise<{ items: WorkflowExecutionRecord[]; total: number }>;
  delete(id: string): Promise<boolean>;
}

export class PostgresExecutionRepository implements ExecutionRepository {
  private client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client || getPrismaClient();
  }

  public async create(record: WorkflowExecutionRecord): Promise<WorkflowExecutionRecord> {
    const workspaceId = record.workspaceId || 'ws_default';
    const now = new Date();

    const created = await (this.client as any).execution.create({
      data: {
        id: record.id,
        workspaceId,
        workflowId: record.workflowId,
        workflowName: record.workflowName,
        status: record.status,
        triggerType: record.trigger.type,
        triggerData: record.trigger as any,
        startedAt: new Date(record.startedAt),
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
        durationMs: record.durationMs || null,
        retryCount: record.retryCount || 0,
        maxRetries: record.maxRetries || 3,
        errorMessage: record.error || null,
        stateHistory: record.stateHistory as any,
        createdAt: record.createdAt ? new Date(record.createdAt) : now,
        updatedAt: record.updatedAt ? new Date(record.updatedAt) : now,
        steps: {
          create: (record.traces || []).map((t) => ({
            id: `${record.id}_${t.nodeId}_${t.attempts || 1}`,
            nodeId: t.nodeId,
            nodeType: t.nodeType,
            nodeName: t.nodeName,
            status: t.status,
            startedAt: new Date(t.startedAt || now.toISOString()),
            completedAt: t.completedAt ? new Date(t.completedAt) : null,
            durationMs: t.durationMs || null,
            attempts: t.attempts || 1,
            retryCount: t.retryCount || 0,
            input: (t.input as any) || null,
            output: (t.output as any) || null,
            error: t.error || null,
          })),
        },
      },
      include: {
        steps: true,
      },
    });

    return this.mapToRecord(created);
  }

  public async getById(id: string, workspaceId?: string): Promise<WorkflowExecutionRecord | null> {
    const where: any = { id };
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const row = await (this.client as any).execution.findFirst({
      where,
      include: { steps: true },
    });

    if (!row) return null;
    return this.mapToRecord(row);
  }

  public async update(
    id: string,
    updates: Partial<WorkflowExecutionRecord>
  ): Promise<WorkflowExecutionRecord> {
    const data: any = {
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) data.status = updates.status;
    if (updates.completedAt !== undefined) data.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
    if (updates.durationMs !== undefined) data.durationMs = updates.durationMs;
    if (updates.retryCount !== undefined) data.retryCount = updates.retryCount;
    if (updates.error !== undefined) data.errorMessage = updates.error;
    if (updates.stateHistory !== undefined) data.stateHistory = updates.stateHistory as any;

    const updated = await (this.client as any).execution.update({
      where: { id },
      data,
      include: { steps: true },
    });

    return this.mapToRecord(updated);
  }

  public async list(filter?: ExecutionFilter): Promise<{
    items: WorkflowExecutionRecord[];
    total: number;
  }> {
    const where: any = {};
    if (filter?.workspaceId) where.workspaceId = filter.workspaceId;
    if (filter?.workflowId) where.workflowId = filter.workflowId;
    if (filter?.status) where.status = filter.status;
    if (filter?.search) {
      where.OR = [
        { id: { contains: filter.search, mode: 'insensitive' } },
        { workflowName: { contains: filter.search, mode: 'insensitive' } },
        { triggerType: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const total = await (this.client as any).execution.count({ where });
    const rows = await (this.client as any).execution.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: filter?.offset || 0,
      take: filter?.limit || 50,
      include: { steps: true },
    });

    return {
      items: rows.map((r: any) => this.mapToRecord(r)),
      total,
    };
  }

  public async delete(id: string): Promise<boolean> {
    try {
      await (this.client as any).execution.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  private mapToRecord(row: any): WorkflowExecutionRecord {
    const traces: StepExecutionRecord[] = (row.steps || []).map((s: any) => ({
      nodeId: s.nodeId,
      nodeType: s.nodeType,
      nodeName: s.nodeName,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt ? s.completedAt.toISOString() : undefined,
      durationMs: s.durationMs || 0,
      attempts: s.attempts,
      retryCount: s.retryCount,
      input: s.input || {},
      output: s.output || {},
      error: s.error || undefined,
    }));

    return {
      id: row.id,
      workflowId: row.workflowId,
      workflowName: row.workflowName,
      status: row.status as WorkflowExecutionStatus,
      workspaceId: row.workspaceId,
      trigger: row.triggerData as any,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
      durationMs: row.durationMs || 0,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      error: row.errorMessage || undefined,
      stateHistory: row.stateHistory as any,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      traces,
    };
  }
}
