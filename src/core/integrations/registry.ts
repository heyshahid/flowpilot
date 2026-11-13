import {
  ConnectionTestResult,
  IntegrationAdapter,
  IntegrationDefinition,
} from './types';
import { httpAdapter } from './adapters/httpAdapter';
import { smtpAdapter } from './adapters/smtpAdapter';
import { googleSheetsAdapter } from './adapters/googleSheetsAdapter';
import { slackAdapter } from './adapters/slackAdapter';
import { telegramAdapter } from './adapters/telegramAdapter';

export const INTEGRATION_DEFINITIONS: IntegrationDefinition[] = [
  {
    id: 'webhook',
    name: 'Production Webhooks',
    category: 'trigger',
    description: 'Ingest inbound webhook events with cryptographically secure tokens, HMAC-SHA256 signatures, and replay protection.',
    icon: 'Webhook',
    version: '1.0.0',
    authType: 'hmac',
    credentialFields: [
      {
        name: 'secret',
        label: 'HMAC Signing Secret',
        type: 'password',
        required: false,
        placeholder: 'fpsec_xxxxxxxxxxxxxxxxxxxx',
        description: 'Optional shared secret used to verify X-FlowPilot-Signature or X-Hub-Signature-256.',
      },
    ],
    triggers: [
      {
        id: 'inboundWebhook',
        name: 'Inbound Webhook Trigger',
        description: 'Fires whenever an HTTP POST or GET request hits the unique webhook endpoint.',
        outputSchema: {
          payload: 'Record<string, unknown>',
          headers: 'Record<string, string>',
          method: 'string',
        },
      },
    ],
    actions: [],
    docsUrl: 'https://docs.flowpilot.dev/integrations/webhooks',
  },
  {
    id: 'http',
    name: 'HTTP / REST Client',
    category: 'action',
    description: 'Execute outbound REST API requests with Zero-Trust SSRF protection, custom headers, query params, and JSON payloads.',
    icon: 'Globe',
    version: '1.0.0',
    authType: 'bearer_token',
    credentialFields: [
      {
        name: 'baseUrl',
        label: 'Base API URL',
        type: 'text',
        required: false,
        placeholder: 'https://api.example.com/v1',
      },
      {
        name: 'authType',
        label: 'Authentication Type',
        type: 'select',
        required: true,
        options: [
          { label: 'None', value: 'none' },
          { label: 'Bearer Token', value: 'bearer_token' },
          { label: 'API Key Header', value: 'api_key' },
          { label: 'Basic Auth', value: 'basic_auth' },
        ],
      },
      {
        name: 'token',
        label: 'Bearer Token / Secret',
        type: 'password',
        required: false,
        placeholder: 'eyJhbGciOi...',
      },
      {
        name: 'apiKey',
        label: 'API Key Value',
        type: 'password',
        required: false,
        placeholder: 'sk_live_...',
      },
      {
        name: 'headerName',
        label: 'API Key Header Name',
        type: 'text',
        required: false,
        placeholder: 'X-API-Key',
      },
    ],
    triggers: [],
    actions: [
      {
        id: 'request',
        name: 'Send HTTP Request',
        description: 'Executes an authenticated outbound HTTP request.',
        inputSchema: {
          url: 'string',
          method: 'GET | POST | PUT | PATCH | DELETE',
          headers: 'Record<string, string>',
          body: 'Record<string, unknown> | string',
          timeoutMs: 'number',
        },
        outputSchema: {
          status: 'number',
          statusText: 'string',
          data: 'any',
          headers: 'Record<string, string>',
        },
      },
    ],
    docsUrl: 'https://docs.flowpilot.dev/integrations/http',
  },
  {
    id: 'smtp',
    name: 'Transactional Email (SMTP)',
    category: 'communication',
    description: 'Deliver transactional emails with custom templates, SSL/TLS encryption, and delivery tracking.',
    icon: 'Mail',
    version: '1.0.0',
    authType: 'smtp',
    credentialFields: [
      {
        name: 'host',
        label: 'SMTP Server Host',
        type: 'text',
        required: true,
        placeholder: 'smtp.sendgrid.net',
      },
      {
        name: 'port',
        label: 'SMTP Port',
        type: 'number',
        required: true,
        placeholder: '587',
      },
      {
        name: 'secure',
        label: 'Use SSL/TLS (Port 465)',
        type: 'boolean',
        required: false,
      },
      {
        name: 'user',
        label: 'SMTP Username / API Key',
        type: 'text',
        required: true,
        placeholder: 'apikey',
      },
      {
        name: 'password',
        label: 'SMTP Password / Secret',
        type: 'password',
        required: true,
        placeholder: '••••••••••••',
      },
      {
        name: 'senderEmail',
        label: 'Default Sender Address',
        type: 'text',
        required: true,
        placeholder: 'notifications@flowpilot.dev',
      },
      {
        name: 'senderName',
        label: 'Sender Display Name',
        type: 'text',
        required: false,
        placeholder: 'FlowPilot Dispatcher',
      },
    ],
    triggers: [],
    actions: [
      {
        id: 'sendEmail',
        name: 'Send Email via SMTP',
        description: 'Dispatches an email message to designated recipients.',
        inputSchema: {
          to: 'string',
          subject: 'string',
          content: 'string',
          from: 'string',
        },
        outputSchema: {
          delivered: 'boolean',
          messageId: 'string',
          recipient: 'string',
          timestamp: 'string',
        },
      },
    ],
    docsUrl: 'https://docs.flowpilot.dev/integrations/smtp',
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    category: 'storage',
    description: 'Read, append, and update rows in Google Sheets spreadsheets automatically via official Google APIs.',
    icon: 'FileSpreadsheet',
    version: '1.0.0',
    authType: 'oauth2',
    credentialFields: [
      {
        name: 'clientId',
        label: 'OAuth 2.0 Client ID',
        type: 'text',
        required: true,
        placeholder: 'xxxxx.apps.googleusercontent.com',
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        placeholder: 'GOCSPX-••••••••',
      },
      {
        name: 'refreshToken',
        label: 'OAuth Refresh Token',
        type: 'password',
        required: true,
        placeholder: '1//04••••••••',
      },
    ],
    triggers: [],
    actions: [
      {
        id: 'readRows',
        name: 'Read Rows',
        description: 'Fetches rows from a spreadsheet and maps columns to structured JSON.',
        inputSchema: { spreadsheetId: 'string', sheetName: 'string', limit: 'number' },
        outputSchema: { rows: 'Array<Record<string, unknown>>', totalRows: 'number' },
      },
      {
        id: 'appendRow',
        name: 'Append Row',
        description: 'Adds a new row at the bottom of the worksheet.',
        inputSchema: { spreadsheetId: 'string', sheetName: 'string', values: 'Record<string, unknown>' },
        outputSchema: { appended: 'boolean', updatedRange: 'string' },
      },
      {
        id: 'updateRow',
        name: 'Update Row',
        description: 'Modifies an existing row by row index.',
        inputSchema: { spreadsheetId: 'string', sheetName: 'string', rowIndex: 'number', values: 'Record<string, unknown>' },
        outputSchema: { updated: 'boolean', rowIndex: 'number' },
      },
    ],
    docsUrl: 'https://docs.flowpilot.dev/integrations/google-sheets',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'communication',
    description: 'Send notifications, rich alerts, and operational messages to Slack channels or direct messages.',
    icon: 'MessageSquare',
    version: '1.0.0',
    authType: 'bearer_token',
    credentialFields: [
      {
        name: 'botToken',
        label: 'Bot User OAuth Token',
        type: 'password',
        required: true,
        placeholder: 'xoxb-••••••••••••',
        description: 'Requires chat:write scope.',
      },
      {
        name: 'defaultChannel',
        label: 'Default Channel',
        type: 'text',
        required: false,
        placeholder: '#general',
      },
    ],
    triggers: [],
    actions: [
      {
        id: 'sendMessage',
        name: 'Send Message to Channel',
        description: 'Posts a message to a Slack channel or user.',
        inputSchema: { channel: 'string', text: 'string' },
        outputSchema: { sent: 'boolean', ts: 'string', channel: 'string' },
      },
    ],
    docsUrl: 'https://docs.flowpilot.dev/integrations/slack',
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    category: 'communication',
    description: 'Deliver instant automated bot alerts and customer updates directly into Telegram groups and chats.',
    icon: 'Bot',
    version: '1.0.0',
    authType: 'api_key',
    credentialFields: [
      {
        name: 'botToken',
        label: 'Telegram Bot Token',
        type: 'password',
        required: true,
        placeholder: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
        description: 'Generated via @BotFather in Telegram.',
      },
      {
        name: 'defaultChatId',
        label: 'Default Chat ID',
        type: 'text',
        required: false,
        placeholder: '-100123456789',
      },
    ],
    triggers: [],
    actions: [
      {
        id: 'sendMessage',
        name: 'Send Bot Message',
        description: 'Delivers a markdown or HTML text message to a designated chat ID.',
        inputSchema: { chatId: 'string', text: 'string', parseMode: 'HTML | Markdown' },
        outputSchema: { sent: 'boolean', messageId: 'number', chatId: 'string' },
      },
    ],
    docsUrl: 'https://docs.flowpilot.dev/integrations/telegram',
  },
];

export class IntegrationRegistry {
  private definitions = new Map<string, IntegrationDefinition>();
  private adapters = new Map<string, IntegrationAdapter>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    for (const def of INTEGRATION_DEFINITIONS) {
      this.definitions.set(def.id, def);
    }

    this.adapters.set('http', httpAdapter);
    this.adapters.set('smtp', smtpAdapter);
    this.adapters.set('google_sheets', googleSheetsAdapter);
    this.adapters.set('slack', slackAdapter);
    this.adapters.set('telegram', telegramAdapter);
  }

  public getAll(): IntegrationDefinition[] {
    return Array.from(this.definitions.values());
  }

  public getById(id: string): IntegrationDefinition | null {
    return this.definitions.get(id) || null;
  }

  public getAdapter(id: string): IntegrationAdapter | null {
    return this.adapters.get(id) || null;
  }

  public async testConnection(
    integrationId: string,
    credentials: Record<string, any>
  ): Promise<ConnectionTestResult> {
    const adapter = this.getAdapter(integrationId);
    if (!adapter) {
      return { ok: false, message: `No connection tester available for integration "${integrationId}".` };
    }
    return adapter.testConnection(credentials);
  }

  public async executeAction(
    integrationId: string,
    actionId: string,
    params: Record<string, any>,
    credentials?: Record<string, any>
  ): Promise<Record<string, any>> {
    const adapter = this.getAdapter(integrationId);
    if (!adapter) {
      throw new Error(`Integration adapter "${integrationId}" was not found.`);
    }
    return adapter.executeAction(actionId, params, credentials);
  }
}

export const integrationRegistry = new IntegrationRegistry();
export const INTEGRATION_REGISTRY = INTEGRATION_DEFINITIONS;
