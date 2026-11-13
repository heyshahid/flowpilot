import { NextRequest, NextResponse } from 'next/server';
import { workspaceStore } from '@/lib/storage/workspaceStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'workspace:read');

    const ws = workspaceStore.getById(id);
    if (!ws) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      workspace: ws,
      role: authCtx.role,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Cross-workspace') || msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'workspace:update');

    const body = await req.json();
    const updated = workspaceStore.update(id, body);

    auditLogStore.log({
      workspaceId: id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'workspace.updated',
      resourceType: 'workspace',
      resourceId: id,
      resourceName: updated.name,
      metadata: body,
    });

    return NextResponse.json({
      success: true,
      workspace: updated,
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
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'workspace:delete');

    const archived = workspaceStore.archive(id);

    auditLogStore.log({
      workspaceId: id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'workspace.archived',
      resourceType: 'workspace',
      resourceId: id,
      resourceName: archived.name,
    });

    return NextResponse.json({
      success: true,
      message: `Workspace "${archived.name}" archived successfully.`,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
