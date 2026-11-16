import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { workflowStore } from '@/lib/storage/workflowStore';
import { executionQueue } from '@/core/execution/queue';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workflow = workflowStore.getById(id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Authoritative tenant isolation & execution permission enforcement
    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(
      req,
      workflow.workspaceId || 'ws_default',
      'workflow:execute'
    );

    let payload: Record<string, unknown> = {};
    let waitForCompletion = false;

    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        if ('payload' in body && typeof body.payload === 'object' && body.payload !== null) {
          payload = body.payload as Record<string, unknown>;
        } else {
          // If body is passed directly as payload, remove wait/sync control keys
          const { wait, sync, ...rest } = body as Record<string, unknown>;
          payload = rest;
        }
        waitForCompletion = Boolean((body as Record<string, unknown>).wait || (body as Record<string, unknown>).sync);
      }
    } catch {
      // Empty payload is permitted
    }

    // Check query params for ?wait=true
    if (req.nextUrl.searchParams.get('wait') === 'true' || req.nextUrl.searchParams.get('sync') === 'true') {
      waitForCompletion = true;
    }

    // Enqueue background execution job with tenant attribution
    const execution = await executionQueue.enqueue(id, payload, { workspaceId: authCtx.workspace.id });
    if (execution && !execution.workspaceId) {
      execution.workspaceId = authCtx.workspace.id;
    }

    if (waitForCompletion) {
      const completedRecord = await executionQueue.waitForExecution(execution.id, 15000);
      return NextResponse.json({
        success: completedRecord.status === 'COMPLETED',
        executionId: completedRecord.id,
        status: completedRecord.status,
        execution: completedRecord,
      });
    }

    return NextResponse.json(
      {
        success: true,
        executionId: execution.id,
        status: execution.status,
        message: 'Workflow execution queued successfully.',
        execution,
      },
      { status: 202 }
    );
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
