import { executeSafeHttpRequest } from '../../security/ssrf';
import { maskSensitiveData } from '../../security/masking';
import { credentialStore } from '../../../lib/storage/credentialStore';
import { NodeDriver } from '../types';

export const httpRequestDriver: NodeDriver = async (context, resolvedConfig) => {
  const rawUrl = String(resolvedConfig.url || '');
  if (!rawUrl) {
    throw new Error('HTTP Request node requires a valid "url" configuration.');
  }

  const method = String(resolvedConfig.method || 'GET').toUpperCase();
  const timeoutMs = Number(resolvedConfig.timeoutMs || 10000);

  // Setup abort controller linking context.signal with timeout
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  if (context.signal) {
    context.signal.addEventListener('abort', () => timeoutController.abort());
  }

  try {
    let headers: Record<string, string> = {};
    if (resolvedConfig.headers && typeof resolvedConfig.headers === 'object') {
      headers = { ...(resolvedConfig.headers as Record<string, string>) };
    }

    // Attach credentials from Vault if referenced
    if (resolvedConfig.credentialId) {
      const workspaceId = (context as any).workspaceId;
      const cred = await credentialStore.getDecryptedData(String(resolvedConfig.credentialId), {
        workspaceId,
      });
      if (cred) {
        if (cred.token) {
          headers['Authorization'] = `Bearer ${cred.token}`;
        } else if (cred.apiKey) {
          headers[cred.headerName || 'X-API-Key'] = cred.apiKey;
        } else if (cred.username) {
          const authStr = `${cred.username}:${cred.password || ''}`;
          headers['Authorization'] = `Basic ${Buffer.from(authStr).toString('base64')}`;
        }
      }
    }

    let bodyData: string | Buffer | null = null;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (typeof resolvedConfig.body === 'object' && resolvedConfig.body !== null) {
        bodyData = JSON.stringify(resolvedConfig.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else if (typeof resolvedConfig.body === 'string') {
        bodyData = resolvedConfig.body;
      }
    }

    // Execute with full SSRF protection (DNS rebinding prevention + safe redirect traversal)
    const response = await executeSafeHttpRequest(rawUrl, {
      method,
      headers,
      body: bodyData,
      timeoutMs,
      signal: timeoutController.signal,
    });

    clearTimeout(timer);

    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: response.headers,
      data: response.data,
      request: {
        url: response.url,
        method,
        headers: maskSensitiveData(headers),
      },
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    if (context.signal?.aborted) {
      throw new Error(`HTTP Request aborted by execution cancellation.`);
    }
    if (timeoutController.signal.aborted) {
      throw new Error(`HTTP Request timed out after ${timeoutMs}ms.`);
    }
    throw err;
  }
};
