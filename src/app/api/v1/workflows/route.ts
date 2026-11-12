import { NextRequest, NextResponse } from 'next/server';
import { workflowStore } from '@/lib/storage/workflowStore';

export async function GET() {
  try {
    const workflows = workflowStore.getAll();
    return NextResponse.json({ success: true, workflows });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Workflow name is required.' },
        { status: 400 }
      );
    }

    const workflow = workflowStore.create({
      name: body.name,
      description: body.description,
      triggerType: body.triggerType,
    });

    return NextResponse.json({ success: true, workflow }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

