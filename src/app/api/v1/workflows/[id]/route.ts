import { NextRequest, NextResponse } from 'next/server';
import { workflowStore } from '@/lib/storage/workflowStore';

export async function GET(
  _req: NextRequest,
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
    return NextResponse.json({ success: true, workflow });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = workflowStore.getById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found.' },
        { status: 404 }
      );
    }

    const updated = workflowStore.save({
      ...existing,
      ...body,
      id, // enforce immutable id
    });

    return NextResponse.json({ success: true, workflow: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = workflowStore.delete(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
