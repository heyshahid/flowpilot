import { NextRequest, NextResponse } from 'next/server';
import { workflowStore } from '@/lib/storage/workflowStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.resolve(req);

    const workflow = workflowStore.getById(id, authCtx.workspace.id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found in this workspace.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, workflow });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:update');

    const body = await req.json();
    const existing = workflowStore.getById(id, authCtx.workspace.id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found in this workspace.' },
        { status: 404 }
      );
    }

    const { expectedVersion, ...workflowData } = body;

    const updated = workflowStore.save(
      {
        ...existing,
        ...workflowData,
        id, // enforce immutable id
      },
      {
        expectedVersion: typeof expectedVersion === 'number' ? expectedVersion : undefined,
        actor: { id: authCtx.user.id, name: authCtx.user.name },
        workspaceId: authCtx.workspace.id,
      }
    );

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'workflow.updated',
      resourceType: 'workflow',
      resourceId: id,
      resourceName: updated.name,
      metadata: { version: updated.version },
    });

    return NextResponse.json({ success: true, workflow: updated });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes('Conflict:')) {
      return NextResponse.json(
        { success: false, error: msg, conflict: true },
        { status: 409 }
      );
    }
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
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:delete');

    const existing = workflowStore.getById(id, authCtx.workspace.id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found in this workspace.' },
        { status: 404 }
      );
    }

    workflowStore.delete(id, authCtx.workspace.id);

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'workflow.deleted',
      resourceType: 'workflow',
      resourceId: id,
      resourceName: existing.name,
    });

    return NextResponse.json({ success: true, message: 'Workflow deleted successfully.' });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
