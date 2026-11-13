import { NextRequest, NextResponse } from 'next/server';
import { WorkflowGenerator } from '@/core/ai/workflowGenerator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, provider, model, workspaceId } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'A natural language "prompt" is required.' },
        { status: 400 }
      );
    }

    const proposal = await WorkflowGenerator.generate(prompt.trim(), {
      provider,
      model,
      workspaceId,
    });

    return NextResponse.json({
      success: true,
      data: proposal,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
