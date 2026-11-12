import { validateOutboundUrl } from '../../security/ssrf';
import { maskSensitiveData } from '../../security/masking';
import { NodeDriver } from '../types';

export const httpRequestDriver: NodeDriver = async (context, resolvedConfig) => {
  const rawUrl = String(resolvedConfig.url || '');
  if (!rawUrl) {
    throw new Error('HTTP Request node requires a valid "url" configuration.');
  }

  // 1. Strict SSRF Protection Check (Blocks localhost, RFC 1918, Cloud metadata)
  const validatedUrl = validateOutboundUrl(rawUrl);

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

    let bodyData: BodyInit | null | undefined = undefined;
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

    const response = await fetch(validatedUrl.toString(), {
      method,
      headers,
      body: bodyData,
      signal: timeoutController.signal,
    });

    clearTimeout(timer);

    const contentType = response.headers.get('content-type') || '';
    let responseData: unknown;
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data: responseData,
      request: {
        url: validatedUrl.toString(),
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
