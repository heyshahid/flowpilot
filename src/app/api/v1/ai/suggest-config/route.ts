import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { SmartConfigSuggester } from '@/core/ai/smartConfigSuggester';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:read');

    const body = await req.json();
    const { nodeType, userIntent, existingConfig, provider, model } = body;

    if (!nodeType || !userIntent) {
      return NextResponse.json(
        { success: false, error: '"nodeType" and "userIntent" are required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const result = await SmartConfigSuggester.suggest(
      nodeType,
      userIntent,
      existingConfig || {},
      { provider, model, workspaceId: authCtx.workspace.id }
    );

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
