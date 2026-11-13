import { aiProviderRegistry } from './aiProviderRegistry';
import { aiUsageStore } from '../../lib/storage/aiUsageStore';
import { executionStore } from '../../lib/storage/executionStore';
import { buildErrorAnalysisSystemPrompt } from './promptTemplates';
import { AIProviderId, AITokenUsage } from './types';

export interface ErrorDiagnosisResult {
  summary: string;
  rootCause: string;
  isHypothesis: boolean;
  suggestedFixes: string[];
  confidenceScore: number;
  nodeName?: string;
  nodeType?: string;
  originalError?: string;
  usage: AITokenUsage;
}

export class ErrorAssistant {
  /**
   * Diagnose a failed workflow execution or step using AI
   */
  public static async diagnose(
    executionId: string,
    failedNodeId?: string,
    options?: {
      provider?: AIProviderId;
      model?: string;
      workspaceId?: string;
    }
  ): Promise<ErrorDiagnosisResult> {
    const execution = await executionStore.getById(executionId);
    if (!execution) {
      throw new Error(`Execution record "${executionId}" not found.`);
    }

    // Locate failed trace
    const traces = Array.isArray(execution.traces) ? execution.traces : [];
    let failedTrace = traces.find((t) => t.status === 'FAILED');
    if (failedNodeId) {
      const explicitTrace = traces.find((t) => t.nodeId === failedNodeId);
      if (explicitTrace) failedTrace = explicitTrace;
    }

    const failedTraceError = typeof failedTrace?.error === 'string' ? failedTrace.error : '';
    const execErrorMsg = typeof execution.error === 'string' ? execution.error : '';
    const errorDetails = {
      executionId: execution.id,
      workflowName: execution.workflowName,
      status: execution.status,
      failedNodeId: failedTrace?.nodeId || 'unknown',
      nodeName: failedTrace?.nodeName || 'Failed Step',
      nodeType: failedTrace?.nodeType || 'action.unknown',
      errorMessage: failedTraceError || execErrorMsg || 'Unknown execution failure',
      nodeInput: failedTrace?.input,
      retryCount: failedTrace?.retryCount ?? execution.retryCount,
    };

    const systemPrompt = buildErrorAnalysisSystemPrompt();
    const chatResponse = await aiProviderRegistry.chat(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Please analyze this execution failure:\n\n${JSON.stringify(errorDetails, null, 2)}`,
        },
      ],
      {
        responseFormat: 'json',
        model: options?.model,
      },
      options?.provider
    );

    aiUsageStore.recordUsage(
      chatResponse.provider,
      chatResponse.model,
      'error_assistant',
      chatResponse.usage,
      chatResponse.durationMs,
      options?.workspaceId || 'ws_default'
    );

    const parsed = chatResponse.parsedJson || {};

    return {
      summary: parsed.summary || 'Execution Failure Identified',
      rootCause: parsed.rootCause || errorDetails.errorMessage,
      isHypothesis: Boolean(parsed.isHypothesis),
      suggestedFixes: Array.isArray(parsed.suggestedFixes)
        ? parsed.suggestedFixes
        : ['Verify node configuration parameters.', 'Check network and upstream credentials.'],
      confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.9,
      nodeName: errorDetails.nodeName,
      nodeType: errorDetails.nodeType,
      originalError: errorDetails.errorMessage,
      usage: chatResponse.usage,
    };
  }
}
