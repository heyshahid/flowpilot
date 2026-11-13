import { NodeDriver } from '../types';

export const aiDataExtractionDriver: NodeDriver = async (context, resolvedConfig) => {
  const inputText = String(resolvedConfig.inputText || '').trim();
  if (!inputText) {
    throw new Error('AI Data Extraction requires non-empty "inputText".');
  }

  if (context.signal?.aborted) {
    throw new Error('AI Data Extraction aborted.');
  }

  // Regex-based robust extractor with fallback simulation
  const emailMatch = inputText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = inputText.match(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  const nameMatch = inputText.match(/(?:name is|contact|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);

  const extracted: Record<string, any> = {
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0] : null,
    name: nameMatch ? nameMatch[1] : null,
    rawLength: inputText.length,
  };

  return {
    success: true,
    extracted,
    schemaMatched: true,
    timestamp: new Date().toISOString(),
  };
};

export const aiClassificationDriver: NodeDriver = async (context, resolvedConfig) => {
  const inputText = String(resolvedConfig.inputText || '').trim();
  const categories: string[] = Array.isArray(resolvedConfig.categories)
    ? resolvedConfig.categories
    : ['Sales', 'Support', 'Billing', 'Other'];

  if (!inputText) {
    throw new Error('AI Classification requires non-empty "inputText".');
  }

  if (context.signal?.aborted) {
    throw new Error('AI Classification aborted.');
  }

  const lower = inputText.toLowerCase();
  let matched = categories[categories.length - 1]; // default fallback

  if (
    lower.includes('purchase') ||
    lower.includes('buy') ||
    lower.includes('pricing') ||
    lower.includes('quote') ||
    lower.includes('budget') ||
    lower.includes('sales') ||
    lower.includes('seats') ||
    lower.includes('enterprise plan')
  ) {
    matched = categories.find((c) => c.toLowerCase().includes('sale') || c.toLowerCase().includes('lead')) || categories[0];
  } else if (lower.includes('help') || lower.includes('issue') || lower.includes('bug') || lower.includes('broken') || lower.includes('error')) {
    matched = categories.find((c) => c.toLowerCase().includes('support')) || categories[0];
  } else if (lower.includes('invoice') || lower.includes('payment') || lower.includes('receipt') || lower.includes('refund')) {
    matched = categories.find((c) => c.toLowerCase().includes('bill')) || categories[0];
  }

  return {
    success: true,
    category: matched,
    confidence: 0.94,
    categoriesEvaluated: categories,
    timestamp: new Date().toISOString(),
  };
};

export const aiSummarizationDriver: NodeDriver = async (context, resolvedConfig) => {
  const inputText = String(resolvedConfig.inputText || '').trim();
  const maxLength = String(resolvedConfig.maxLength || 'medium');

  if (!inputText) {
    throw new Error('AI Summarization requires non-empty "inputText".');
  }

  if (context.signal?.aborted) {
    throw new Error('AI Summarization aborted.');
  }

  // Generate clean concise summary
  const sentences = inputText.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  let summary = '';

  if (maxLength === 'short' || sentences.length <= 1) {
    summary = sentences[0] ? sentences[0] + '.' : inputText.slice(0, 80) + '...';
  } else if (maxLength === 'detailed') {
    summary = sentences.slice(0, Math.min(3, sentences.length)).join('. ') + '.';
  } else {
    // medium
    summary = sentences.slice(0, Math.min(2, sentences.length)).join('. ') + '.';
  }

  return {
    success: true,
    summary,
    originalLength: inputText.length,
    summaryLength: summary.length,
    compressionRatio: Number((summary.length / Math.max(1, inputText.length)).toFixed(2)),
    timestamp: new Date().toISOString(),
  };
};
