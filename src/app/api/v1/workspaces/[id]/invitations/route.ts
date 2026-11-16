import { NextRequest, NextResponse } from 'next/server';
import { invitationStore } from '@/lib/storage/invitationStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await AuthContextManager.enforceWorkspaceIsolation(req, id, 'member:read');

    const invitations = invitationStore.listByWorkspace(id);

    return NextResponse.json({
      success: true,
      invitations,
    });
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(req, id, 'member:invite');

    const body = await req.json();
    const { email, role, expiresInHours } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'A valid email address is required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (!role || !['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Valid role (OWNER, ADMIN, EDITOR, VIEWER) is required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const { invitation, rawToken } = invitationStore.createInvitation({
      workspaceId: id,
      email,
      role,
      actorUserId: authCtx.user.id,
      expiresInHours: expiresInHours || 168,
    });

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const inviteUrl = `${protocol}://${host}/invite/${rawToken}`;

    auditLogStore.log({
      workspaceId: id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'member.invited',
      resourceType: 'invitation',
      resourceId: invitation.id,
      resourceName: email,
      metadata: { role, invitedEmail: email },
    });

    return NextResponse.json(
      {
        success: true,
        invitation,
        inviteUrl,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 400 }
    );
  }
}
