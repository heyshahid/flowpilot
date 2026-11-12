import { NextRequest, NextResponse } from 'next/server';
import { credentialStore } from '@/lib/storage/credentialStore';
import { integrationRegistry } from '@/core/integrations/registry';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cred = await credentialStore.getById(id);
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credential not found.' }, { status: 404 });
    }

    const decrypted = await credentialStore.getDecryptedData(id);
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
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
