import { NextRequest, NextResponse } from 'next/server';
import { executionStore } from '@/lib/storage/executionStore';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const execution = await executionStore.getById(id);

    if (!execution) {
      return NextResponse.json(
        { success: false, error: `Execution record "${id}" was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      execution,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
