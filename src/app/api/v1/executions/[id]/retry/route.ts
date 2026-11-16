import { NextRequest, NextResponse } from 'next/server';
import { executionQueue } from '@/core/execution/queue';
import { executionStore } from '@/lib/storage/executionStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await executionStore.getById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Execution record "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    await AuthContextManager.enforceWorkspaceIsolation(
      req,
      existing.workspaceId || 'ws_default',
      'workflow:execute'
    );

    const execution = await executionQueue.retry(id);

    return NextResponse.json({
      success: true,
      message: `Execution "${id}" successfully re-queued for retry attempt #${execution.retryCount}.`,
      execution,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retry execution.', code: 'EXECUTION_RETRY_ERROR' },
      { status: 400 }
    );
  }
}
