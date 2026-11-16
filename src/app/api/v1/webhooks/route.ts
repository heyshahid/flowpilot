import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/storage/webhookStore';
import { workflowStore } from '@/lib/storage/workflowStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'webhook:read');
    const list = await webhookStore.list(authCtx.workspace.id);
    return NextResponse.json({ success: true, webhooks: list });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'webhook:manage');
    const body = await req.json();
    const { workflowId, name, authType, allowedMethods, rateLimitPerMin } = body;

    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: 'workflowId is required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const workflow = workflowStore.getById(workflowId, authCtx.workspace.id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow "${workflowId}" not found in this workspace.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const created = await webhookStore.create({
      workflowId,
      workflowName: workflow.name,
      name,
      authType,
      allowedMethods,
      rateLimitPerMin,
      workspaceId: authCtx.workspace.id,
    });

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'webhook.created',
      resourceType: 'webhook',
      resourceId: created.id,
      resourceName: created.name,
      metadata: { workflowId, authType },
    });

    return NextResponse.json({ success: true, webhook: created }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
