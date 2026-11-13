import { NextRequest, NextResponse } from 'next/server';
import { membershipStore } from '@/lib/storage/membershipStore';
import { userStore } from '@/lib/storage/userStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id);
    const body = await req.json();

    const targetUser = userStore.getById(userId);

    // 1. Role change
    if (body.role) {
      const updatedMem = membershipStore.updateRole(id, userId, body.role, authCtx.user.id);
      auditLogStore.log({
        workspaceId: id,
        actorId: authCtx.user.id,
        actorName: authCtx.user.name,
        actorEmail: authCtx.user.email,
        action: 'member.role_changed',
        resourceType: 'member',
        resourceId: userId,
        resourceName: targetUser?.name || userId,
        metadata: { newRole: body.role },
      });
      return NextResponse.json({ success: true, membership: updatedMem });
    }

    // 2. Status change (suspend/activate)
    if (body.status) {
      const updatedMem = membershipStore.updateStatus(id, userId, body.status, authCtx.user.id);
      auditLogStore.log({
        workspaceId: id,
        actorId: authCtx.user.id,
        actorName: authCtx.user.name,
        actorEmail: authCtx.user.email,
        action: body.status === 'suspended' ? 'member.suspended' : 'member.activated',
        resourceType: 'member',
        resourceId: userId,
        resourceName: targetUser?.name || userId,
        metadata: { status: body.status },
      });
      return NextResponse.json({ success: true, membership: updatedMem });
    }

    return NextResponse.json({ success: false, error: 'No update parameters provided.' }, { status: 400 });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Unauthorized') || msg.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'member:remove');

    const targetUser = userStore.getById(userId);
    membershipStore.removeMember(id, userId, authCtx.user.id);

    auditLogStore.log({
      workspaceId: id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'member.removed',
      resourceType: 'member',
      resourceId: userId,
      resourceName: targetUser?.name || userId,
      metadata: { removedUserId: userId },
    });

    return NextResponse.json({
      success: true,
      message: `Member ${targetUser?.name || userId} was removed from the workspace.`,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') || msg.includes('Cannot remove') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
