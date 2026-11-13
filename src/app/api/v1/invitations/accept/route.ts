import { NextRequest, NextResponse } from 'next/server';
import { invitationStore } from '@/lib/storage/invitationStore';
import { userStore } from '@/lib/storage/userStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, userId, email, name } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invitation token is required.' },
        { status: 400 }
      );
    }

    const invitation = invitationStore.getByToken(token);
    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid or non-existent invitation token.' },
        { status: 404 }
      );
    }

    // Determine target user
    let targetUser = userId ? userStore.getById(userId) : null;
    if (!targetUser && email) {
      targetUser = userStore.getByEmail(email);
    }
    if (!targetUser) {
      // Auto-create user profile if new signup accepts invite
      targetUser = userStore.create({
        name: name || invitation.email.split('@')[0],
        email: invitation.email,
      });
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
      message: `Successfully joined workspace!`,
      workspaceId: result.workspaceId,
      role: result.role,
      user: targetUser,
    });
  } catch (error) {
    const msg = (error as Error).message;
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
