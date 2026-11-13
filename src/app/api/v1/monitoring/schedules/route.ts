import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { monitoringService } from '@/core/monitoring/monitoringService';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    RBACManager.assertPermission(authCtx.role, 'workflow:read');

    const url = new URL(req.url);
    const requestedWorkspace = url.searchParams.get('workspaceId');
    if (requestedWorkspace && requestedWorkspace !== authCtx.workspace.id) {
      return NextResponse.json(
        { success: false, error: `Workspace "${requestedWorkspace}" not found or unauthorized.` },
        { status: 404 }
      );
    }

    const health = await monitoringService.getSchedulerHealth(authCtx.workspace.id);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: health,
    });
  } catch (error: any) {
    const status = error.message?.includes('Unauthorized')
      ? 401
      : error.message?.includes('Forbidden')
      ? 403
      : error.message?.includes('not found')
      ? 404
      : 500;
    return NextResponse.json(
      { success: false, error: error.message || 'Internal scheduler monitoring error' },
      { status }
    );
  }
}
