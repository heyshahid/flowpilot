import { NextRequest, NextResponse } from 'next/server';
import { AuthContextManager } from '@/core/auth/authContext';
import { alertIncidentStore } from '@/lib/storage/alertIncidentStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'alert:manage');

    const incident = alertIncidentStore.getById(id, authCtx.workspace.id);
    if (!incident) {
      return NextResponse.json(
        { success: false, error: 'Incident not found' },
        { status: 404 }
      );
    }

    const updated = alertIncidentStore.acknowledge(id, authCtx.user.id, authCtx.workspace.id);

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'alert.incident_acknowledged',
      resourceType: 'alert',
      resourceId: id,
      resourceName: incident.ruleName,
      metadata: { previousStatus: incident.status, newStatus: 'ACKNOWLEDGED' },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

