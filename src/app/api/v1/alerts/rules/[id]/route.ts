import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { alertRuleStore } from '@/lib/storage/alertRuleStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:read');

    const rule = alertRuleStore.getById(id, authCtx.workspace.id);
    if (!rule) {
      return NextResponse.json(
        { success: false, error: 'Alert rule not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:manage');

    const rule = alertRuleStore.getById(id, authCtx.workspace.id);
    if (!rule) {
      return NextResponse.json(
        { success: false, error: 'Alert rule not found' },
        { status: 404 }
      );
    }

    const body = await req.json();

    const updated = alertRuleStore.update(
      id,
      {
        name: body.name !== undefined ? body.name : undefined,
        description: body.description !== undefined ? body.description : undefined,
        category: body.category !== undefined ? body.category : undefined,
        metric: body.metric !== undefined ? body.metric : undefined,
        operator: body.operator !== undefined ? body.operator : undefined,
        threshold: body.threshold !== undefined ? Number(body.threshold) : undefined,
        evaluationWindowMinutes:
          body.evaluationWindowMinutes !== undefined
            ? Number(body.evaluationWindowMinutes)
            : undefined,
        cooldownMinutes:
          body.cooldownMinutes !== undefined ? Number(body.cooldownMinutes) : undefined,
        severity: body.severity !== undefined ? body.severity : undefined,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
        targetWorkflowId:
          body.targetWorkflowId !== undefined ? body.targetWorkflowId : undefined,
        channels: Array.isArray(body.channels) ? body.channels : undefined,
      },
      authCtx.workspace.id
    );

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'alert.rule_updated',
      resourceType: 'alert',
      resourceId: id,
      resourceName: updated?.name || rule.name,
      metadata: body,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:manage');

    const rule = alertRuleStore.getById(id, authCtx.workspace.id);
    if (!rule) {
      return NextResponse.json(
        { success: false, error: 'Alert rule not found' },
        { status: 404 }
      );
    }

    const deleted = alertRuleStore.delete(id, authCtx.workspace.id);

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'alert.rule_deleted',
      resourceType: 'alert',
      resourceId: id,
      resourceName: rule.name,
    });

    return NextResponse.json({
      success: deleted,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

