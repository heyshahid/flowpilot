import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { WorkflowOptimizer } from '@/core/ai/workflowOptimizer';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:read');

    const body = await req.json();
    const { workflow, provider, model } = body;

    if (!workflow || !Array.isArray(workflow.nodes)) {
      return NextResponse.json(
        { success: false, error: 'A valid "workflow" graph object is required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const result = await WorkflowOptimizer.analyze(workflow, {
      provider,
      model,
      workspaceId: authCtx.workspace.id,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
