import { NextRequest, NextResponse } from 'next/server';
import { executionStore } from '@/lib/storage/executionStore';
import { WorkflowExecutionStatus } from '@/core/execution/types';
import { AuthContextManager } from '@/core/auth/authContext';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    const { searchParams } = new URL(req.url);
    const workflowId = searchParams.get('workflowId') || undefined;
    const statusParam = searchParams.get('status') as WorkflowExecutionStatus | null;
    const search = searchParams.get('search') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    const result = await executionStore.list({
      workspaceId: authCtx.workspace.id,
      workflowId,
      status: statusParam || undefined,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      executions: result.items,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
