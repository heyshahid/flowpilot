import { NextRequest, NextResponse } from 'next/server';
import { executionStore } from '@/lib/storage/executionStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const execution = await executionStore.getById(id);

    if (!execution) {
      return NextResponse.json(
        { success: false, error: `Execution record "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    await AuthContextManager.enforceWorkspaceIsolation(
      req,
      execution.workspaceId || 'ws_default',
      'workflow:read'
    );

    return NextResponse.json({
      success: true,
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
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const execution = await executionStore.getById(id);

    if (!execution) {
      return NextResponse.json(
        { success: false, error: `Execution record "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const wsId = execution.workspaceId || 'ws_default';
    await AuthContextManager.enforceWorkspaceIsolation(req, wsId, 'workflow:delete');

    const deleted = await executionStore.delete(id, wsId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Execution record "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Execution record "${id}" deleted successfully.`,
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
