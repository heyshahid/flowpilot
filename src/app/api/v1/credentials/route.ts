import { NextRequest, NextResponse } from 'next/server';
import { credentialStore } from '@/lib/storage/credentialStore';
import { integrationRegistry } from '@/core/integrations/registry';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'credential:read');
    const { searchParams } = new URL(req.url);
    const integrationId = searchParams.get('integrationId') || undefined;

    const list = await credentialStore.list({
      integrationId,
      workspaceId: authCtx.workspace.id,
    });

    // Strip encryptedData before sending to frontend
    const safeList = list.map(({ encryptedData, ...rest }) => rest);

    return NextResponse.json({ success: true, credentials: safeList });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'credential:create');
    const body = await req.json();
    const { name, integrationId, type, data } = body;

    if (!name || !integrationId || !data) {
      return NextResponse.json(
        { success: false, error: 'Name, integrationId, and credential data are required.' },
        { status: 400 }
      );
    }

    const record = await credentialStore.save({
      name,
      integrationId,
      type: type || 'api_key',
      data,
      workspaceId: authCtx.workspace.id,
      createdBy: authCtx.user.id,
    });

    // Automatically perform a connection test upon creation
    const testResult = await integrationRegistry.testConnection(integrationId, data);
    if (testResult.ok) {
      await credentialStore.updateStatus(record.id, 'valid');
      record.status = 'valid';
    } else {
      await credentialStore.updateStatus(record.id, 'invalid');
      record.status = 'invalid';
    }

    // Audit log (sanitized)
    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'credential.created',
      resourceType: 'credential',
      resourceId: record.id,
      resourceName: record.name,
      metadata: { integrationId, type },
    });

    const { encryptedData, ...safeRecord } = record;
    return NextResponse.json({
      success: true,
      credential: safeRecord,
      testResult,
    }, { status: 201 });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
