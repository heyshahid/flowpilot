import { NextRequest, NextResponse } from 'next/server';
import { aiConversationStore } from '@/lib/storage/aiConversationStore';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws_default';
    const conversations = aiConversationStore.list(workspaceId);

    return NextResponse.json({
      success: true,
      data: conversations,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, workspaceId, workflowId } = body;

    const conv = aiConversationStore.create(title, workspaceId || 'ws_default', workflowId);

    return NextResponse.json(
      {
        success: true,
        data: conv,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
