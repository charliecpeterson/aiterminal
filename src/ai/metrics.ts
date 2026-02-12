/**
 * Performance Metrics for AI Requests
 * 
 * Tracks timing and performance characteristics of AI chat requests
 */

export interface AIRequestMetrics {
  requestId: string;
  startTime: number;
  
  // Timing breakdowns
  contextProcessingMs?: number;
  firstTokenMs?: number;
  totalDurationMs?: number;
  
  // Token usage
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  
  // Context stats
  contextItemsConsidered: number;
  contextItemsUsed: number;
  contextTokens?: number;
  
  // Tool usage
  toolCallCount: number;
  toolExecutionMs?: number;
  
  // Model info
  model: string;
  mode: 'chat' | 'agent';
}

interface MetricsStore {
  current: AIRequestMetrics | null;
  history: AIRequestMetrics[];
  maxHistorySize: number;
}

const metricsStore: MetricsStore = {
  current: null,
  history: [],
  maxHistorySize: 50,
};

export function startRequestMetrics(model: string, mode: 'chat' | 'agent'): string {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  metricsStore.current = {
    requestId,
    startTime: Date.now(),
    model,
    mode,
    contextItemsConsidered: 0,
    contextItemsUsed: 0,
    toolCallCount: 0,
  };
  
  return requestId;
}

export function recordContextProcessing(
  itemsConsidered: number,
  itemsUsed: number,
  tokens?: number
): void {
  if (!metricsStore.current) return;
  
  metricsStore.current.contextProcessingMs = Date.now() - metricsStore.current.startTime;
  metricsStore.current.contextItemsConsidered = itemsConsidered;
  metricsStore.current.contextItemsUsed = itemsUsed;
  metricsStore.current.contextTokens = tokens;
}

export function recordFirstToken(): void {
  if (!metricsStore.current) return;
  
  metricsStore.current.firstTokenMs = Date.now() - metricsStore.current.startTime;
}

export function recordToolCall(): void {
  if (!metricsStore.current) return;
  
  metricsStore.current.toolCallCount++;
}

export function recordToolExecution(durationMs: number): void {
  if (!metricsStore.current) return;
  
  metricsStore.current.toolExecutionMs = 
    (metricsStore.current.toolExecutionMs || 0) + durationMs;
}

export function recordTokenUsage(
  input: number,
  output: number,
  cached?: number
): void {
  if (!metricsStore.current) return;

  metricsStore.current.inputTokens = (metricsStore.current.inputTokens || 0) + input;
  metricsStore.current.outputTokens = (metricsStore.current.outputTokens || 0) + output;
  if (cached !== undefined) {
    metricsStore.current.cachedTokens = (metricsStore.current.cachedTokens || 0) + cached;
  }
}

export function finishRequestMetrics(): AIRequestMetrics | null {
  if (!metricsStore.current) return null;
  
  metricsStore.current.totalDurationMs = Date.now() - metricsStore.current.startTime;
  
  // Add to history
  metricsStore.history.push(metricsStore.current);
  if (metricsStore.history.length > metricsStore.maxHistorySize) {
    metricsStore.history.shift();
  }
  
  const metrics = metricsStore.current;
  metricsStore.current = null;
  
  // Metrics are now displayed in the UI, no need to log
  // (You can uncomment for debugging)
  // console.log('[AI Metrics]', { ... });
  
  return metrics;
}

export function getMetricsHistory(): AIRequestMetrics[] {
  return [...metricsStore.history];
}

export function getAverageMetrics(): {
  avgContextProcessingMs: number;
  avgFirstTokenMs: number;
  avgTotalDurationMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgCachedTokens: number;
  avgToolCalls: number;
} | null {
  if (metricsStore.history.length === 0) return null;
  
  const sum = metricsStore.history.reduce(
    (acc, m) => ({
      contextProcessing: acc.contextProcessing + (m.contextProcessingMs || 0),
      firstToken: acc.firstToken + (m.firstTokenMs || 0),
      totalDuration: acc.totalDuration + (m.totalDurationMs || 0),
      inputTokens: acc.inputTokens + (m.inputTokens || 0),
      outputTokens: acc.outputTokens + (m.outputTokens || 0),
      cachedTokens: acc.cachedTokens + (m.cachedTokens || 0),
      toolCalls: acc.toolCalls + m.toolCallCount,
    }),
    {
      contextProcessing: 0,
      firstToken: 0,
      totalDuration: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      toolCalls: 0,
    }
  );
  
  const count = metricsStore.history.length;
  
  return {
    avgContextProcessingMs: sum.contextProcessing / count,
    avgFirstTokenMs: sum.firstToken / count,
    avgTotalDurationMs: sum.totalDuration / count,
    avgInputTokens: sum.inputTokens / count,
    avgOutputTokens: sum.outputTokens / count,
    avgCachedTokens: sum.cachedTokens / count,
    avgToolCalls: sum.toolCalls / count,
  };
}
