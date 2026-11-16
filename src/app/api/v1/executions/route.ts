import { NextRequest, NextResponse } from 'next/server';
import { executionStore } from '@/lib/storage/executionStore';
import { WorkflowExecutionStatus } from '@/core/execution/types';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:read');
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
