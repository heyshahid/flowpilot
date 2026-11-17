import http from 'http';
import https from 'https';
import dns from 'dns';
import { URL } from 'url';

export class SSRFProtectionViolationException extends Error {
  constructor(message: string) {
    super(`[SSRF Guard Security Violation] ${message}`);
    this.name = 'SSRFProtectionViolationException';
  }
}

/**
 * Checks whether an IP address (IPv4 or IPv6) is private, loopback, link-local,
 * multicast, carrier-grade NAT, or cloud metadata.
 */
export function isForbiddenIpAddress(ip: string): boolean {
  let cleanIp = ip.trim().toLowerCase();

  // Strip brackets if provided e.g. [::1] or [127.0.0.1]
  if (cleanIp.startsWith('[') && cleanIp.endsWith(']')) {
    cleanIp = cleanIp.slice(1, -1);
  }

  // Strip IPv4-mapped IPv6 prefix: ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (cleanIp.startsWith('::ffff:')) {
    const remainder = cleanIp.slice(7);
    if (remainder.includes('.')) {
      cleanIp = remainder;
    } else {
      // Hex representation of IPv4-mapped IPv6 e.g. ::ffff:7f00:0001 or ::ffff:a00:1
      const parts = remainder.split(':');
      if (parts.length === 2) {
        const high = parseInt(parts[0], 16);
        const low = parseInt(parts[1], 16);
        if (!isNaN(high) && !isNaN(low)) {
          const o1 = (high >> 8) & 0xff;
          const o2 = high & 0xff;
          const o3 = (low >> 8) & 0xff;
          const o4 = low & 0xff;
          cleanIp = `${o1}.${o2}.${o3}.${o4}`;
        }
      }
    }
  }

  // Check IPv4 format
  const ipv4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const o1 = parseInt(ipv4Match[1], 10);
    const o2 = parseInt(ipv4Match[2], 10);
    const o3 = parseInt(ipv4Match[3], 10);
    const o4 = parseInt(ipv4Match[4], 10);

    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) {
      return true; // Malformed / out of range
    }

    // 0.0.0.0/8 (Current network / "this" host)
    if (o1 === 0) return true;

    // 10.0.0.0/8 (RFC 1918 Private)
    if (o1 === 10) return true;

    // 100.64.0.0/10 (Carrier-Grade NAT / RFC 6598: 100.64.0.0 - 100.127.255.255)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;

    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return true;

    // 169.254.0.0/16 (Link-Local / Cloud Metadata: 169.254.169.254)
    if (o1 === 169 && o2 === 254) return true;

    // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (o1 === 192 && o2 === 0 && o3 === 0) return true;

    // 192.0.2.0/24 (TEST-NET-1)
    if (o1 === 192 && o2 === 0 && o3 === 2) return true;

    // 192.168.0.0/16 (RFC 1918 Private)
    if (o1 === 192 && o2 === 168) return true;

    // 198.18.0.0/15 (Network benchmark tests: 198.18.0.0 - 198.19.255.255)
    if (o1 === 198 && (o2 === 18 || o2 === 19)) return true;

    // 198.51.100.0/24 (TEST-NET-2)
    if (o1 === 198 && o2 === 51 && o3 === 100) return true;

    // 203.0.113.0/24 (TEST-NET-3)
    if (o1 === 203 && o2 === 0 && o3 === 113) return true;

    // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
    if (o1 >= 224 && o1 <= 239) return true;

    // 240.0.0.0/4 (Reserved / Future use / Broadcast 255.255.255.255)
    if (o1 >= 240) return true;

    return false;
  }

  // Check IPv6 patterns
  if (cleanIp.includes(':')) {
    // Unspecified address ::
    if (cleanIp === '::') return true;

    // Loopback ::1
    if (cleanIp === '::1') return true;

    // Unique Local Addresses (fc00::/7 -> fc.. or fd..)
    if (/^f[cd][0-9a-f]{2}:/i.test(cleanIp) || cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true;
    }

    // Link-Local Unicast (fe80::/10 -> fe8.. to feb..)
    if (/^fe[89ab][0-9a-f]:/i.test(cleanIp) || cleanIp.startsWith('fe80:')) {
      return true;
    }

    // Site-Local Unicast (fec0::/10, deprecated)
    if (/^fe[c-f][0-9a-f]:/i.test(cleanIp)) {
      return true;
    }

    // Multicast (ff00::/8)
    if (cleanIp.startsWith('ff') && cleanIp.includes(':')) {
      return true;
    }

    // Discard prefix (100::/64)
    if (cleanIp.startsWith('100::')) return true;

    // Documentation (2001:db8::/32)
    if (cleanIp.startsWith('2001:db8:') || cleanIp.startsWith('2001:0db8:')) return true;
  }

  return false;
}

/**
 * Checks whether an IP or hostname is private, loopback, link-local, or cloud metadata.
 */
export function isForbiddenHostOrIp(hostOrIp: string): boolean {
  let normalized = hostOrIp.trim().toLowerCase();

  // Strip IPv6 brackets if present e.g. [::1] -> ::1
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }

  // Localhost names and mDNS / local suffixes
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.lan') ||
    normalized.endsWith('.home') ||
    normalized.endsWith('.corp') ||
    normalized === '0.0.0.0'
  ) {
    return true;
  }

  // Common cloud metadata domains / IPs
  if (
    normalized === 'metadata.google.internal' ||
    normalized.endsWith('.metadata.google.internal') ||
    normalized === 'instance-data' ||
    normalized === '169.254.169.254' ||
    normalized.startsWith('169.254.')
  ) {
    return true;
  }

  // Check if string is an IP address
  return isForbiddenIpAddress(normalized);
}

/**
 * Validates an outbound URL syntax and hostname against static SSRF policy.
 */
export function validateOutboundUrl(rawUrl: string): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new SSRFProtectionViolationException(`Invalid URL format: "${rawUrl}"`);
  }

  // Enforce HTTP / HTTPS protocol only
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new SSRFProtectionViolationException(
      `Disallowed protocol "${parsedUrl.protocol}". Only "http:" and "https:" are permitted.`
    );
  }

  // Check hostname against SSRF forbidden list
  if (isForbiddenHostOrIp(parsedUrl.hostname)) {
    throw new SSRFProtectionViolationException(
      `Outbound request to internal, loopback, or metadata host "${parsedUrl.hostname}" is blocked.`
    );
  }

  return parsedUrl;
}

/**
 * Resolves a hostname via DNS and validates that ALL returned IP addresses are safe.
 * Returns the validated IP address to pin the socket connection to.
 */
export async function resolveAndValidateHost(
  hostname: string
): Promise<{ pinnedIp: string; family: 4 | 6 }> {
  // If hostname is already a direct literal IP (or bracketed IPv6)
  let cleanHost = hostname.trim();
  if (cleanHost.startsWith('[') && cleanHost.endsWith(']')) {
    cleanHost = cleanHost.slice(1, -1);
  }

  if (isForbiddenHostOrIp(cleanHost)) {
    throw new SSRFProtectionViolationException(
      `Host "${hostname}" matches forbidden IP or internal network policy.`
    );
  }

  // Check if it's an IP literal
  const isIpv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(cleanHost);
  const isIpv6 = cleanHost.includes(':');

  if (isIpv4) {
    if (isForbiddenIpAddress(cleanHost)) {
      throw new SSRFProtectionViolationException(
        `Resolved IP address "${cleanHost}" for host "${hostname}" is forbidden.`
      );
    }
    return { pinnedIp: cleanHost, family: 4 };
  }

  if (isIpv6) {
    if (isForbiddenIpAddress(cleanHost)) {
      throw new SSRFProtectionViolationException(
        `Resolved IP address "${cleanHost}" for host "${hostname}" is forbidden.`
      );
    }
    return { pinnedIp: cleanHost, family: 6 };
  }

  // Resolve all DNS records
  let records: dns.LookupAddress[];
  try {
    records = await dns.promises.lookup(cleanHost, { all: true, verbatim: true });
  } catch (err: any) {
    throw new SSRFProtectionViolationException(
      `DNS lookup failed for host "${hostname}": ${err?.message || 'Host not found'}`
    );
  }

  if (!records || records.length === 0) {
    throw new SSRFProtectionViolationException(
      `DNS resolution for host "${hostname}" returned no IP addresses.`
    );
  }

  // Re-verify EVERY returned IP address against forbidden list (DNS rebinding prevention)
  for (const record of records) {
    if (isForbiddenIpAddress(record.address)) {
      throw new SSRFProtectionViolationException(
        `DNS resolution for host "${hostname}" resolved to forbidden private/internal IP address "${record.address}". Connection blocked.`
      );
    }
  }

  const selected = records[0];
  return {
    pinnedIp: selected.address,
    family: selected.family === 6 ? 6 : 4,
  };
}

export interface SafeHttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxRedirects?: number;
  maxResponseSizeBytes?: number;
}

export interface SafeHttpResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  data: unknown;
  text: string;
  url: string;
  pinnedIp: string;
}

/**
 * Creates a custom DNS lookup function that forces Node's socket layer to dial
 * the pre-resolved, validated IP address.
 */
function createPinnedLookup(pinnedIp: string, family: 4 | 6) {
  return (
    _hostname: string,
    options: any,
    callback: (err: any, addressOrAddresses: any, family?: number) => void
  ) => {
    if (options && options.all) {
      callback(null, [{ address: pinnedIp, family }]);
    } else {
      callback(null, pinnedIp, family);
    }
  };
}

/**
 * Performs a single low-level HTTP/HTTPS request with socket-level IP pinning,
 * preserving TLS SNI and certificate validation.
 */
function executeSinglePinnedRequest(
  targetUrl: URL,
  pinnedIp: string,
  family: 4 | 6,
  options: SafeHttpRequestOptions
): Promise<{
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  bodyBuffer: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;
    const defaultPort = isHttps ? 443 : 80;
    const port = targetUrl.port ? parseInt(targetUrl.port, 10) : defaultPort;

    const requestHeaders = { ...options.headers };
    if (!requestHeaders['Host'] && !requestHeaders['host']) {
      requestHeaders['Host'] = targetUrl.host;
    }
    if (!requestHeaders['User-Agent'] && !requestHeaders['user-agent']) {
      requestHeaders['User-Agent'] = 'FlowPilot-HTTP-Client/1.0';
    }

    const reqOptions: https.RequestOptions = {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: options.method || 'GET',
      headers: requestHeaders,
      lookup: createPinnedLookup(pinnedIp, family),
      // Server Name Indication (SNI) for TLS verification
      servername: isHttps ? targetUrl.hostname : undefined,
    };

    const req = requestFn(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      let totalLength = 0;
      const maxSize = options.maxResponseSizeBytes || 10 * 1024 * 1024; // 10MB limit

      res.on('data', (chunk: Buffer) => {
        totalLength += chunk.length;
        if (totalLength > maxSize) {
          req.destroy(
            new Error(`Response size exceeded maximum allowed limit of ${maxSize} bytes.`)
          );
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (val !== undefined) {
            headers[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : val;
          }
        }

        resolve({
          statusCode: res.statusCode || 200,
          statusMessage: res.statusMessage || '',
          headers,
          bodyBuffer,
        });
      });

      res.on('error', (err) => {
        reject(err);
      });
    });

    // Handle AbortSignal
    if (options.signal) {
      if (options.signal.aborted) {
        req.destroy(new Error('Request aborted by caller signal.'));
        return;
      }
      options.signal.addEventListener('abort', () => {
        req.destroy(new Error('Request aborted by caller signal.'));
      });
    }

    // Handle Timeout
    const timeoutMs = options.timeoutMs || 10000;
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms.`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Executes an outbound HTTP request with comprehensive SSRF defenses:
 * 1. Initial URL syntax and hostname verification.
 * 2. DNS pre-resolution and verification of all returned IPs (DNS Rebinding protection).
 * 3. Socket-level IP pinning using custom lookup with TLS SNI verification.
 * 4. Manual redirect loop (max 5) with cycle detection, re-validation, and cross-origin credential stripping.
 * 5. Response size limits and strict timeout management.
 */
export async function executeSafeHttpRequest(
  rawUrl: string,
  options: SafeHttpRequestOptions = {}
): Promise<SafeHttpResponse> {
  const maxRedirects = options.maxRedirects ?? 5;
  const visitedUrls = new Set<string>();

  let currentUrl = validateOutboundUrl(rawUrl);
  let currentMethod = (options.method || 'GET').toUpperCase();
  let currentHeaders: Record<string, string> = { ...(options.headers || {}) };
  let currentBody = options.body;
  let redirectCount = 0;
  let lastPinnedIp = '';

  while (true) {
    const urlString = currentUrl.toString();
    if (visitedUrls.has(urlString)) {
      throw new SSRFProtectionViolationException(
        `Redirect loop detected for target "${urlString}".`
      );
    }
    visitedUrls.add(urlString);

    // 1. Resolve and validate hostname against DNS rebinding
    const { pinnedIp, family } = await resolveAndValidateHost(currentUrl.hostname);
    lastPinnedIp = pinnedIp;

    // 2. Execute pinned request
    const response = await executeSinglePinnedRequest(currentUrl, pinnedIp, family, {
      ...options,
      method: currentMethod,
      headers: currentHeaders,
      body: currentBody,
    });

    const isRedirect = [301, 302, 303, 307, 308].includes(response.statusCode);

    if (isRedirect) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new SSRFProtectionViolationException(
          `Maximum redirect limit (${maxRedirects}) exceeded.`
        );
      }

      const location = response.headers['location'];
      if (!location) {
        throw new SSRFProtectionViolationException(
          `Redirect response (${response.statusCode}) missing "Location" header.`
        );
      }

      // Resolve relative redirects safely
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new SSRFProtectionViolationException(
          `Malformed redirect Location header: "${location}".`
        );
      }

      // Re-validate the redirect target against SSRF policy
      nextUrl = validateOutboundUrl(nextUrl.toString());

      // If redirect cross-origin, strip sensitive headers
      const isCrossOrigin =
        nextUrl.protocol !== currentUrl.protocol ||
        nextUrl.hostname !== currentUrl.hostname ||
        nextUrl.port !== currentUrl.port;

      if (isCrossOrigin) {
        delete currentHeaders['authorization'];
        delete currentHeaders['Authorization'];
        delete currentHeaders['cookie'];
        delete currentHeaders['Cookie'];
        delete currentHeaders['x-api-key'];
        delete currentHeaders['X-API-Key'];
      }

      // For 301, 302, 303: convert POST to GET as per standard HTTP spec
      if ([301, 302, 303].includes(response.statusCode) && currentMethod !== 'HEAD') {
        currentMethod = 'GET';
        currentBody = null;
        delete currentHeaders['content-type'];
        delete currentHeaders['Content-Type'];
        delete currentHeaders['content-length'];
        delete currentHeaders['Content-Length'];
      }

      currentUrl = nextUrl;
      continue;
    }

    // Normal response processing
    const text = response.bodyBuffer.toString('utf-8');
    const contentType = response.headers['content-type'] || '';
    let data: unknown = text;

    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    const ok = response.statusCode >= 200 && response.statusCode < 300;

    return {
      status: response.statusCode,
      statusText: response.statusMessage,
      ok,
      headers: response.headers,
      data,
      text,
      url: currentUrl.toString(),
      pinnedIp: lastPinnedIp,
    };
  }
}
