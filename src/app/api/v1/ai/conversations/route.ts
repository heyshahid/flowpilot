import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { aiConversationStore } from '@/lib/storage/aiConversationStore';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:read');
    const conversations = aiConversationStore.list(authCtx.workspace.id);

    return NextResponse.json({
      success: true,
      data: conversations,
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

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:create');
    const body = await req.json();
    const { title, workflowId } = body;

    const conv = aiConversationStore.create(title, authCtx.workspace.id, workflowId);

    return NextResponse.json(
      {
        success: true,
        data: conv,
      },
      { status: 201 }
    );
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
