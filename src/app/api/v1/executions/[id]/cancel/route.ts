import { NextRequest, NextResponse } from 'next/server';
import { executionQueue } from '@/core/execution/queue';
import { executionStore } from '@/lib/storage/executionStore';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cancelled = await executionQueue.cancel(id);

    const record = await executionStore.getById(id);
    if (!record) {
      return NextResponse.json(
        { success: false, error: `Execution record "${id}" was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      cancelled,
      message: cancelled
        ? `Execution "${id}" successfully cancelled.`
        : `Execution "${id}" could not be cancelled (already in terminal state).`,
      execution: record,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

