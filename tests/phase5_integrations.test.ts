import { describe, expect, it } from 'vitest';
import { CredentialVault } from '../src/core/security/vault';
import { credentialStore } from '../src/lib/storage/credentialStore';
import { WebhookSecurityManager } from '../src/core/security/webhookSecurity';
import { httpAdapter } from '../src/core/integrations/adapters/httpAdapter';
import { smtpAdapter } from '../src/core/integrations/adapters/smtpAdapter';
import { googleSheetsAdapter } from '../src/core/integrations/adapters/googleSheetsAdapter';
import { slackAdapter } from '../src/core/integrations/adapters/slackAdapter';
import { telegramAdapter } from '../src/core/integrations/adapters/telegramAdapter';
import { INTEGRATION_REGISTRY } from '../src/core/integrations/registry';
import { workflowStore } from '../src/lib/storage/workflowStore';
import { ExecutionPlanner } from '../src/core/execution/planner';
import { executionQueue } from '../src/core/execution/queue';

describe('Phase 5: Core Integrations & Production Webhooks', () => {
  describe('1. AES-256-GCM Credential Vault & Secret Masking', () => {
    it('should encrypt and decrypt a plaintext secret using AES-256-GCM', () => {
      const secret = 'xoxb-9876543210-9876543210-flowpilot-super-secret-slack-token';
      const encrypted = CredentialVault.encrypt(secret);

      // Format check: iv:tag:ciphertext (3 colon-separated hex strings)
      const parts = encrypted.split(':');
      expect(parts.length).toBe(3);
      expect(parts[0].length).toBe(24); // 12 bytes IV = 24 hex characters
      expect(parts[1].length).toBe(32); // 16 bytes tag = 32 hex characters
      expect(parts[2].length).toBeGreaterThan(0);

      // Decryption check
      const decrypted = CredentialVault.decrypt<string>(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('should throw an authentication error if encrypted payload is tampered', () => {
      const secret = 'smtp-password-secure-123';
      const encrypted = CredentialVault.encrypt(secret);
      const [iv, tag, ciphertext] = encrypted.split(':');

      // Tamper with the authentication tag or ciphertext
      const tamperedTag = (tag.startsWith('aa') ? 'bb' : 'aa') + tag.substring(2);
      const tampered = `${iv}:${tamperedTag}:${ciphertext}`;

      expect(() => {
        CredentialVault.decrypt(tampered);
      }).toThrow();
    });

    it('should encrypt and decrypt complex JSON credential objects', () => {
      const credentials = {
        apiKey: 'sk-live-abcdef1234567890',
        environment: 'production',
        rateLimit: 100,
        headers: { Authorization: 'Bearer test' },
      };

      const encrypted = CredentialVault.encrypt(credentials);
      const decrypted = CredentialVault.decrypt<typeof credentials>(encrypted);

      expect(decrypted.apiKey).toBe('sk-live-abcdef1234567890');
      expect(decrypted.environment).toBe('production');
      expect(decrypted.rateLimit).toBe(100);
      expect(decrypted.headers.Authorization).toBe('Bearer test');
    });

    it('should safely mask secrets preserving last 4 characters without leaking key length', () => {
      expect(CredentialVault.maskSecret('xoxb-12345-67890-abcdef1234')).toBe('xox••••••••1234');
      expect(CredentialVault.maskSecret('short')).toBe('••••••••');
      expect(CredentialVault.maskSecret('')).toBe('••••••••');
    });
  });

  describe('2. Encrypted Credential Store Operations', () => {
    it('should save credential with AES-256-GCM encryption and retrieve masked listing', async () => {
      const saved = await credentialStore.save({
        name: 'Unit Test SendGrid API Key',
        integrationId: 'smtp',
        type: 'api_key',
        data: {
          apiKey: 'mock_sg_key_1234567890abcdefghijklmnopqrstuvwxyz',
          host: 'smtp.sendgrid.net',
          port: 587,
        },
      });

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('Unit Test SendGrid API Key');
      expect(saved.integrationId).toBe('smtp');
      expect(saved.maskedPreview.apiKey).toContain('••••');

      // Verify listing masks decrypted secrets
      const all = await credentialStore.list();
      const found = all.find((c) => c.id === saved.id);
      expect(found).toBeDefined();
      expect((found as any).data).toBeUndefined();

      // Verify decrypted retrieval
      const decrypted = await credentialStore.getDecryptedData<{ apiKey: string }>(saved.id);
      expect(decrypted).toBeDefined();
      expect(decrypted?.apiKey).toBe('mock_sg_key_1234567890abcdefghijklmnopqrstuvwxyz');

      // Cleanup
      await credentialStore.delete(saved.id);
      expect(await credentialStore.getById(saved.id)).toBeNull();
    });
  });

  describe('3. Production Webhook Security & Signatures', () => {
    it('should generate unguessable webhook tokens and HMAC secrets', () => {
      const token = WebhookSecurityManager.generateWebhookToken();
      const secret = WebhookSecurityManager.generateWebhookSecret();

      expect(token).toMatch(/^whk_[a-f0-9]{48}$/);
      expect(secret).toMatch(/^fpsec_[a-f0-9]{64}$/);
    });

    it('should generate and verify valid HMAC-SHA256 signatures with timing-safe comparison', () => {
      const secret = WebhookSecurityManager.generateWebhookSecret();
      const payload = JSON.stringify({ event: 'order.created', total: 499.0, customerId: 'cust_789' });

      const signature = WebhookSecurityManager.computeHmacSignature(payload, secret);
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);

      const isValid = WebhookSecurityManager.verifyHmacSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject tampered payload or forged HMAC signatures', () => {
      const secret = WebhookSecurityManager.generateWebhookSecret();
      const payload = JSON.stringify({ role: 'member', balance: 50 });
      const tamperedPayload = JSON.stringify({ role: 'admin', balance: 999999 });

      const signature = WebhookSecurityManager.computeHmacSignature(payload, secret);

      const isValid = WebhookSecurityManager.verifyHmacSignature(tamperedPayload, signature, secret);
      expect(isValid).toBe(false);
    });

    it('should validate timestamps and block replay attacks older than 300 seconds', () => {
      const now = Math.floor(Date.now() / 1000);
      const freshTimestamp = String(now - 10); // 10 seconds ago
      const replayTimestamp = String(now - 600); // 10 minutes ago
      const futureTimestamp = String(now + 500); // 500 seconds in future

      expect(WebhookSecurityManager.validateTimestamp(freshTimestamp, 300).valid).toBe(true);
      expect(WebhookSecurityManager.validateTimestamp(replayTimestamp, 300).valid).toBe(false);
      expect(WebhookSecurityManager.validateTimestamp(futureTimestamp, 300).valid).toBe(false);
      expect(WebhookSecurityManager.validateTimestamp('invalid-number', 300).valid).toBe(false);
    });

    it('should rate-limit abusive requests exceeding configured sliding window limit', () => {
      const testToken = 'whk_ratelimit_test_token';
      const limit = 5;

      // Send 5 permitted requests
      for (let i = 0; i < limit; i++) {
        const result = WebhookSecurityManager.checkRateLimit(testToken, limit);
        expect(result.allowed).toBe(true);
      }

      // 6th request must be rejected
      const blocked = WebhookSecurityManager.checkRateLimit(testToken, limit);
      expect(blocked.allowed).toBe(false);
    });
  });

  describe('4. Integration Adapters & Connection Testing', () => {
    it('should register all 6 core integrations in Centralized Registry', () => {
      const all = INTEGRATION_REGISTRY;
      expect(all.length).toBe(6);
      expect(all.map((i) => i.id)).toEqual(
        expect.arrayContaining(['webhook', 'http', 'smtp', 'google_sheets', 'slack', 'telegram'])
      );
    });

    it('should enforce SSRF protection in HttpAdapter', async () => {
      // Loopback/private attempts must fail
      const loopbackResult = await httpAdapter.testConnection({
        baseUrl: 'http://127.0.0.1:8080/internal',
      });
      expect(loopbackResult.ok).toBe(false);
      expect(loopbackResult.message).toContain('SSRF');

      const awsMetadataResult = await httpAdapter.testConnection({
        baseUrl: 'http://169.254.169.254/latest/meta-data',
      });
      expect(awsMetadataResult.ok).toBe(false);
      expect(awsMetadataResult.message).toContain('SSRF');

      // Valid public URL test
      const validResult = await httpAdapter.testConnection({
        baseUrl: 'https://api.github.com/users/octocat',
      });
      expect(validResult.ok).toBe(true);
    });

    it('should validate SMTP email configuration and message payload', async () => {
      const validCredentials = {
        host: 'smtp.mailgun.org',
        port: 587,
        secure: false,
        username: 'postmaster@mg.example.com',
        password: 'secret-password',
      };

      const sendResult = await smtpAdapter.executeAction(
        'sendEmail',
        {
          to: 'customer@acme.corp',
          subject: 'Order Confirmation',
          content: 'Your order #45678 has been confirmed.',
        },
        validCredentials
      );

      expect(sendResult.accepted).toBe(true);
      expect(sendResult).toHaveProperty('messageId');
      expect(sendResult).toHaveProperty('delivered', true);

      // Invalid recipient syntax check throws
      await expect(
        smtpAdapter.executeAction(
          'sendEmail',
          {
            to: 'invalid-email-format',
            subject: 'Test',
            content: 'Fail',
          },
          validCredentials
        )
      ).rejects.toThrow('Invalid email address format');
    });

    it('should validate Google Sheets adapter operations', async () => {
      const sheetsCredentials = {
        accessToken: 'ya29.a0AfH6SM-test-mock-oauth-token',
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      };

      // Append row
      const appendResult = await googleSheetsAdapter.executeAction(
        'appendRow',
        {
          spreadsheetId: sheetsCredentials.spreadsheetId,
          sheetName: 'Sheet1',
          values: ['Lead 101', 'contact@lead.com', '$25,000'],
        },
        sheetsCredentials
      );
      expect(appendResult.updatedRows).toBe(1);

      // Read rows
      const readResult = await googleSheetsAdapter.executeAction(
        'readRows',
        {
          spreadsheetId: sheetsCredentials.spreadsheetId,
          range: 'Sheet1!A1:C10',
        },
        sheetsCredentials
      );
      expect(Array.isArray(readResult.rows)).toBe(true);
    });

    it('should validate Slack adapter authentication and message delivery', async () => {
      // Test with invalid token format
      const invalidToken = await slackAdapter.testConnection({
        botToken: 'invalid-token-no-prefix',
      });
      expect(invalidToken.ok).toBe(false);

      // Test with valid token structure
      const validToken = await slackAdapter.testConnection({
        botToken: 'xoxb-1234567890-mock-valid-slack-bot-token',
      });
      expect(validToken.ok).toBe(true);

      // Send message
      const msgResult = await slackAdapter.executeAction(
        'sendMessage',
        {
          channel: '#sales-leads',
          text: 'New qualified lead received from inbound webhook.',
        },
        { botToken: 'xoxb-1234567890-mock-valid-slack-bot-token' }
      );
      expect(msgResult.ok).toBe(true);
      expect(msgResult).toHaveProperty('channel', '#sales-leads');
    });

    it('should validate Telegram adapter bot token and message delivery', async () => {
      // Test with invalid bot token format
      const badToken = await telegramAdapter.testConnection({
        botToken: 'not-a-telegram-token',
      });
      expect(badToken.ok).toBe(false);

      // Test with valid bot token format
      const goodToken = await telegramAdapter.testConnection({
        botToken: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ_1234567',
      });
      expect(goodToken.ok).toBe(true);

      // Send telegram alert
      const tgResult = await telegramAdapter.executeAction(
        'sendMessage',
        {
          chatId: '-1001234567890',
          text: '🚨 Server alert: High webhook traffic spike.',
        },
        { botToken: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ_1234567' }
      );
      expect(tgResult.ok).toBe(true);
      expect(tgResult).toHaveProperty('messageId');
    });
  });

  describe('5. End-to-End Execution of Canonical Workflow (Webhook → HTTP → IF/ELSE → Actions)', () => {
    it('should plan and execute "Home-grown CRM System" canonical workflow with verified branching', async () => {
      const crmWorkflow = workflowStore.getById('wf_crm_sync');
      expect(crmWorkflow).toBeDefined();

      // Verify execution planner topologically orders nodes:
      // node_trigger_webhook -> node_get_record -> node_check_record -> [node_send_email, node_send_notification]
      const plan = ExecutionPlanner.plan(crmWorkflow!);
      expect(plan.orderedNodes.map((n) => n.id)).toEqual([
        'node_trigger_webhook',
        'node_get_record',
        'node_check_record',
        'node_send_email',
        'node_send_notification',
      ]);
      expect(plan.stages.length).toBe(4);

      // Enqueue execution via ExecutionQueue with mock webhook payload
      const queuedJob = await executionQueue.enqueue(crmWorkflow!.id, {
        customerEmail: 'octocat@github.com',
        eventType: 'customer.sync',
      });

      expect(queuedJob.id).toBeDefined();
      expect(queuedJob.id).toMatch(/^exec_/);

      // Wait for async queue worker to process DAG to completion
      const completedRecord = await executionQueue.waitForExecution(queuedJob.id, 10000);

      expect(completedRecord).toBeDefined();
      expect(completedRecord.status).toBe('COMPLETED');
      expect(completedRecord.traces.length).toBe(5);

      // Verify node executions:
      // 1. Webhook trigger succeeded
      const triggerTrace = completedRecord.traces.find((t) => t.nodeId === 'node_trigger_webhook');
      expect(triggerTrace?.status).toBe('COMPLETED');

      // 2. HTTP GET succeeded with real response from api.github.com
      const httpTrace = completedRecord.traces.find((t) => t.nodeId === 'node_get_record');
      expect(httpTrace?.status).toBe('COMPLETED');
      expect(httpTrace?.output).toHaveProperty('status', 200);

      // 3. Condition node evaluated status 200 == 200 -> TRUE
      const ifElseTrace = completedRecord.traces.find((t) => t.nodeId === 'node_check_record');
      expect(ifElseTrace?.status).toBe('COMPLETED');
      expect(ifElseTrace?.output).toHaveProperty('result', true);

      // 4. TRUE branch (node_send_email) was EXECUTED and COMPLETED
      const emailTrace = completedRecord.traces.find((t) => t.nodeId === 'node_send_email');
      expect(emailTrace?.status).toBe('COMPLETED');
      expect(emailTrace?.output).toHaveProperty('accepted', true);

      // 5. FALSE branch (node_send_notification) was correctly SKIPPED
      const notifTrace = completedRecord.traces.find((t) => t.nodeId === 'node_send_notification');
      expect(notifTrace?.status).toBe('SKIPPED');
    });
  });
});
