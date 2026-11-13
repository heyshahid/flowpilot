import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { workflowStore } from '@/lib/storage/workflowStore';
import { executionStore } from '@/lib/storage/executionStore';
import { WorkflowExecutionStatus } from '@/core/execution/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    RBACManager.assertPermission(authCtx.role, 'workflow:read');

    const { id } = await params;
    const workflow = workflowStore.getById(id, authCtx.workspace.id);

    // Cross-workspace isolation: return 404 if not found
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow "${id}" not found in active workspace.` },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)), 100);
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const status = (url.searchParams.get('status') as WorkflowExecutionStatus) || undefined;

    const result = await executionStore.list({
      workspaceId: authCtx.workspace.id,
      workflowId: id,
      status,
      offset,
      limit,
    });

    // Redact sensitive execution parameters, secrets or payloads
    const safeItems = result.items.map((e) => ({
      id: e.id,
      workflowId: e.workflowId,
      workflowName: e.workflowName,
      status: e.status,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      durationMs: e.durationMs,
      triggerType: e.trigger?.type || 'manual',
      retryCount: e.retryCount || 0,
      error: typeof e.error === 'string' ? e.error : undefined,
    }));

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      workflowId: id,
      data: {
        items: safeItems,
        total: result.total,
        offset,
        limit,
      },
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Unauthorized')
      ? 401
      : msg.includes('Forbidden')
      ? 403
      : msg.includes('not found')
      ? 404
      : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
