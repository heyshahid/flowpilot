import { NextRequest, NextResponse } from 'next/server';
import { credentialStore } from '@/lib/storage/credentialStore';
import { integrationRegistry } from '@/core/integrations/registry';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const integrationId = searchParams.get('integrationId') || undefined;

    const list = await credentialStore.list({ integrationId });
    // Strip encryptedData before sending to frontend
    const safeList = list.map(({ encryptedData, ...rest }) => rest);

    return NextResponse.json({ success: true, credentials: safeList });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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

    const { encryptedData, ...safeRecord } = record;
    return NextResponse.json({
      success: true,
      credential: safeRecord,
      testResult,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

