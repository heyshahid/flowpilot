import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { workflowStore } from '@/lib/storage/workflowStore';
import { versionStore } from '@/lib/storage/versionStore';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const workflow = workflowStore.getById(id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(
      req,
      workflow.workspaceId || 'ws_default',
      'workflow:update'
    );

    const restoredBy = authCtx.user.email || authCtx.user.name || 'user';
    const result = await versionStore.restoreVersion(id, versionId, restoredBy);

    return NextResponse.json({
      success: true,
      message: `Workflow "${id}" restored successfully to version ${result.restoredVersion.versionNumber}.`,
      workflow: result.workflow,
      restoredVersion: result.restoredVersion,
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
