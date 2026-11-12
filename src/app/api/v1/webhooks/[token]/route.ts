import { NextRequest, NextResponse } from 'next/server';
import { WebhookSecurityManager } from '@/core/security/webhookSecurity';
import { webhookStore } from '@/lib/storage/webhookStore';
import { executionQueue } from '@/core/execution/queue';

const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return handleWebhookRequest(req, await params, 'POST');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return handleWebhookRequest(req, await params, 'GET');
}

async function handleWebhookRequest(
  req: NextRequest,
  params: { token: string },
  method: 'POST' | 'GET'
) {
  const start = Date.now();
  const token = params.token;
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';

  // 1. Look up Webhook Configuration
  const webhook = await webhookStore.getByToken(token);
  if (!webhook) {
    return NextResponse.json(
      { success: false, error: 'Webhook endpoint not found or token invalid.' },
      { status: 404 }
    );
  }

  // 2. Check if webhook is active
  if (webhook.status !== 'active') {
    return NextResponse.json(
      { success: false, error: 'This webhook endpoint has been disabled by the workspace owner.' },
      { status: 403 }
    );
  }

  // 3. Method validation
  if (!webhook.allowedMethods.includes(method)) {
    return NextResponse.json(
      { success: false, error: `HTTP method ${method} is not permitted on this webhook.` },
      { status: 405 }
    );
  }

  // 4. Rate Limiting Check
  const rateLimit = WebhookSecurityManager.checkRateLimit(token, webhook.rateLimitPerMin);
  if (!rateLimit.allowed) {
    await webhookStore.logDelivery({
      webhookId: webhook.id,
      workflowId: webhook.workflowId,
      status: 'REJECTED',
      httpStatus: 429,
      requestMethod: method,
      headers: Object.fromEntries(req.headers.entries()),
      clientIp,
      payloadPreview: '[Rate Limited]',
      durationMs: Date.now() - start,
      errorReason: 'Rate limit exceeded.',
    });

    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Too many requests sent to this webhook.' },
      {
        status: 429,
        headers: { 'Retry-After': '60' },
      }
    );
  }

  // 5. Payload extraction & Size Limit Check
  let rawBody = '';
  let payload: Record<string, unknown> = {};

  if (method === 'POST') {
    try {
      rawBody = await req.text();
    } catch {
      rawBody = '';
    }

    if (Buffer.byteLength(rawBody, 'utf8') > MAX_PAYLOAD_BYTES) {
      await webhookStore.logDelivery({
        webhookId: webhook.id,
        workflowId: webhook.workflowId,
        status: 'REJECTED',
        httpStatus: 400,
        requestMethod: method,
        headers: Object.fromEntries(req.headers.entries()),
        clientIp,
        payloadPreview: '[Exceeded 1MB Size Limit]',
        durationMs: Date.now() - start,
        errorReason: 'Payload exceeds 1MB limit.',
      });

      return NextResponse.json(
        { success: false, error: 'Request payload exceeds maximum allowed size of 1MB.' },
        { status: 400 }
      );
    }

    if (rawBody.trim()) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = { rawText: rawBody };
      }
    }
  } else {
    // GET: Query params become payload
    const searchParams = req.nextUrl.searchParams;
    const entries: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      entries[key] = val;
    });
    payload = entries;
    rawBody = JSON.stringify(entries);
  }

  // 6. Timestamp & Replay Attack Protection
  const timestampHeader =
    req.headers.get('x-flowpilot-timestamp') ||
    req.headers.get('x-timestamp') ||
    req.headers.get('x-signature-timestamp');

  if (timestampHeader) {
    const timestampCheck = WebhookSecurityManager.validateTimestamp(
      timestampHeader,
      webhook.replayToleranceSec
    );

    if (!timestampCheck.valid) {
      await webhookStore.logDelivery({
        webhookId: webhook.id,
        workflowId: webhook.workflowId,
        status: 'REJECTED',
        httpStatus: 401,
        requestMethod: method,
        headers: Object.fromEntries(req.headers.entries()),
        clientIp,
        payloadPreview: rawBody.substring(0, 150),
        durationMs: Date.now() - start,
        errorReason: `Timestamp verification failed (age: ${Math.round(timestampCheck.ageSeconds)}s). Potential replay attack.`,
      });

      return NextResponse.json(
        { success: false, error: 'Webhook timestamp is outside acceptable replay tolerance.' },
        { status: 401 }
      );
    }
  }

  // 7. Authentication & HMAC Signature Verification
  if (webhook.authType === 'hmac_sha256') {
    const signature =
      req.headers.get('x-flowpilot-signature') ||
      req.headers.get('x-hub-signature-256') ||
      req.headers.get('x-signature');

    if (!signature) {
      await webhookStore.logDelivery({
        webhookId: webhook.id,
        workflowId: webhook.workflowId,
        status: 'REJECTED',
        httpStatus: 401,
        requestMethod: method,
        headers: Object.fromEntries(req.headers.entries()),
        clientIp,
        payloadPreview: rawBody.substring(0, 150),
        durationMs: Date.now() - start,
        errorReason: 'Missing HMAC signature header.',
      });

      return NextResponse.json(
        { success: false, error: 'Unauthorized: Missing required X-FlowPilot-Signature header.' },
        { status: 401 }
      );
    }

    const isValidSig = WebhookSecurityManager.verifyHmacSignature(
      rawBody,
      signature,
      webhook.secret
    );

    if (!isValidSig) {
      await webhookStore.logDelivery({
        webhookId: webhook.id,
        workflowId: webhook.workflowId,
        status: 'REJECTED',
        httpStatus: 401,
        requestMethod: method,
        headers: Object.fromEntries(req.headers.entries()),
        clientIp,
        payloadPreview: rawBody.substring(0, 150),
        durationMs: Date.now() - start,
        errorReason: 'Invalid HMAC signature mismatch.',
      });

      return NextResponse.json(
        { success: false, error: 'Unauthorized: HMAC signature verification failed.' },
        { status: 401 }
      );
    }
  } else if (webhook.authType === 'bearer_token') {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ') || authHeader.substring(7) !== webhook.secret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid Bearer token.' },
        { status: 401 }
      );
    }
  } else if (webhook.authType === 'api_key') {
    const apiKeyHeader = req.headers.get('x-api-key') || '';
    if (apiKeyHeader !== webhook.secret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid X-API-Key.' },
        { status: 401 }
      );
    }
  }

  // 8. Trigger associated workflow in Phase 4 Execution Engine
  try {
    const execution = await executionQueue.enqueue(webhook.workflowId, {
      ...payload,
      _webhook: {
        id: webhook.id,
        name: webhook.name,
        token: webhook.token,
        method,
        clientIp,
        timestamp: new Date().toISOString(),
      },
    });

    const durationMs = Date.now() - start;

    // 9. Log Successful Webhook Delivery
    await webhookStore.logDelivery({
      webhookId: webhook.id,
      workflowId: webhook.workflowId,
      executionId: execution.id,
      status: 'ACCEPTED',
      httpStatus: 202,
      requestMethod: method,
      headers: Object.fromEntries(req.headers.entries()),
      clientIp,
      payloadPreview: rawBody.substring(0, 200),
      durationMs,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Webhook event received and enqueued for workflow execution.',
        executionId: execution.id,
        webhookId: webhook.id,
        status: 'ACCEPTED',
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    const errMsg = (err as Error).message;
    await webhookStore.logDelivery({
      webhookId: webhook.id,
      workflowId: webhook.workflowId,
      status: 'FAILED',
      httpStatus: 500,
      requestMethod: method,
      headers: Object.fromEntries(req.headers.entries()),
      clientIp,
      payloadPreview: rawBody.substring(0, 150),
      durationMs: Date.now() - start,
      errorReason: errMsg,
    });

    return NextResponse.json(
      { success: false, error: `Failed to trigger workflow: ${errMsg}` },
      { status: 500 }
    );
  }
}
