import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { alertRuleStore } from '@/lib/storage/alertRuleStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:read');

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;
    const enabledParam = searchParams.get('enabled');
    const enabled = enabledParam !== null ? enabledParam === 'true' : undefined;

    const rules = alertRuleStore.list(authCtx.workspace.id, {
      category,
      enabled,
    });

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:manage');
    const body = await req.json();

    if (!body.name || !body.category || !body.metric || !body.operator || body.threshold === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: name, category, metric, operator, threshold',
        },
        { status: 400 }
      );
    }

    const rule = alertRuleStore.create({
      workspaceId: authCtx.workspace.id,
      name: body.name,
      description: body.description || '',
      category: body.category,
      metric: body.metric,
      operator: body.operator,
      threshold: Number(body.threshold),
      evaluationWindowMinutes: Number(body.evaluationWindowMinutes) || 15,
      cooldownMinutes: Number(body.cooldownMinutes) || 15,
      severity: body.severity || 'WARNING',
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      targetWorkflowId: body.targetWorkflowId || undefined,
      channels: Array.isArray(body.channels) && body.channels.length > 0 ? body.channels : ['in_app'],
      createdBy: authCtx.user.id,
    });

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'alert.rule_created',
      resourceType: 'alert',
      resourceId: rule.id,
      resourceName: rule.name,
      metadata: { category: rule.category, metric: rule.metric, threshold: rule.threshold },
    });

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

