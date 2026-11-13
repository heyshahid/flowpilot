import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { workspaceLimitsStore } from '@/lib/storage/workspaceLimitsStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await AuthContextManager.enforceWorkspaceIsolation(req, id, 'quota:read');

    const limits = workspaceLimitsStore.getOrCreate(id);

    return NextResponse.json({
      success: true,
      data: limits,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') || msg.includes('Cross-workspace') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'quota:manage');

    const body = await req.json();

    const updated = workspaceLimitsStore.setLimits(
      id,
      {
        maxWorkflows: body.maxWorkflows !== undefined ? body.maxWorkflows : undefined,
        maxMonthlyExecutions:
          body.maxMonthlyExecutions !== undefined ? body.maxMonthlyExecutions : undefined,
        maxConcurrentExecutions:
          body.maxConcurrentExecutions !== undefined
            ? body.maxConcurrentExecutions
            : undefined,
        maxActiveSchedules:
          body.maxActiveSchedules !== undefined ? body.maxActiveSchedules : undefined,
        maxAiTokensMonthly:
          body.maxAiTokensMonthly !== undefined ? body.maxAiTokensMonthly : undefined,
        maxAiCostMonthlyUsd:
          body.maxAiCostMonthlyUsd !== undefined ? body.maxAiCostMonthlyUsd : undefined,
        maxMonthlyIntegrationOps:
          body.maxMonthlyIntegrationOps !== undefined
            ? body.maxMonthlyIntegrationOps
            : undefined,
      },
      authCtx.user.id
    );

    auditLogStore.log({
      workspaceId: id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'quota.updated',
      resourceType: 'quota',
      resourceId: id,
      resourceName: 'Workspace Resource Limits',
      metadata: body,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') || msg.includes('Cross-workspace') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

