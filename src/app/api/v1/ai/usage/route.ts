import { NextRequest, NextResponse } from 'next/server';
import { aiUsageStore } from '@/lib/storage/aiUsageStore';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws_default';
    const summary = aiUsageStore.getSummary(workspaceId);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

