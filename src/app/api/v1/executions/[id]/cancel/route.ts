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
    const record = await executionStore.getById(id);
    if (!record) {
      return NextResponse.json(
        { success: false, error: `Execution record "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    await AuthContextManager.enforceWorkspaceIsolation(
      req,
      record.workspaceId || 'ws_default',
      'workflow:execute'
    );

    const cancelled = await executionQueue.cancel(id);
    const updatedRecord = await executionStore.getById(id);

    return NextResponse.json({
      success: true,
      cancelled,
      message: cancelled
        ? `Execution "${id}" successfully cancelled.`
        : `Execution "${id}" could not be cancelled (already in terminal state).`,
      execution: updatedRecord || record,
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
