import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/storage/webhookStore';
import { workflowStore } from '@/lib/storage/workflowStore';

export async function GET() {
  try {
    const list = await webhookStore.list();
    return NextResponse.json({ success: true, webhooks: list });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflowId, name, authType, allowedMethods, rateLimitPerMin } = body;

    if (!workflowId) {
      return NextResponse.json({ success: false, error: 'workflowId is required.' }, { status: 400 });
    }

    const workflow = workflowStore.getById(workflowId);
    if (!workflow) {
      return NextResponse.json({ success: false, error: `Workflow "${workflowId}" not found.` }, { status: 404 });
    }

    const created = await webhookStore.create({
      workflowId,
      workflowName: workflow.name,
      name,
      authType,
      allowedMethods,
      rateLimitPerMin,
    });

    return NextResponse.json({ success: true, webhook: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
