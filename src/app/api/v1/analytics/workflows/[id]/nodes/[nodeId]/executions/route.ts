import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { workflowStore } from '@/lib/storage/workflowStore';
import { executionStore } from '@/lib/storage/executionStore';
import { NodeExecutionTraceDetail } from '@/core/analytics/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; nodeId: string }> }
) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    RBACManager.assertPermission(authCtx.role, 'workflow:read');

    const { id, nodeId } = await params;
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

    // Fetch executions for this workflow
    const execResult = await executionStore.list({
      workspaceId: authCtx.workspace.id,
      workflowId: id,
      limit: 1000,
    });

    // Extract matching node traces across all executions
    const matchingTraces: NodeExecutionTraceDetail[] = [];
    for (const exec of execResult.items) {
      if (!exec.traces) continue;
      for (const t of exec.traces) {
        if (t.nodeId === nodeId) {
          matchingTraces.push({
            executionId: exec.id,
            nodeId: t.nodeId,
            nodeName: t.nodeName || t.nodeId,
            nodeType: t.nodeType,
            status: t.status,
            startedAt: t.startedAt || exec.startedAt,
            completedAt: t.completedAt,
            durationMs: t.durationMs,
            attempts: t.attempts || 1,
            retryCount: t.retryCount || 0,
            error: t.error,
          });
        }
      }
    }

    const total = matchingTraces.length;
    const paginatedItems = matchingTraces.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      workflowId: id,
      nodeId,
      data: {
        items: paginatedItems,
        total,
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

