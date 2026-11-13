import { describe, it, expect, beforeEach } from 'vitest';
import { aiProviderRegistry } from '../src/core/ai/aiProviderRegistry';
import { MockAIProvider } from '../src/core/ai/providers/mockProvider';
import { WorkflowGenerator } from '../src/core/ai/workflowGenerator';
import { GraphRefiner } from '../src/core/ai/graphRefiner';
import { WorkflowExplainer } from '../src/core/ai/workflowExplainer';
import { ErrorAssistant } from '../src/core/ai/errorAssistant';
import { WorkflowOptimizer } from '../src/core/ai/workflowOptimizer';
import { SmartConfigSuggester } from '../src/core/ai/smartConfigSuggester';
import {
  aiDataExtractionDriver,
  aiClassificationDriver,
  aiSummarizationDriver,
} from '../src/core/runtime/drivers/aiDataExtract';
import { textGenerationDriver } from '../src/core/runtime/drivers/textGeneration';
import { aiUsageStore } from '../src/lib/storage/aiUsageStore';
import { aiConversationStore } from '../src/lib/storage/aiConversationStore';
import { getNodeDefinition } from '../src/core/registry/nodeRegistry';

describe('Phase 7: AI Workflow Assistant & Intelligent Automation', () => {
  beforeEach(() => {
    // Ensure deterministic mock provider is active for test suite
    aiProviderRegistry.setActiveProvider('mock');
  });

  // ---------------------------------------------------------------------------
  // 1. AI Provider Abstraction & Security
  // ---------------------------------------------------------------------------
  describe('1. AI Provider Abstraction & Secrets Redaction', () => {
    it('should register and list all supported AI providers', () => {
      const providers = aiProviderRegistry.listProviders();
      const ids = providers.map((p) => p.id);

      expect(ids).toContain('mock');
      expect(ids).toContain('openai');
      expect(ids).toContain('anthropic');
      expect(ids).toContain('gemini');
    });

    it('should successfully test connection on the mock provider', async () => {
      const result = await aiProviderRegistry.testProvider('mock');
      expect(result.success).toBe(true);
      expect(result.message).toContain('active and operational');
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it('should redact sensitive credentials from outbound prompts', () => {
      const mockProvider = new MockAIProvider();
      const rawText = 'User token Bearer secret_token_12345678901234567890 and webhook fpsec_981249812498124819241924';
      const redacted = mockProvider.redactSecrets(rawText);

      expect(redacted).not.toContain('secret_token_12345678901234567890');
      expect(redacted).not.toContain('fpsec_981249812498124819241924');
      expect(redacted).toContain('[REDACTED_TOKEN]');
      expect(redacted).toContain('[REDACTED_WEBHOOK_SECRET]');
    });

    it('should switch active provider and model', () => {
      aiProviderRegistry.setActiveProvider('mock', 'custom-mock-v2');
      expect(aiProviderRegistry.getActiveModel()).toBe('custom-mock-v2');
      aiProviderRegistry.setActiveProvider('mock');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Natural Language Workflow Generation & Validation
  // ---------------------------------------------------------------------------
  describe('2. Natural Language Workflow Generation & Registry Validation', () => {
    it('should generate a valid visual workflow DAG from a prompt', async () => {
      const prompt = 'When a customer submits a form, check their budget > $5000, send an urgent notification to Slack, and email welcome.';
      const proposal = await WorkflowGenerator.generate(prompt);

      expect(proposal.name).toBeDefined();
      expect(proposal.nodes.length).toBeGreaterThanOrEqual(3);
      expect(proposal.edges.length).toBeGreaterThanOrEqual(2);
      expect(proposal.isValid).toBe(true);
      expect(proposal.validationErrors.length).toBe(0);

      // Verify every node belongs to official registry
      for (const node of proposal.nodes) {
        const def = getNodeDefinition(node.data.type);
        expect(def).toBeDefined();
        expect(def?.category).toBe(node.data.category);
      }

      // Root node must be a trigger
      expect(proposal.nodes[0].data.category).toBe('trigger');
    });

    it('should identify required integrations and missing credentials', async () => {
      const prompt = 'Capture form leads and alert Slack #vip-leads';
      const proposal = await WorkflowGenerator.generate(prompt);

      expect(proposal.requiredIntegrations).toContain('slack');
      expect(proposal.explanation).toBeDefined();
      expect(proposal.usage.totalTokens).toBeGreaterThan(0);
    });

    it('should reject empty prompts', async () => {
      await expect(WorkflowGenerator.generate('')).rejects.toThrow('User prompt cannot be empty');
    });

    it('should refine an existing workflow based on follow-up prompt', async () => {
      const initial = await WorkflowGenerator.generate('Webhook form lead');
      const refined = await GraphRefiner.refine(
        {
          name: initial.name,
          nodes: initial.nodes,
          edges: initial.edges,
        },
        'Add a condition to check if customer is from USA'
      );

      expect(refined.isValid).toBe(true);
      expect(refined.nodes.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Workflow Explanation & Analysis
  // ---------------------------------------------------------------------------
  describe('3. Workflow Explanation', () => {
    it('should generate a step-by-step breakdown and edge-case analysis', async () => {
      const dummyWorkflow = {
        name: 'Lead Routing Workflow',
        description: 'Automates customer qualification',
        nodes: [
          {
            id: 'n1',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: { label: 'Webhook Trigger', type: 'trigger.webhook', category: 'trigger', config: {} },
          },
          {
            id: 'n2',
            type: 'custom',
            position: { x: 0, y: 150 },
            data: { label: 'Check Budget', type: 'logic.ifElse', category: 'logic', config: {} },
          },
        ] as any[],
        edges: [
          { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'default', targetHandle: 'default' },
        ] as any[],
      };

      const explanation = await WorkflowExplainer.explain(dummyWorkflow);
      expect(explanation.overview).toBeDefined();
      expect(explanation.stepBreakdown.length).toBeGreaterThanOrEqual(1);
      expect(explanation.potentialFailurePoints.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. AI Error Diagnosis & Optimization
  // ---------------------------------------------------------------------------
  describe('4. AI Error Diagnosis & Optimization', () => {
    it('should diagnose an execution failure and return actionable fixes', async () => {
      // Use existing seed execution or fallback
      const diagnosis = await ErrorAssistant.diagnose('exec_8fa1b920');

      expect(diagnosis.summary).toBeDefined();
      expect(diagnosis.rootCause).toBeDefined();
      expect(diagnosis.suggestedFixes.length).toBeGreaterThanOrEqual(1);
      expect(diagnosis.confidenceScore).toBeGreaterThan(0.5);
    });

    it('should inspect workflow graph and suggest reliability optimizations', async () => {
      const unoptimizedWorkflow = {
        name: 'Unprotected HTTP Poller',
        nodes: [
          {
            id: 'n1',
            data: {
              label: 'External Call',
              type: 'action.httpRequest',
              category: 'action',
              config: { url: 'https://api.example.com', continueOnError: false },
            },
            position: { x: 0, y: 0 },
          },
          {
            id: 'n2',
            data: {
              label: 'Unbounded Batch Loop',
              type: 'logic.loop',
              category: 'logic',
              config: { maxIterations: 1000 },
            },
            position: { x: 0, y: 150 },
          },
        ] as any[],
        edges: [] as any[],
      };

      const result = await WorkflowOptimizer.analyze(unoptimizedWorkflow);
      expect(result.optimizations.length).toBeGreaterThanOrEqual(1);
      const issues = result.optimizations.map((o) => o.type);
      expect(issues).toContain('reliability');
    });

    it('should suggest tailored configuration for node types', async () => {
      const emailConfig = await SmartConfigSuggester.suggest(
        'action.sendEmail',
        'Send welcome email to lead with demo booking link'
      );
      expect(emailConfig.suggestedConfig.subject).toBeDefined();
      expect(emailConfig.suggestedConfig.content).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. AI Runtime Node Drivers
  // ---------------------------------------------------------------------------
  describe('5. AI Runtime Node Execution Drivers', () => {
    const mockContext: any = {
      executionId: 'exec_test_ai_runtime',
      nodeId: 'node_ai_test',
      workflowId: 'wf_ai_test',
      variables: {},
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    };

    it('should execute textGenerationDriver', async () => {
      const res = await textGenerationDriver(mockContext, {
        prompt: 'Write a headline for automated CRM',
      });
      expect(res.success).toBe(true);
      expect(res.text).toBeDefined();
      expect(res.tokens).toBeGreaterThan(0);
    });

    it('should execute aiClassificationDriver', async () => {
      const res = await aiClassificationDriver(mockContext, {
        inputText: 'I want to purchase the enterprise plan with 50 seats',
        categories: ['Sales', 'Support', 'Billing'],
      });
      expect(res.success).toBe(true);
      expect(res.category).toBe('Sales');
      expect(res.confidence).toBeGreaterThan(0.9);
    });

    it('should execute aiSummarizationDriver', async () => {
      const longText = 'FlowPilot is a visual workflow automation builder. It connects apps without coding. It features an intelligent AI assistant.';
      const res = await aiSummarizationDriver(mockContext, {
        inputText: longText,
        maxLength: 'short',
      });
      expect(res.success).toBe(true);
      expect(res.summary).toBeDefined();
      expect(res.summaryLength).toBeLessThanOrEqual(longText.length);
    });

    it('should execute aiDataExtractionDriver and extract structured fields', async () => {
      const text = 'Hello, my name is Bruce Wayne, my contact email is bruce@wayne-enterprises.com, reach out anytime.';
      const res = await aiDataExtractionDriver(mockContext, {
        inputText: text,
      });
      expect(res.success).toBe(true);
      expect(res.extracted.email).toBe('bruce@wayne-enterprises.com');
      expect(res.extracted.name).toBe('Bruce Wayne');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Token Usage & Conversation Storage
  // ---------------------------------------------------------------------------
  describe('6. Token Usage & Conversation Stores', () => {
    it('should record and aggregate token usage metrics', () => {
      aiUsageStore.recordUsage(
        'mock',
        'flowpilot-mock-v1',
        'generate_workflow',
        { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCostUsd: 0.0001 },
        350
      );

      const summary = aiUsageStore.getSummary('ws_default');
      expect(summary.totalRequests).toBeGreaterThan(0);
      expect(summary.totalTokens).toBeGreaterThan(0);
      expect(summary.byProvider['mock']).toBeDefined();
    });

    it('should create, append messages, and delete AI conversations', () => {
      const conv = aiConversationStore.create('Test AI Session', 'ws_test');
      expect(conv.id).toBeDefined();
      expect(conv.title).toBe('Test AI Session');

      const msg = aiConversationStore.addMessage(conv.id, 'user', 'Hello AI');
      expect(msg.content).toBe('Hello AI');

      const fetched = aiConversationStore.getById(conv.id);
      expect(fetched?.messages.length).toBe(1);

      const deleted = aiConversationStore.delete(conv.id);
      expect(deleted).toBe(true);
      expect(aiConversationStore.getById(conv.id)).toBeUndefined();
    });
  });
});
