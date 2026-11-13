import { NextRequest, NextResponse } from 'next/server';
import { versionStore } from '@/lib/storage/versionStore';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const body = await req.json().catch(() => ({}));
    const restoredBy = body.restoredBy || 'user';

    const result = await versionStore.restoreVersion(id, versionId, restoredBy);

    return NextResponse.json({
      success: true,
      message: `Workflow "${id}" restored successfully to version ${result.restoredVersion.versionNumber}.`,
      workflow: result.workflow,
      restoredVersion: result.restoredVersion,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
