import { NextRequest, NextResponse } from 'next/server';
import { workspaceStore } from '@/lib/storage/workspaceStore';
import { membershipStore } from '@/lib/storage/membershipStore';
import { userStore } from '@/lib/storage/userStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(
      req,
      id,
      'workspace:transfer_ownership'
    );

    const body = await req.json();
    const { newOwnerId } = body;

    if (!newOwnerId || typeof newOwnerId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Target newOwnerId is required.' },
        { status: 400 }
      );
    }

    const targetUser = userStore.getById(newOwnerId);
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Target user does not exist.' },
        { status: 404 }
      );
    }

    const targetMembership = membershipStore.getMembership(id, newOwnerId);
    if (!targetMembership || targetMembership.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Target user must be an active member of this workspace.' },
        { status: 400 }
      );
    }

    // 1. Transfer workspace ownership record
    const updatedWs = workspaceStore.transferOwnership(id, newOwnerId, authCtx.user.id);

    // 2. Update membership roles: new owner becomes OWNER, previous owner becomes ADMIN
    membershipStore.updateRole(id, newOwnerId, 'OWNER', authCtx.user.id);
    membershipStore.updateRole(id, authCtx.user.id, 'ADMIN', newOwnerId);

    // 3. Audit log
    auditLogStore.log({
      workspaceId: id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'workspace.ownership_transferred',
      resourceType: 'workspace',
      resourceId: id,
      resourceName: updatedWs.name,
      metadata: {
        previousOwnerId: authCtx.user.id,
        newOwnerId: targetUser.id,
        newOwnerEmail: targetUser.email,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Ownership of workspace "${updatedWs.name}" transferred to ${targetUser.name}.`,
      workspace: updatedWs,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Unauthorized') || msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
