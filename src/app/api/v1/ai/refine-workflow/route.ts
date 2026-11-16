import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { GraphRefiner } from '@/core/ai/graphRefiner';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:update');

    const body = await req.json();
    const { workflow, prompt, provider, model } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A refinement "prompt" is required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (!workflow || !Array.isArray(workflow.nodes)) {
      return NextResponse.json(
        { success: false, error: 'A valid "workflow" graph object is required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const proposal = await GraphRefiner.refine(workflow, prompt.trim(), {
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
