import { NextRequest, NextResponse } from 'next/server';
import { versionStore } from '@/lib/storage/versionStore';
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
        { success: false, error: `Workflow "${id}" was not found.` },
        { status: 404 }
      );
    }

    const versions = await versionStore.listVersions(id);
    return NextResponse.json({ success: true, count: versions.length, versions });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { changeSummary, isPublished, createdBy } = body;

    const workflow = workflowStore.getById(id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow "${id}" was not found.` },
        { status: 404 }
      );
    }

    const version = await versionStore.createVersion(
      id,
      changeSummary || 'Manual version snapshot created',
      isPublished ?? true,
      createdBy || 'user'
    );

    return NextResponse.json({ success: true, version }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
