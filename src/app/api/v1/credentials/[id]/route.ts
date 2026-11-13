import { NextRequest, NextResponse } from 'next/server';
import { credentialStore } from '@/lib/storage/credentialStore';
import { auditLogStore } from '@/lib/storage/auditLogStore';
import { AuthContextManager } from '@/core/auth/authContext';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'credential:read');

    const cred = await credentialStore.getById(id, authCtx.workspace.id);
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credential not found in this workspace.' }, { status: 404 });
    }

    const { encryptedData, ...safeRecord } = cred;
    return NextResponse.json({ success: true, credential: safeRecord });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authCtx = await AuthContextManager.enforcePermission(req, 'credential:delete');

    const cred = await credentialStore.getById(id, authCtx.workspace.id);
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credential not found in this workspace.' }, { status: 404 });
    }

    const deleted = await credentialStore.delete(id, authCtx.workspace.id);

    auditLogStore.log({
      workspaceId: authCtx.workspace.id,
      actorId: authCtx.user.id,
      actorName: authCtx.user.name,
      actorEmail: authCtx.user.email,
      action: 'credential.revoked',
      resourceType: 'credential',
      resourceId: id,
      resourceName: cred.name,
    });

    return NextResponse.json({ success: deleted, message: 'Credential revoked successfully.' });
  } catch (error) {
    const msg = (error as Error).message;
    const status = msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
