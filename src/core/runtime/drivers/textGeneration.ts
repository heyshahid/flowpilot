import { NodeDriver } from '../types';

export const textGenerationDriver: NodeDriver = async (context, resolvedConfig) => {
  const prompt = String(resolvedConfig.prompt || '').trim();
  if (!prompt) {
    throw new Error('AI Text Generation node requires a non-empty "prompt".');
  }

  const model = String(resolvedConfig.model || 'gemini-1.5-flash');
  const temperature = Number(resolvedConfig.temperature ?? 0.7);

  // If cancellation is requested
  if (context.signal?.aborted) {
    throw new Error('AI Text Generation aborted by execution cancellation.');
  }

  // Deterministic generator fallback / simulation
  const generatedText = `[AI Analysis Response] Processed query: "${prompt}". Confidence: 0.98. Resulting action recommendations completed successfully.`;

  return {
    success: true,
    text: generatedText,
    model,
    temperature,
    tokens: Math.ceil(prompt.length / 4) + 32,
    timestamp: new Date().toISOString(),
  };
};
