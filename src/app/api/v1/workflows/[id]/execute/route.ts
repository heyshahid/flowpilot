import { NextRequest, NextResponse } from 'next/server';
import { workflowStore } from '@/lib/storage/workflowStore';
import { FlowPilotExecutor } from '@/core/engine/executor';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workflow = workflowStore.getById(id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found.' },
        { status: 404 }
      );
    }

    let payload: Record<string, unknown> = {};
    try {
      const body = await req.json();
      payload = body.payload || {};
    } catch {
      // Empty payload is acceptable
    }

    const executor = new FlowPilotExecutor();
    const result = await executor.execute(workflow, payload);

    // Update execution counters
    workflow.executionCount = (workflow.executionCount || 0) + 1;
    if (result.status === 'completed') {
      workflow.successCount = (workflow.successCount || 0) + 1;
    } else {
      workflow.failureCount = (workflow.failureCount || 0) + 1;
    }
    workflow.lastExecutedAt = new Date().toISOString();
    workflowStore.save(workflow);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
