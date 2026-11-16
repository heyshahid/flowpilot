import { NextRequest, NextResponse } from 'next/server';
import { credentialStore } from '@/lib/storage/credentialStore';
import { integrationRegistry } from '@/core/integrations/registry';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function POST(
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

    const decrypted = await credentialStore.getDecryptedData(id, { workspaceId: authCtx.workspace.id });
    if (!decrypted) {
      return NextResponse.json({ success: false, error: 'Failed to decrypt credential.' }, { status: 500 });
    }

    const testResult = await integrationRegistry.testConnection(cred.integrationId, decrypted);
    await credentialStore.updateStatus(id, testResult.ok ? 'valid' : 'invalid');

    return NextResponse.json({
      success: true,
      testResult,
      status: testResult.ok ? 'valid' : 'invalid',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

