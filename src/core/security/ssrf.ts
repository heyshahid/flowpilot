export class SSRFProtectionViolationException extends Error {
  constructor(message: string) {
    super(`[SSRF Guard Security Violation] ${message}`);
    this.name = 'SSRFProtectionViolationException';
  }
}

/**
 * Checks whether an IP or hostname is private, loopback, link-local, or cloud metadata.
 */
export function isForbiddenHostOrIp(hostOrIp: string): boolean {
  const normalized = hostOrIp.trim().toLowerCase();

  // Localhost names
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '0.0.0.0'
  ) {
    return true;
  }

  // Cloud metadata endpoint (AWS, GCP, Azure, DigitalOcean)
  if (normalized === '169.254.169.254' || normalized.startsWith('169.254.')) {
    return true;
  }

  // IPv4 Private Ranges Check (RFC 1918)
  const ipv4Match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octet1 = parseInt(ipv4Match[1], 10);
    const octet2 = parseInt(ipv4Match[2], 10);

    // 10.0.0.0/8 (Private Network)
    if (octet1 === 10) return true;

    // 172.16.0.0/12 (Private Network 172.16.x.x - 172.31.x.x)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;

    // 192.168.0.0/16 (Private Local Network)
    if (octet1 === 192 && octet2 === 168) return true;

    // 127.0.0.0/8 (Loopback)
    if (octet1 === 127) return true;

    // 0.0.0.0/8
    if (octet1 === 0) return true;
  }

  return false;
}

/**
 * Validates an outbound URL against SSRF policy.
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
