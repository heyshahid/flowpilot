import { NextRequest, NextResponse } from 'next/server';
import { invitationStore } from '@/lib/storage/invitationStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const { id, invitationId } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'member:remove');

    const revoked = invitationStore.revokeInvitation(invitationId, authCtx.user.id);

    auditLogStore.log({
      workspaceId: id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'invitation.revoked',
      resourceType: 'invitation',
      resourceId: invitationId,
      resourceName: revoked.email,
    });

    return NextResponse.json({
      success: true,
      message: `Invitation for ${revoked.email} has been revoked.`,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const { id, invitationId } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'member:invite');

    const { invitation, rawToken } = invitationStore.resendInvitation(invitationId, authCtx.user.id);

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const inviteUrl = `${protocol}://${host}/invite/${rawToken}`;

    auditLogStore.log({
      workspaceId: id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'invitation.resent',
      resourceType: 'invitation',
      resourceId: invitationId,
      resourceName: invitation.email,
    });

    return NextResponse.json({
      success: true,
      invitation,
      inviteUrl,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
