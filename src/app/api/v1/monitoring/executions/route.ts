import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { monitoringService } from '@/core/monitoring/monitoringService';
import { ExecutionMonitoringFilter } from '@/core/monitoring/types';

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

    const workflowId = url.searchParams.get('workflowId') || undefined;
    const status = (url.searchParams.get('status') as any) || undefined;
    const triggerType = url.searchParams.get('triggerType') || undefined;
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;
    const search = url.searchParams.get('search') || undefined;

    const minDurationMsStr = url.searchParams.get('minDurationMs');
    const minDurationMs = minDurationMsStr ? parseInt(minDurationMsStr, 10) : undefined;

    const maxDurationMsStr = url.searchParams.get('maxDurationMs');
    const maxDurationMs = maxDurationMsStr ? parseInt(maxDurationMsStr, 10) : undefined;

    const offsetStr = url.searchParams.get('offset');
    const offset = offsetStr ? Math.max(0, parseInt(offsetStr, 10)) : 0;

    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? Math.min(100, Math.max(1, parseInt(limitStr, 10))) : 20;

    const filter: ExecutionMonitoringFilter = {
      workspaceId: authCtx.workspace.id,
      workflowId,
      status,
      triggerType,
      startDate,
      endDate,
      minDurationMs,
      maxDurationMs,
      search,
      offset,
      limit,
    };

    const result = await monitoringService.getExecutions(filter);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: {
        items: result.items,
        total: result.total,
        offset,
        limit,
        summary: result.summary,
      },
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
      { success: false, error: error.message || 'Internal execution monitoring error' },
      { status }
    );
  }
}

