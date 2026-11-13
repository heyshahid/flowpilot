import { NextRequest, NextResponse } from 'next/server';
import { workspaceStore } from '@/lib/storage/workspaceStore';
import { membershipStore } from '@/lib/storage/membershipStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    const userMemberships = membershipStore.listByUser(authCtx.user.id);
    const memberWsIds = new Set(userMemberships.map((m) => m.workspaceId));

    // Also include owned workspaces
    const allWorkspaces = workspaceStore.list();
    const visible = allWorkspaces.filter(
      (w) => w.ownerId === authCtx.user.id || memberWsIds.has(w.id)
    );

    return NextResponse.json({
      success: true,
      activeWorkspaceId: authCtx.workspace.id,
      workspaces: visible,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    const body = await req.json();

    const { name, description, plan, settings } = body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Workspace name is required.' },
        { status: 400 }
      );
    }

    const newWs = workspaceStore.create({
      name: name.trim(),
      description,
      ownerId: authCtx.user.id,
      plan: plan || 'starter',
      settings,
    });

    // Add owner membership
    membershipStore.addMember({
      workspaceId: newWs.id,
      userId: authCtx.user.id,
      role: 'OWNER',
      status: 'active',
    });

    // Audit log
    auditLogStore.log({
      workspaceId: newWs.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'workspace.created',
      resourceType: 'workspace',
      resourceId: newWs.id,
      resourceName: newWs.name,
      metadata: { plan: newWs.plan },
    });

    return NextResponse.json(
      { success: true, workspace: newWs },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
