import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { aiUsageAnalyticsService } from '@/core/analytics/aiUsageAnalyticsService';

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

    const bucketSize = (url.searchParams.get('bucketSize') as 'hour' | 'day') || 'day';
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;

    const points = await aiUsageAnalyticsService.getTimeSeries(
      authCtx.workspace.id,
      bucketSize,
      startDate,
      endDate
    );

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: {
        points,
        totalPoints: points.length,
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
      { success: false, error: error.message || 'Internal AI usage trends error' },
      { status }
    );
  }
}

