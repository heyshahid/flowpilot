import { PrismaClient } from '@prisma/client';
import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../../../core/types/workflow';
import { WorkflowRecord, WorkflowStatus } from '../workflowStore';
import { getPrismaClient } from './db';

export interface WorkflowRepository {
  getById(id: string, workspaceId?: string): Promise<WorkflowRecord | null>;
  list(workspaceId: string, filter?: { status?: string; search?: string }): Promise<WorkflowRecord[]>;
  save(record: WorkflowRecord): Promise<WorkflowRecord>;
  delete(id: string, workspaceId?: string): Promise<boolean>;
  getDashboardStats(workspaceId?: string): Promise<{
    totalWorkflows: number;
    activeWorkflows: number;
    successfulRuns: number;
    failedRuns: number;
  }>;
}

export class PostgresWorkflowRepository implements WorkflowRepository {
  private client: PrismaClient;

  constructor(client?: PrismaClient) {
    this.client = client || getPrismaClient();
  }

  public async getById(id: string, workspaceId?: string): Promise<WorkflowRecord | null> {
    const where: any = { id };
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const row = await (this.client as any).workflow.findFirst({ where });
    if (!row) return null;

    return this.mapToRecord(row);
  }

  public async list(workspaceId: string, filter?: { status?: string; search?: string }): Promise<WorkflowRecord[]> {
    const where: any = { workspaceId };
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const rows = await (this.client as any).workflow.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((r: any) => this.mapToRecord(r));
  }

  public async save(record: WorkflowRecord): Promise<WorkflowRecord> {
    const workspaceId = record.workspaceId || 'ws_default';
    const now = new Date();

    const data: any = {
      name: record.name,
      description: record.description || null,
      status: (record.status as any) || 'draft',
      version: record.version || 1,
      nodes: record.nodes as any,
      edges: record.edges as any,
      viewport: (record as any).viewport || null,
      executionCount: record.executionCount || 0,
      successCount: record.successCount || 0,
      failureCount: record.failureCount || 0,
      lastExecutedAt: record.lastExecutedAt ? new Date(record.lastExecutedAt) : null,
      createdBy: record.createdBy || null,
      lastModifiedBy: record.lastModifiedBy || null,
      updatedAt: now,
    };

    const row = await (this.client as any).workflow.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        workspaceId,
        createdAt: record.createdAt ? new Date(record.createdAt) : now,
        ...data,
      },
      update: data,
    });

    return this.mapToRecord(row);
  }

  public async delete(id: string, workspaceId?: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    if (workspaceId && (existing.workspaceId || 'ws_default') !== workspaceId) {
      throw new Error(`Cross-workspace delete denied: Workflow belongs to "${existing.workspaceId}".`);
    }

    await (this.client as any).workflow.delete({
      where: { id },
    });

    return true;
  }

  public async getDashboardStats(workspaceId?: string) {
    const where: any = workspaceId ? { workspaceId } : {};
    const rows = await (this.client as any).workflow.findMany({
      where,
      select: {
        status: true,
        successCount: true,
        failureCount: true,
      },
    });

    const totalWorkflows = rows.length;
    const activeWorkflows = rows.filter((w: any) => w.status === 'active').length;
    const successfulRuns = rows.reduce((acc: number, curr: any) => acc + (curr.successCount || 0), 0);
    const failedRuns = rows.reduce((acc: number, curr: any) => acc + (curr.failureCount || 0), 0);

    return {
      totalWorkflows,
      activeWorkflows,
      successfulRuns,
      failedRuns,
    };
  }

  private mapToRecord(row: any): WorkflowRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      status: row.status as WorkflowStatus,
      workspaceId: row.workspaceId,
      version: row.version,
      nodes: row.nodes as WorkflowNode[],
      edges: row.edges as WorkflowEdge[],
      executionCount: row.executionCount,
      successCount: row.successCount,
      failureCount: row.failureCount,
      lastExecutedAt: row.lastExecutedAt ? row.lastExecutedAt.toISOString() : undefined,
      createdBy: row.createdBy || undefined,
      lastModifiedBy: row.lastModifiedBy || undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
