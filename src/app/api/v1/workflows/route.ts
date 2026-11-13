import { NextRequest, NextResponse } from 'next/server';
import { workflowStore } from '@/lib/storage/workflowStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    const workflows = workflowStore.getAll(authCtx.workspace.id);
    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      workflows,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:create');
    const body = await req.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Workflow name is required.' },
        { status: 400 }
      );
    }

    const workflow = workflowStore.create({
      name: body.name,
      description: body.description,
      triggerType: body.triggerType,
      workspaceId: authCtx.workspace.id,
      actor: { id: authCtx.user.id, name: authCtx.user.name },
    });

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'workflow.created',
      resourceType: 'workflow',
      resourceId: workflow.id,
      resourceName: workflow.name,
      metadata: { triggerType: body.triggerType },
    });

    return NextResponse.json({ success: true, workflow }, { status: 201 });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
