import { NextRequest, NextResponse } from 'next/server';
import { aiConversationStore } from '@/lib/storage/aiConversationStore';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const conv = aiConversationStore.getById(id);

    if (!conv) {
      return NextResponse.json(
        { success: false, error: `Conversation "${id}" not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: conv,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { role, content, metadata } = body;

    if (!role || !content) {
      return NextResponse.json(
        { success: false, error: '"role" and "content" are required.' },
        { status: 400 }
      );
    }

    const msg = aiConversationStore.addMessage(id, role, content, metadata);

    return NextResponse.json({
      success: true,
      data: msg,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = aiConversationStore.delete(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Conversation "${id}" not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Conversation "${id}" deleted successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
