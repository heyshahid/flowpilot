import { NextRequest, NextResponse } from 'next/server';
import { scheduleStore } from '@/lib/storage/scheduleStore';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const schedule = await scheduleStore.getById(id);
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: `Schedule "${id}" was not found.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, schedule });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updated = await scheduleStore.update(id, body);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: `Schedule "${id}" was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, schedule: updated });
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
    const deleted = await scheduleStore.delete(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Schedule "${id}" not found.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: `Schedule "${id}" deleted successfully.` });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
