import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { membershipStore } from '@/lib/storage/membershipStore';
import { workspaceStore } from '@/lib/storage/workspaceStore';
import { userStore } from '@/lib/storage/userStore';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    const memberships = membershipStore.listByUser(authCtx.user.id);
    const memberWsIds = new Set(memberships.map((m) => m.workspaceId));

    const allWorkspaces = workspaceStore.list();
    const availableWorkspaces = allWorkspaces.filter(
      (w) => w.ownerId === authCtx.user.id || memberWsIds.has(w.id)
    );

    const allUsers = userStore.list();

    return NextResponse.json({
      success: true,
      user: authCtx.user,
      workspace: authCtx.workspace,
      membership: authCtx.membership,
      role: authCtx.role,
      availableWorkspaces,
      allUsers, // Used for quick-switcher/impersonation in development testing
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
