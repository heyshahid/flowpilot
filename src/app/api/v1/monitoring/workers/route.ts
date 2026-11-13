import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { RBACManager } from '@/core/auth/rbac';
import { monitoringService } from '@/core/monitoring/monitoringService';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    RBACManager.assertPermission(authCtx.role, 'workflow:read');

    const workerObservability = monitoringService.getWorkerObservability();

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: workerObservability,
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
      { success: false, error: error.message || 'Internal worker monitoring error' },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.resolve(req);
    RBACManager.assertPermission(authCtx.role, 'workflow:execute');

    let body = {};
    try {
      body = await req.json();
    } catch {
      // Empty body
    }

    const heartbeat = monitoringService.recordWorkerHeartbeat(undefined, body);

    return NextResponse.json({
      success: true,
      workspaceId: authCtx.workspace.id,
      data: heartbeat,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to record worker heartbeat' },
      { status: 500 }
    );
  }
}
