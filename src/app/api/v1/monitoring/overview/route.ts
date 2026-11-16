import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';
import { monitoringService } from '@/core/monitoring/monitoringService';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'usage:read');

    const url = new URL(req.url);
    const requestedWorkspace = url.searchParams.get('workspaceId');
    if (requestedWorkspace && requestedWorkspace !== authCtx.workspace.id) {
      return NextResponse.json(
        { success: false, error: `Workspace "${requestedWorkspace}" not found or unauthorized.` },
        { status: 404 }
      );
    }

    const overview = await monitoringService.getMonitoringOverview(authCtx.workspace.id);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: overview,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    const status = error.message?.includes('Unauthorized')
      ? 401
      : error.message?.includes('Forbidden')
      ? 403
      : error.message?.includes('not found')
      ? 404
      : 500;
    return NextResponse.json(
      { success: false, error: error.message || 'Internal monitoring error' },
      { status }
    );
  }
}

