import { NextRequest, NextResponse } from 'next/server';
import { WorkflowExplainer } from '@/core/ai/workflowExplainer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflow, provider, model, workspaceId } = body;

    if (!workflow || !Array.isArray(workflow.nodes)) {
      return NextResponse.json(
        { success: false, error: 'A valid "workflow" graph object is required.' },
        { status: 400 }
      );
    }

    const explanation = await WorkflowExplainer.explain(workflow, {
      provider,
      model,
      workspaceId,
    });

    return NextResponse.json({
      success: true,
      data: explanation,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
