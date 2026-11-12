export type IntegrationCategory =
  | 'trigger'
  | 'action'
  | 'communication'
  | 'productivity'
  | 'storage'
  | 'developer';

export type IntegrationAuthType =
  | 'none'
  | 'api_key'
  | 'bearer_token'
  | 'basic_auth'
  | 'oauth2'
  | 'smtp'
  | 'hmac';

export interface CredentialFieldSchema {
  name: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select';
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface IntegrationTriggerDefinition {
  id: string;
  name: string;
  description: string;
  outputSchema?: Record<string, unknown>;
}

export interface IntegrationActionDefinition {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface IntegrationDefinition {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  icon: string;
  version: string;
  authType: IntegrationAuthType;
  credentialFields: CredentialFieldSchema[];
  triggers: IntegrationTriggerDefinition[];
  actions: IntegrationActionDefinition[];
  docsUrl?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface IntegrationAdapter {
  integrationId: string;
  testConnection(credentials: Record<string, any>): Promise<ConnectionTestResult>;
  executeAction(
    actionId: string,
    params: Record<string, any>,
    credentials?: Record<string, any>
  ): Promise<Record<string, any>>;
}
