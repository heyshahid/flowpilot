import { NextRequest, NextResponse } from 'next/server';
import { integrationRegistry } from '@/core/integrations/registry';
import { credentialStore } from '@/lib/storage/credentialStore';
import { AuthContextManager } from '@/core/auth/authContext';
import { AuthError } from '@/core/auth/types';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await AuthContextManager.enforcePermission(req, 'integration:read');
    const list = integrationRegistry.getAll();
    const credentials = await credentialStore.list({ workspaceId: authCtx.workspace.id });

    const result = list.map((integ) => {
      const creds = credentials.filter((c) => c.integrationId === integ.id);
      const isConnected = creds.some((c) => c.status === 'valid');
      return {
        ...integ,
        connected: isConnected,
        credentialsCount: creds.length,
        credentials: creds.map(({ encryptedData, ...rest }) => rest),
      };
    });

    return NextResponse.json({ success: true, integrations: result });
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

