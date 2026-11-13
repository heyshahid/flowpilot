import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { workflowStore } from '@/lib/storage/workflowStore';
import { analyticsService } from '@/core/analytics/analyticsService';
import { AnalyticsQueryOptions, TimeWindow } from '@/core/analytics/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    RBACManager.assertPermission(authCtx.role, 'workflow:read');

    const { id } = await params;
    const workflow = workflowStore.getById(id, authCtx.workspace.id);

    // Cross-workspace isolation: return 404 if not found or belongs to another tenant
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow "${id}" not found in active workspace.` },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const timeWindow = (url.searchParams.get('timeWindow') as TimeWindow) || '30d';
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    const options: AnalyticsQueryOptions = {
      workspaceId: authCtx.workspace.id,
      workflowId: id,
      timeWindow,
      customDateRange: startDate && endDate ? { startDate, endDate } : undefined,
    };

    const diagnostics = await analyticsService.getWorkflowNodeDiagnostics(id, options);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: diagnostics,
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

