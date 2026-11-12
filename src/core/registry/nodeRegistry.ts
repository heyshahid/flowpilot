import { z } from 'zod';
import { NodeCategory } from '../types/workflow';

export interface PortDefinition {
  id: string;
  name: string;
  label?: string;
  description?: string;
}

export interface NodeDefinition<TConfig = Record<string, unknown>> {
  type: string;
  displayName: string;
  description: string;
  category: NodeCategory;
  icon: string;
  version: number;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  defaultConfig: TConfig;
  configSchema: z.ZodSchema<TConfig>;
  validate(config: unknown): { isValid: boolean; errors: string[] };
}

// -----------------------------------------------------------------------------
// 1. TRIGGERS SCHEMAS
// -----------------------------------------------------------------------------

export const ManualTriggerSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  samplePayload: z.record(z.unknown()).default({}),
});

export const WebhookTriggerSchema = z.object({
  httpMethod: z.enum(['POST', 'GET', 'ANY']).default('POST'),
  authRequired: z.boolean().default(false),
  secretHeader: z.string().optional(),
  responseStatusCode: z.number().int().default(200),
  expectedFormat: z.enum(['json', 'form', 'text']).default('json'),
});

export const ScheduleTriggerSchema = z.object({
  cronExpression: z.string().min(1, 'Cron expression is required'),
  timezone: z.string().default('UTC'),
});

// -----------------------------------------------------------------------------
// 2. ACTIONS SCHEMAS
// -----------------------------------------------------------------------------

export const HttpRequestSchema = z.object({
  url: z.string().min(1, 'Target URL is required').url('Must be a valid HTTP/HTTPS URL'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  headers: z.record(z.string()).default({}),
  queryParams: z.record(z.string()).default({}),
  bodyContent: z.string().optional(),
  timeoutMs: z.number().int().min(500).max(60000).default(30000),
  continueOnError: z.boolean().default(false),
});

export const SendEmailSchema = z.object({
  to: z.string().min(1, 'Recipient email is required'),
  subject: z.string().min(1, 'Subject line is required'),
  content: z.string().min(1, 'Email body is required'),
  fromName: z.string().default('FlowPilot Automation'),
});

export const SendNotificationSchema = z.object({
  channel: z.enum(['in_app', 'slack_webhook', 'telegram']).default('in_app'),
  message: z.string().min(1, 'Notification message is required'),
});

// -----------------------------------------------------------------------------
// 3. LOGIC SCHEMAS
// -----------------------------------------------------------------------------

export const IfElseSchema = z.object({
  field: z.string().min(1, 'Expression or variable field is required'),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'greater_than',
    'less_than',
    'is_empty',
    'is_not_empty',
  ]).default('equals'),
  value: z.string().default(''),
});

export const FilterSchema = z.object({
  field: z.string().min(1, 'Filter field expression is required'),
  condition: z.enum(['exists', 'does_not_exist', 'is_truthy', 'is_falsy']).default('is_truthy'),
});

export const MergeSchema = z.object({
  mode: z.enum(['wait_all', 'pass_through']).default('wait_all'),
});

// -----------------------------------------------------------------------------
// 4. DATA SCHEMAS
// -----------------------------------------------------------------------------

export const SetVariableSchema = z.object({
  variableName: z.string().min(1, 'Variable name is required'),
  value: z.string().min(1, 'Value is required'),
});

export const DataTransformSchema = z.object({
  inputVariable: z.string().default(''),
  transformationType: z.enum(['json_stringify', 'json_parse', 'uppercase', 'lowercase', 'trim']).default('json_stringify'),
  outputVariableName: z.string().default('result'),
});

export const JsonParserSchema = z.object({
  sourceProperty: z.string().min(1, 'Source property is required'),
  outputKey: z.string().default('parsed'),
});

// -----------------------------------------------------------------------------
// 5. AI SCHEMAS
// -----------------------------------------------------------------------------

export const AiTextGenSchema = z.object({
  provider: z.enum(['gemini', 'openai']).default('gemini'),
  model: z.string().default('gemini-2.5-flash'),
  userPrompt: z.string().min(1, 'Prompt text is required'),
  temperature: z.number().min(0).max(1).default(0.7),
  outputFormat: z.enum(['text', 'json']).default('text'),
});

export const AiClassificationSchema = z.object({
  inputText: z.string().min(1, 'Input text is required'),
  categories: z.array(z.string()).min(2, 'At least 2 categories required').default(['Lead', 'Support', 'Spam']),
});

export const AiSummarizationSchema = z.object({
  inputText: z.string().min(1, 'Input text to summarize is required'),
  maxLength: z.enum(['short', 'medium', 'detailed']).default('medium'),
});

// -----------------------------------------------------------------------------
// HELPER TO CREATE DEFINITIONS
// -----------------------------------------------------------------------------

function createDefinition<T>(def: {
  type: string;
  displayName: string;
  description: string;
  category: NodeCategory;
  icon: string;
  inputs?: PortDefinition[];
  outputs?: PortDefinition[];
  defaultConfig: T;
  configSchema: z.ZodSchema<T>;
}): NodeDefinition<T> {
  return {
    ...def,
    version: 1,
    inputs: def.inputs || [],
    outputs: def.outputs || [{ id: 'default', name: 'Next' }],
    validate(config: unknown) {
      const result = def.configSchema.safeParse(config);
      if (result.success) {
        return { isValid: true, errors: [] };
      }
      return {
        isValid: false,
        errors: result.error.errors.map((e) => `${e.path.join('.') || 'config'}: ${e.message}`),
      };
    },
  };
}

// -----------------------------------------------------------------------------
// CENTRAL NODE REGISTRY CATALOG
// -----------------------------------------------------------------------------

export const NODE_REGISTRY: Record<string, NodeDefinition<any>> = {
  // Triggers
  'trigger.manual': createDefinition({
    type: 'trigger.manual',
    displayName: 'Manual Trigger',
    description: 'Trigger workflow on-demand with custom test variables.',
    category: 'trigger',
    icon: 'Play',
    inputs: [],
    outputs: [{ id: 'default', name: 'On Trigger' }],
    defaultConfig: { name: 'Manual Trigger', samplePayload: {} },
    configSchema: ManualTriggerSchema,
  }),
  'trigger.webhook': createDefinition({
    type: 'trigger.webhook',
    displayName: 'Webhook Trigger',
    description: 'Listen for incoming POST/GET payloads from external services.',
    category: 'trigger',
    icon: 'Webhook',
    inputs: [],
    outputs: [{ id: 'default', name: 'On Request' }],
    defaultConfig: {
      httpMethod: 'POST',
      authRequired: false,
      responseStatusCode: 200,
      expectedFormat: 'json',
    },
    configSchema: WebhookTriggerSchema,
  }),
  'trigger.schedule': createDefinition({
    type: 'trigger.schedule',
    displayName: 'Scheduled Trigger',
    description: 'Run workflow automatically on a recurring cron cadence.',
    category: 'trigger',
    icon: 'Clock',
    inputs: [],
    outputs: [{ id: 'default', name: 'On Tick' }],
    defaultConfig: { cronExpression: '0 9 * * 1-5', timezone: 'UTC' },
    configSchema: ScheduleTriggerSchema,
  }),

  // Actions
  'action.httpRequest': createDefinition({
    type: 'action.httpRequest',
    displayName: 'HTTP Request',
    description: 'Outbound REST call with SSRF firewall and variable expressions.',
    category: 'action',
    icon: 'Globe',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Response' }],
    defaultConfig: {
      url: 'https://api.example.com/v1/resource',
      method: 'GET',
      headers: {},
      queryParams: {},
      timeoutMs: 30000,
      continueOnError: false,
    },
    configSchema: HttpRequestSchema,
  }),
  'action.sendEmail': createDefinition({
    type: 'action.sendEmail',
    displayName: 'Send Email',
    description: 'Send transactional alerts or welcome emails via SMTP / Resend.',
    category: 'action',
    icon: 'Mail',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Sent' }],
    defaultConfig: {
      to: '',
      subject: '',
      content: '',
      fromName: 'FlowPilot Automation',
    },
    configSchema: SendEmailSchema,
  }),
  'action.sendNotification': createDefinition({
    type: 'action.sendNotification',
    displayName: 'Send Notification',
    description: 'Post structured notifications to in-app feed or messaging channels.',
    category: 'action',
    icon: 'Bell',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Next' }],
    defaultConfig: { channel: 'in_app', message: '' },
    configSchema: SendNotificationSchema,
  }),

  // Logic
  'logic.ifElse': createDefinition({
    type: 'logic.ifElse',
    displayName: 'If / Else Branch',
    description: 'Route execution to TRUE or FALSE paths based on condition rules.',
    category: 'logic',
    icon: 'GitBranch',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [
      { id: 'true', name: 'True', label: 'TRUE' },
      { id: 'false', name: 'False', label: 'FALSE' },
    ],
    defaultConfig: {
      field: '{{ $trigger.payload.amount }}',
      operator: 'greater_than',
      value: '100',
    },
    configSchema: IfElseSchema,
  }),
  'logic.filter': createDefinition({
    type: 'logic.filter',
    displayName: 'Filter',
    description: 'Halt workflow branch if incoming payload does not match condition.',
    category: 'logic',
    icon: 'Filter',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Passed' }],
    defaultConfig: { field: '', condition: 'is_truthy' },
    configSchema: FilterSchema,
  }),
  'logic.merge': createDefinition({
    type: 'logic.merge',
    displayName: 'Merge',
    description: 'Combine multiple execution paths into a unified downstream flow.',
    category: 'logic',
    icon: 'GitMerge',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Merged' }],
    defaultConfig: { mode: 'wait_all' },
    configSchema: MergeSchema,
  }),

  // Data
  'data.setVariable': createDefinition({
    type: 'data.setVariable',
    displayName: 'Set Variable',
    description: 'Define or overwrite a named variable in workflow context.',
    category: 'data',
    icon: 'Sliders',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Next' }],
    defaultConfig: { variableName: 'leadTier', value: 'VIP' },
    configSchema: SetVariableSchema,
  }),
  'data.transform': createDefinition({
    type: 'data.transform',
    displayName: 'Data Transform',
    description: 'Reshape, serialize, or format step payloads.',
    category: 'data',
    icon: 'Cpu',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Transformed' }],
    defaultConfig: {
      inputVariable: '',
      transformationType: 'json_stringify',
      outputVariableName: 'transformedData',
    },
    configSchema: DataTransformSchema,
  }),
  'data.jsonParser': createDefinition({
    type: 'data.jsonParser',
    displayName: 'JSON Parser',
    description: 'Parse raw string into structured JSON object.',
    category: 'data',
    icon: 'FileCode',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Parsed' }],
    defaultConfig: { sourceProperty: 'body', outputKey: 'parsedJson' },
    configSchema: JsonParserSchema,
  }),

  // AI
  'ai.textGeneration': createDefinition({
    type: 'ai.textGeneration',
    displayName: 'AI Text Generator',
    description: 'Prompt LLM models (Gemini / OpenAI) for copy, summary, or JSON.',
    category: 'ai',
    icon: 'Bot',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'AI Output' }],
    defaultConfig: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      userPrompt: '',
      temperature: 0.7,
      outputFormat: 'text',
    },
    configSchema: AiTextGenSchema,
  }),
  'ai.classification': createDefinition({
    type: 'ai.classification',
    displayName: 'AI Classification',
    description: 'Categorize incoming text or requests into predefined buckets.',
    category: 'ai',
    icon: 'Tag',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Category' }],
    defaultConfig: {
      inputText: '',
      categories: ['Sales', 'Support', 'Billing', 'Other'],
    },
    configSchema: AiClassificationSchema,
  }),
  'ai.summarization': createDefinition({
    type: 'ai.summarization',
    displayName: 'AI Summarization',
    description: 'Distill lengthy text, transcripts, or notes into concise summaries.',
    category: 'ai',
    icon: 'FileText',
    inputs: [{ id: 'default', name: 'Input' }],
    outputs: [{ id: 'default', name: 'Summary' }],
    defaultConfig: { inputText: '', maxLength: 'medium' },
    configSchema: AiSummarizationSchema,
  }),
};

/**
 * Get definition by node type safely.
 */
export function getNodeDefinition(type: string): NodeDefinition<any> | undefined {
  return NODE_REGISTRY[type];
}

/**
 * List all registered node definitions.
 */
export function getAllNodeDefinitions(): NodeDefinition<any>[] {
  return Object.values(NODE_REGISTRY);
}

/**
 * List node definitions by category.
 */
export function getNodeDefinitionsByCategory(category: NodeCategory): NodeDefinition<any>[] {
  return Object.values(NODE_REGISTRY).filter((n) => n.category === category);
}

