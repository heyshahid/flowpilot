import { NextRequest, NextResponse } from 'next/server';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { workflowStore } from '@/lib/storage/workflowStore';
import { executionStore } from '@/lib/storage/executionStore';
import { invitationStore } from '@/lib/storage/invitationStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await AuthContextManager.enforceWorkspaceIsolation(req, id, 'workspace:read');

    const recentLogs = auditLogStore.getRecentActivity(id, 15);
    const workflows = workflowStore.getAll(id).slice(0, 5);
    const { items: executions } = await executionStore.list({ workspaceId: id, limit: 5 });
    const pendingInvitations = invitationStore.listByWorkspace(id).filter((i) => i.status === 'pending');

    return NextResponse.json({
      success: true,
      activity: {
        recentLogs,
        recentlyModifiedWorkflows: workflows,
        recentExecutions: executions,
        pendingInvitationsCount: pendingInvitations.length,
      },
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') || msg.includes('Cross-workspace') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
