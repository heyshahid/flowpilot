import { NextRequest, NextResponse } from 'next/server';
import { executionQueue } from '@/core/execution/queue';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const execution = await executionQueue.retry(id);

    return NextResponse.json({
      success: true,
      message: `Execution "${id}" successfully re-queued for retry attempt #${execution.retryCount}.`,
      execution,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}

