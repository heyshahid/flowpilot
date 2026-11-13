import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { integrationHealthService } from '@/core/analytics/integrationHealthService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const services = await integrationHealthService.getServiceMetrics(authCtx.workspace.id);
    const targetService = services.find((s) => s.integrationId === id);

    if (!targetService) {
      return NextResponse.json(
        { success: false, error: `Integration "${id}" not found.` },
        { status: 404 }
      );
    }

    const allOps = await integrationHealthService.getWorkspaceOperations(authCtx.workspace.id);
    const matchingOps = allOps.filter((o) => o.integrationId === id);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: {
        integration: targetService,
        recentOperations: matchingOps.slice(0, 50),
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
      { success: false, error: error.message || 'Internal integration detail error' },
      { status }
    );
  }
}

