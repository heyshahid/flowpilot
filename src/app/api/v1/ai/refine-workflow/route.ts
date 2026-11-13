import { NextRequest, NextResponse } from 'next/server';
import { GraphRefiner } from '@/core/ai/graphRefiner';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflow, prompt, provider, model, workspaceId } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A refinement "prompt" is required.' },
        { status: 400 }
      );
    }

    if (!workflow || !Array.isArray(workflow.nodes)) {
      return NextResponse.json(
        { success: false, error: 'A valid "workflow" graph object is required.' },
        { status: 400 }
      );
    }

    const proposal = await GraphRefiner.refine(workflow, prompt.trim(), {
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

