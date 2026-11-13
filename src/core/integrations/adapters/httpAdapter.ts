import { validateOutboundUrl } from '../../security/ssrf';
import { maskSensitiveData } from '../../security/masking';
import { ConnectionTestResult, IntegrationAdapter } from '../types';

export class HttpAdapter implements IntegrationAdapter {
  public integrationId = 'http';

  public async testConnection(credentials: Record<string, any>): Promise<ConnectionTestResult> {
    const start = Date.now();
    const testUrl = credentials.baseUrl || credentials.url || 'https://httpbin.org/get';

    try {
      const validatedUrl = validateOutboundUrl(testUrl);
      const headers: Record<string, string> = {};

      if (credentials.authType === 'bearer_token' && credentials.token) {
        headers['Authorization'] = `Bearer ${credentials.token}`;
      } else if (credentials.authType === 'basic_auth' && credentials.username) {
        const authStr = `${credentials.username}:${credentials.password || ''}`;
        headers['Authorization'] = `Basic ${Buffer.from(authStr).toString('base64')}`;
      } else if (credentials.authType === 'api_key' && credentials.apiKey) {
        const headerName = credentials.headerName || 'X-API-Key';
        headers[headerName] = credentials.apiKey;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(validatedUrl.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      return {
        ok: res.ok || res.status < 500,
        message: `HTTP endpoint responded with status ${res.status} (${res.statusText}) in ${latencyMs}ms.`,
        latencyMs,
        details: { status: res.status, statusText: res.statusText },
      };
    } catch (err: unknown) {
      return {
        ok: false,
        message: `Connection failed: ${(err as Error).message}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  public async executeAction(
    actionId: string,
    params: Record<string, any>,
    credentials?: Record<string, any>
  ): Promise<Record<string, any>> {
    if (actionId !== 'request') {
      throw new Error(`Unknown HTTP action "${actionId}". Supported: "request".`);
    }

    const rawUrl = String(params.url || (credentials?.baseUrl ? `${credentials.baseUrl}${params.path || ''}` : ''));
    if (!rawUrl) {
      throw new Error('HTTP Request requires a target URL.');
    }

    const validatedUrl = validateOutboundUrl(rawUrl);
    const method = String(params.method || 'GET').toUpperCase();
    const headers: Record<string, string> = { ...(params.headers || {}) };

    // Attach credentials if present
    if (credentials) {
      if (credentials.authType === 'bearer_token' && credentials.token) {
        headers['Authorization'] = `Bearer ${credentials.token}`;
      } else if (credentials.authType === 'basic_auth' && credentials.username) {
        const authStr = `${credentials.username}:${credentials.password || ''}`;
        headers['Authorization'] = `Basic ${Buffer.from(authStr).toString('base64')}`;
      } else if (credentials.authType === 'api_key' && credentials.apiKey) {
        headers[credentials.headerName || 'X-API-Key'] = credentials.apiKey;
      }
    }

    let bodyData: BodyInit | undefined = undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (typeof params.body === 'object' && params.body !== null) {
        bodyData = JSON.stringify(params.body);
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      } else if (typeof params.body === 'string') {
        bodyData = params.body;
      }
    }

    const start = Date.now();
    const timeoutMs = Number(params.timeoutMs || 10000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(validatedUrl.toString(), {
        method,
        headers,
        body: bodyData,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const contentType = response.headers.get('content-type') || '';

      let responseData: any;
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
        durationMs: latencyMs,
        requestUrl: validatedUrl.toString(),
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      throw err;
    }
  }
}

export const httpAdapter = new HttpAdapter();

