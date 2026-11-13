import { NextRequest, NextResponse } from 'next/server';
import { invitationStore } from '@/lib/storage/invitationStore';
import { workspaceStore } from '@/lib/storage/workspaceStore';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const invitation = invitationStore.getByToken(token);

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invitation not found or invalid token.' },
        { status: 404 }
      );
    }

    const ws = workspaceStore.getById(invitation.workspaceId);

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        workspaceId: invitation.workspaceId,
        workspaceName: ws?.name || invitation.workspaceName || 'FlowPilot Workspace',
        workspaceDescription: ws?.description,
        invitedByName: invitation.invitedByName,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
