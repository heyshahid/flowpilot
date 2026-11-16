import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { aiUsageStore } from '@/lib/storage/aiUsageStore';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'usage:read');
    const summary = aiUsageStore.getSummary(authCtx.workspace.id);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: summary,
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
