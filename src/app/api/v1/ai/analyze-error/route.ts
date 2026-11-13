import { NextRequest, NextResponse } from 'next/server';
import { ErrorAssistant } from '@/core/ai/errorAssistant';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { executionId, failedNodeId, provider, model, workspaceId } = body;

    if (!executionId) {
      return NextResponse.json(
        { success: false, error: 'An "executionId" is required for error diagnosis.' },
        { status: 400 }
      );
    }

    const diagnosis = await ErrorAssistant.diagnose(executionId, failedNodeId, {
      provider,
      model,
      workspaceId,
    });

    return NextResponse.json({
      success: true,
      data: diagnosis,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
