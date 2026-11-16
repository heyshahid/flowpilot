import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { versionStore } from '@/lib/storage/versionStore';
import { workflowStore } from '@/lib/storage/workflowStore';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workflow = workflowStore.getById(id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    await AuthContextManager.enforceWorkspaceIsolation(
      req,
      workflow.workspaceId || 'ws_default',
      'workflow:read'
    );

    const versions = await versionStore.listVersions(id);
    return NextResponse.json({ success: true, count: versions.length, versions });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
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
    const workflow = workflowStore.getById(id);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow "${id}" was not found.`, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const authCtx = await AuthContextManager.enforceWorkspaceIsolation(
      req,
      workflow.workspaceId || 'ws_default',
      'workflow:update'
    );

    const body = await req.json();
    const { changeSummary, isPublished } = body;

    const version = await versionStore.createVersion(
      id,
      changeSummary || 'Manual version snapshot created',
      isPublished ?? true,
      authCtx.user.email || authCtx.user.name || 'user'
    );

    return NextResponse.json({ success: true, version }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
