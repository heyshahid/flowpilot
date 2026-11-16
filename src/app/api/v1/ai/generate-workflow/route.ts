import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { WorkflowGenerator } from '@/core/ai/workflowGenerator';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:create');

    const body = await req.json();
    const { prompt, provider, model } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'A natural language "prompt" is required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const proposal = await WorkflowGenerator.generate(prompt.trim(), {
      provider,
      model,
      workspaceId: authCtx.workspace.id,
    });

    return NextResponse.json({
      success: true,
      data: proposal,
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
