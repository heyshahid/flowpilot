import { NextRequest, NextResponse } from 'next/server';
import { invitationStore } from '@/lib/storage/invitationStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError, ForbiddenError } from '@/core/auth/types';

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative session authentication and pending-verification enforcement
    const authCtx = await AuthContextManager.resolve(req);
    const targetUser = authCtx.user;

    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invitation token is required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const invitation = invitationStore.getByToken(token);
    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid or non-existent invitation token.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify invitation email recipient matches authenticated user
    if (
      invitation.email &&
      targetUser.email &&
      invitation.email.toLowerCase() !== targetUser.email.toLowerCase()
    ) {
      throw new ForbiddenError(
        `This invitation was addressed to "${invitation.email}", but you are signed in as "${targetUser.email}".`
      );
    }

    const result = invitationStore.acceptInvitation(token, targetUser.id);

    // Audit log
    auditLogStore.log({
      workspaceId: result.workspaceId,
      actorId: targetUser.id,
      actorName: targetUser.name,
      actorEmail: targetUser.email,
      action: 'member.accepted',
      resourceType: 'member',
      resourceId: targetUser.id,
      resourceName: targetUser.name,
      metadata: { role: result.role, invitationId: invitation.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Successfully joined workspace!',
      workspaceId: result.workspaceId,
      role: result.role,
      user: targetUser,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to accept invitation.', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }
}
