import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { ErrorAssistant } from '@/core/ai/errorAssistant';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:read');

    const body = await req.json();
    const { executionId, failedNodeId, provider, model } = body;

    if (!executionId) {
      return NextResponse.json(
        { success: false, error: 'An "executionId" is required for error diagnosis.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const diagnosis = await ErrorAssistant.diagnose(executionId, failedNodeId, {
      provider,
      model,
      workspaceId: authCtx.workspace.id,
    });

    return NextResponse.json({
      success: true,
      data: diagnosis,
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
