import { NextResponse } from 'next/server';
import { integrationRegistry } from '@/core/integrations/registry';
import { credentialStore } from '@/lib/storage/credentialStore';

export async function GET() {
  try {
    const list = integrationRegistry.getAll();
    const credentials = await credentialStore.list();

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
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
