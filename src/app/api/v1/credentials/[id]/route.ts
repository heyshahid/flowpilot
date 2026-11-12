import { NextRequest, NextResponse } from 'next/server';
import { credentialStore } from '@/lib/storage/credentialStore';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cred = await credentialStore.getById(id);
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credential not found.' }, { status: 404 });
    }

    const { encryptedData, ...safeRecord } = cred;
    return NextResponse.json({ success: true, credential: safeRecord });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await credentialStore.delete(id);
    return NextResponse.json({ success: deleted });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
