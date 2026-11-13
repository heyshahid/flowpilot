import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { analyticsService } from '@/core/analytics/analyticsService';
import { AnalyticsQueryOptions, TimeWindow } from '@/core/analytics/types';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    RBACManager.assertPermission(authCtx.role, 'workflow:read');

    const url = new URL(req.url);
    const timeWindow = (url.searchParams.get('timeWindow') as TimeWindow) || '30d';
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    const validWindows: TimeWindow[] = ['24h', '7d', '30d', '90d', 'custom'];
    if (!validWindows.includes(timeWindow)) {
      return NextResponse.json(
        { success: false, error: `Invalid timeWindow parameter "${timeWindow}". Allowed: ${validWindows.join(', ')}` },
        { status: 400 }
      );
    }

    if (timeWindow === 'custom' && (!startDate || !endDate)) {
      return NextResponse.json(
        { success: false, error: 'startDate and endDate are required for custom timeWindow.' },
        { status: 400 }
      );
    }

    const options: AnalyticsQueryOptions = {
      workspaceId: authCtx.workspace.id,
      timeWindow,
      customDateRange: startDate && endDate ? { startDate, endDate } : undefined,
    };

    const items = await analyticsService.getWorkspaceWorkflowsOverview(options);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: items,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Unauthorized')
      ? 401
      : msg.includes('Forbidden')
      ? 403
      : msg.includes('not found')
      ? 404
      : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
