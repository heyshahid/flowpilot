/**
 * FlowPilot Authentication Notification Service
 * Phase 10C-B3: Authentication Backend Routes
 *
 * Implements decoupled email notification handling with mandatory security constraints:
 * - Production must fail closed immediately if an unapproved/console provider is configured.
 * - Raw tokens and complete token URLs must never be emitted in production logs.
 * - InMemoryEmailCaptureProvider provides deterministic token capture for automated tests.
 * - ConsoleEmailProvider is strictly confined to local development when explicitly enabled.
 */

export interface CapturedEmail {
  toEmail: string;
  name: string;
  subject: string;
  type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'SECURITY_ALERT';
  rawToken?: string;
  details?: string;
  timestamp: Date;
}

export interface AuthNotificationService {
  sendVerificationEmail(toEmail: string, name: string, rawToken: string): Promise<void>;
  sendPasswordResetEmail(toEmail: string, name: string, rawToken: string): Promise<void>;
  sendSecurityAlertEmail(toEmail: string, name: string, alertDetails: string): Promise<void>;
}

/**
 * In-memory email provider for deterministic automated testing.
 * Captures outgoing emails in memory without network calls.
 */
export class InMemoryEmailCaptureProvider implements AuthNotificationService {
  private capturedEmails: CapturedEmail[] = [];

  public async sendVerificationEmail(toEmail: string, name: string, rawToken: string): Promise<void> {
    this.capturedEmails.push({
      toEmail,
      name,
      subject: 'Verify your FlowPilot account',
      type: 'EMAIL_VERIFICATION',
      rawToken,
      timestamp: new Date(),
    });
  }

  public async sendPasswordResetEmail(toEmail: string, name: string, rawToken: string): Promise<void> {
    this.capturedEmails.push({
      toEmail,
      name,
      subject: 'Reset your FlowPilot password',
      type: 'PASSWORD_RESET',
      rawToken,
      timestamp: new Date(),
    });
  }

  public async sendSecurityAlertEmail(toEmail: string, name: string, alertDetails: string): Promise<void> {
    this.capturedEmails.push({
      toEmail,
      name,
      subject: 'Security Alert: Unusual Activity on FlowPilot',
      type: 'SECURITY_ALERT',
      details: alertDetails,
      timestamp: new Date(),
    });
  }

  public getCapturedEmails(): CapturedEmail[] {
    return [...this.capturedEmails];
  }

  public clear(): void {
    this.capturedEmails = [];
  }
}

/**
 * Development-only console logger.
 * Emits structured verification and reset links to the local terminal for testing.
 * CATEGORICALLY FORBIDDEN in production.
 */
export class ConsoleEmailProvider implements AuthNotificationService {
  private baseUrl: string;

  constructor(baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async sendVerificationEmail(toEmail: string, name: string, rawToken: string): Promise<void> {
    const link = `${this.baseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
    console.log(`[AUTH_EMAIL_DEV] Verification email for ${name} <${toEmail}>: ${link}`);
  }

  public async sendPasswordResetEmail(toEmail: string, name: string, rawToken: string): Promise<void> {
    const link = `${this.baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    console.log(`[AUTH_EMAIL_DEV] Password reset email for ${name} <${toEmail}>: ${link}`);
  }

  public async sendSecurityAlertEmail(toEmail: string, name: string, alertDetails: string): Promise<void> {
    console.log(`[AUTH_EMAIL_DEV] Security alert for ${name} <${toEmail}>: ${alertDetails}`);
  }
}

// Global test instance
export const testEmailCapture = new InMemoryEmailCaptureProvider();

/**
 * Resolves the active notification service.
 * Enforces fail-closed configuration in production.
 */
export function getAuthNotificationService(): AuthNotificationService {
  const env = process.env.NODE_ENV;
  const provider = process.env.AUTH_EMAIL_PROVIDER;

  // 1. Test environment uses in-memory capture
  if (env === 'test') {
    return testEmailCapture;
  }

  // 2. Production fail-closed enforcement
  if (env === 'production') {
    if (!provider || provider === 'console' || provider === 'stub' || provider === 'memory') {
      throw new Error(
        'FATAL CONFIGURATION ERROR: No approved production email provider configured. ' +
        'Console/stub email providers are strictly prohibited in production. ' +
        'Tokens must never be emitted into production logs.'
      );
    }

    throw new Error(
      `FATAL CONFIGURATION ERROR: Production email provider '${provider}' is not yet initialized. ` +
      'Production deployment requires an approved production email integration.'
    );
  }

  // 3. Local development
  if (process.env.AUTH_DEV_EMAIL_LOGGING === 'true' || provider === 'console') {
    return new ConsoleEmailProvider();
  }

  // Silent fallback in dev if not explicitly enabled
  return {
    sendVerificationEmail: async () => {},
    sendPasswordResetEmail: async () => {},
    sendSecurityAlertEmail: async () => {},
  };
}
