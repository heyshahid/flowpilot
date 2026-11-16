import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { aiConversationStore } from '@/lib/storage/aiConversationStore';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:read');
    const { id } = await params;
    const conv = aiConversationStore.getById(id);

    if (!conv || (conv.workspaceId && conv.workspaceId !== authCtx.workspace.id)) {
      return NextResponse.json(
        { success: false, error: `Conversation "${id}" not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: conv,
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:create');
    const { id } = await params;
    const conv = aiConversationStore.getById(id);

    if (!conv || (conv.workspaceId && conv.workspaceId !== authCtx.workspace.id)) {
      return NextResponse.json(
        { success: false, error: `Conversation "${id}" not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { role, content, metadata } = body;

    if (!role || !content) {
      return NextResponse.json(
        { success: false, error: '"role" and "content" are required.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const msg = aiConversationStore.addMessage(id, role, content, metadata);

    return NextResponse.json({
      success: true,
      data: msg,
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'workflow:delete');
    const { id } = await params;
    const conv = aiConversationStore.getById(id);

    if (!conv || (conv.workspaceId && conv.workspaceId !== authCtx.workspace.id)) {
      return NextResponse.json(
        { success: false, error: `Conversation "${id}" not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const deleted = aiConversationStore.delete(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Conversation "${id}" not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Conversation "${id}" deleted successfully.`,
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
