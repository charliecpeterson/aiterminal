/**
 * Vercel AI SDK Chat Implementation
 * 
 * Replaces custom OpenAI streaming with Vercel AI SDK's streamText.
 * Provides automatic tool execution and multi-step conversations.
 */

import { streamText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { CoreMessage } from 'ai';
import type { AiSettings } from '../context/SettingsContext';
import type { ChatMessage, PendingApproval, ContextItem, ToolProgress } from '../context/AIContext';
import { createTools } from './tools-vercel';
import { buildEnhancedSystemPrompt, summarizeContext, addChainOfThought } from './prompts';
import { rankContextByRelevance, deduplicateContext, formatRankedContext } from './contextRanker';
import { extractRecentTopics } from './contextTracking';
import { getCachedContext, setCachedContext } from './contextCache';
import { getSmartContextForPrompt } from './smartContext';
import {
  startRequestMetrics,
  recordContextProcessing,
  recordFirstToken,
  recordToolCall,
  recordTokenUsage,
  finishRequestMetrics,
} from './metrics';
import { createLogger } from '../utils/logger';
import { prepareConversationHistory } from './conversationHistory';
import { createStreamingBuffer } from './streamingBuffer';

const log = createLogger('ChatSend');

export interface ChatSendDeps {
  prompt: string;
  settingsAi: AiSettings | null | undefined;
  messages: ChatMessage[]; // Full message history
  contextItems: ContextItem[]; // Context from terminal
  formattedContextItems: string[]; // Pre-formatted context with redaction
  terminalId: number; // Active terminal ID

  usedContextForNextAssistantMessage?: ChatMessage["usedContext"]; // Optional UI metadata

  addMessage: (message: ChatMessage) => void;
  appendMessage: (id: string, content: string) => void;
  updateMessageMetrics: (id: string, metrics: ChatMessage['metrics']) => void;
  updateToolProgress: (id: string, toolProgress: ToolProgress[]) => void;
  setPrompt: (value: string) => void;
  setIsSending: (value: boolean) => void;
  setSendError: (value: string | null) => void;
  abortController?: AbortController; // For cancellation
  addPendingApproval: (approval: PendingApproval) => void;
  markContextAsUsed?: (ids: string[], messageId: string) => void; // Track context usage
}

/**
 * Convert our ChatMessage format to Vercel AI SDK CoreMessage format
 */
function convertToCoreMessages(messages: ChatMessage[]): CoreMessage[] {
  return messages
    .filter(m => m.role !== 'system') // Filter out system messages
    .map(m => {
      if (m.role === 'user') {
        return {
          role: 'user' as const,
          content: m.content,
        };
      } else {
        // assistant messages
        return {
          role: 'assistant' as const,
          content: m.content,
        };
      }
    });
}

/**
 * Send a chat message using Vercel AI SDK
 */
export async function sendChatMessage(deps: ChatSendDeps): Promise<void> {
  const {
    prompt,
    settingsAi,
    messages,
    formattedContextItems: _formattedContextItems, // Available but not currently used
    terminalId,
    usedContextForNextAssistantMessage,
    addMessage,
    appendMessage,
    updateMessageMetrics,
    updateToolProgress,
    setPrompt,
    setIsSending,
    setSendError,
    abortController,
    addPendingApproval,
  } = deps;

  const trimmed = prompt.trim();
  if (!trimmed) return;

  // Validate AI settings
  if (!settingsAi || !settingsAi.provider || !settingsAi.model || !settingsAi.api_key) {
    setSendError('AI settings incomplete. Please configure in Settings.');
    addMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: 'AI settings are missing. Open Settings to configure.',
      timestamp: Date.now(),
    });
    return;
  }

  // Pre-formatted context is available in formattedContextItems (already handles redaction)
  // Note: Not used directly here, but passed through via contextItems for ranking/deduplication

  // Add user message
  addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    content: trimmed,
    timestamp: Date.now(),
  });

  setPrompt('');
  setSendError(null);
  setIsSending(true);

  // Start performance metrics tracking
  startRequestMetrics(settingsAi.model, settingsAi.mode || 'agent');
  let firstTokenRecorded = false;

  try {
    // Prepare conversation history with sliding window and summarization
    const conversationWindow = await prepareConversationHistory(messages, settingsAi);
    
    // Log token savings if any
    if (conversationWindow.tokensSaved > 0) {
      log.info('Token optimization applied', {
        originalMessages: conversationWindow.totalOriginalCount,
        optimizedMessages: conversationWindow.recentMessages.length + (conversationWindow.summaryMessage ? 1 : 0),
        tokensSaved: conversationWindow.tokensSaved,
        savingsPercent: Math.round((conversationWindow.tokensSaved / (conversationWindow.tokensSaved + 1000)) * 100),
      });
    }

    // Enhance user prompt with chain-of-thought for complex queries
    const enhancedUserPrompt = addChainOfThought(trimmed);

    // Create OpenAI client with user's settings
    const openai = createOpenAI({
      apiKey: settingsAi.api_key,
      baseURL: settingsAi.url || 'https://api.openai.com/v1',
    });

    // Build message history with optimized conversation window
    let messagesToSend: ChatMessage[] = [];
    
    // Add summary message first if available (provides context for older conversation)
    if (conversationWindow.summaryMessage) {
      messagesToSend.push(conversationWindow.summaryMessage);
    }
    
    // Add recent messages
    messagesToSend = messagesToSend.concat(conversationWindow.recentMessages);
    
    // Add the current user message
    messagesToSend.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: enhancedUserPrompt,
      timestamp: Date.now(),
    });

    // Convert to core messages format
    const coreMessages = convertToCoreMessages(messagesToSend);

    const aiMode = settingsAi.mode || 'agent';
    const enableTools = aiMode === 'agent';

    // Extract recent conversation topics for better relevance scoring
    const recentTopics = extractRecentTopics(messages, 3);

    // Try to get cached context first
    const cached = getCachedContext(deps.contextItems, trimmed);
    
    let formattedContextArray: string[];
    let contextForPrompt: string;
    let usedContextIds: string[];
    let useSmartContext = false;

    if (cached) {
      // Use cached context
      formattedContextArray = cached.formatted;
      contextForPrompt = formattedContextArray.join('\n\n---\n\n');
      usedContextIds = cached.ranked.map(r => r.item.id);
      log.debug('Using cached context', { items: cached.ranked.length });
    } else {
      // Decide whether to use smart context (embeddings) or keyword ranking
      const hasEmbeddingModel = settingsAi.embedding_model?.trim();
      const hasEnoughContext = deps.contextItems.length >= 10; // Smart context is most valuable with lots of context
      
      if (hasEmbeddingModel && hasEnoughContext) {
        // Use smart context with embeddings for better relevance
        try {
          useSmartContext = true;
          const smartResult = await getSmartContextForPrompt({
            ai: settingsAi,
            contextItems: deps.contextItems,
            query: trimmed,
            topK: 8,
            globalSmartMode: true,
          });
          
          formattedContextArray = smartResult.formatted;
          contextForPrompt = formattedContextArray.join('\n\n---\n\n');
          
          // Extract context IDs from retrieved chunks
          usedContextIds = smartResult.retrieved.map(r => r.source_id);
          
          log.debug('Using smart context', { items: smartResult.retrieved.length });
        } catch (error) {
          // Fallback to keyword ranking if smart context fails
          log.warn('Smart context failed, falling back to keyword ranking', error);
          useSmartContext = false;
          
          const deduped = deduplicateContext(deps.contextItems);
          const rankedContext = rankContextByRelevance(deduped, trimmed, 8000, {
            recentMessageTopics: recentTopics,
            recentMessages: messages, // Pass message history for conversation memory
          });
          
          formattedContextArray = formatRankedContext(rankedContext);
          contextForPrompt = formattedContextArray.join('\n\n---\n\n');
          usedContextIds = rankedContext.map(r => r.item.id);
        }
      } else {
        // Use traditional keyword-based ranking
        const deduped = deduplicateContext(deps.contextItems);
        const rankedContext = rankContextByRelevance(deduped, trimmed, 8000, {
          recentMessageTopics: recentTopics,
          recentMessages: messages, // Pass message history for conversation memory
        });
        
        formattedContextArray = formatRankedContext(rankedContext);
        contextForPrompt = formattedContextArray.join('\n\n---\n\n');
        usedContextIds = rankedContext.map(r => r.item.id);
        
        log.debug('Using keyword ranking', { items: rankedContext.length });
      }
      
      // Cache the results for future requests (only cache keyword ranking for now)
      if (!useSmartContext) {
        // For caching, we need rankedContext format - regenerate it
        const deduped = deduplicateContext(deps.contextItems);
        const rankedContext = rankContextByRelevance(deduped, trimmed, 8000, {
          recentMessageTopics: recentTopics,
          recentMessages: messages, // Pass message history for conversation memory
        });
        // Estimate token count (rough approximation: ~4 chars per token)
        const estimatedTokens = Math.ceil(contextForPrompt.length / 4);
        setCachedContext(deps.contextItems, trimmed, rankedContext, formattedContextArray, estimatedTokens);
        log.debug('Cached new context', { items: rankedContext.length });
      }
    }

    const contextSummary = summarizeContext(deps.contextItems);

    // Record context processing metrics
    recordContextProcessing(
      deps.contextItems.length,
      formattedContextArray.length,
      undefined // Token count not calculated yet
    );

    // Build enhanced system prompt
    const systemPrompt = buildEnhancedSystemPrompt({
      mode: aiMode,
      terminalId,
      config: {
        userLevel: 'intermediate', // Could be detected or set in settings
        shellType: 'bash', // Could be detected from terminal
      },
      contextSummary,
    });
    
    // Add context to system prompt if available
    const finalSystemPrompt = contextForPrompt 
      ? `${systemPrompt}\n\nTERMINAL CONTEXT PROVIDED BY USER:\n${contextForPrompt}`
      : systemPrompt;

    // Create tools only when enabled (Agent mode)
    const tools = enableTools
      ? createTools(
          terminalId,
          settingsAi.require_command_approval !== false,
          addPendingApproval
        )
      : undefined;

    const result = await streamText({
      model: openai(settingsAi.model),
      messages: coreMessages,
      ...(enableTools
        ? {
            tools,
            stopWhen: stepCountIs(15), // Allow up to 15 tool roundtrips for complex tasks
          }
        : {}),
      abortSignal: abortController?.signal, // Enable cancellation
      system: finalSystemPrompt,
      temperature: 0.7, // Balanced creativity
      // Note: maxTokens not specified - uses model default
    });

    // Create assistant message
    const assistantId = crypto.randomUUID();
    
    // Mark context as used in this message
    if (deps.markContextAsUsed && usedContextIds.length > 0) {
      deps.markContextAsUsed(usedContextIds, assistantId);
    }
    
    // We'll add metrics after streaming completes
    let assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      usedContext: usedContextForNextAssistantMessage,
    };
    
    addMessage(assistantMessage);

    // Create streaming buffer to batch UI updates
    const streamBuffer = createStreamingBuffer((text) => {
      appendMessage(assistantId, text);
    });

    // Track tool executions
    const toolProgressList: ToolProgress[] = [];
    
    const updateToolProgressUI = () => {
      updateToolProgress(assistantId, [...toolProgressList]);
    };

    // Stream the full response including tool calls and results
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        // Record first token timing
        if (!firstTokenRecorded) {
          recordFirstToken();
          firstTokenRecorded = true;
        }
        // Buffer the text instead of immediate append
        streamBuffer.append(part.text);
      } else if (part.type === 'tool-call') {
        // Flush buffer before tool call to ensure text appears first
        streamBuffer.flush();
        
        // Record tool call
        recordToolCall();
        
        // Add tool to progress list as running
        const toolProgress: ToolProgress = {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'running',
          args: part.input as Record<string, any>,
          startTime: Date.now(),
        };
        toolProgressList.push(toolProgress);
        updateToolProgressUI();
        
      } else if (part.type === 'tool-result') {
        // Find the corresponding tool and mark it as completed
        const tool = toolProgressList.find(
          t => t.toolCallId === part.toolCallId
        );
        
        if (tool) {
          tool.status = 'completed';
          tool.endTime = Date.now();
          tool.result = typeof part.output === 'string' 
            ? part.output 
            : JSON.stringify(part.output);
          updateToolProgressUI();
        }
        
      } else if (part.type === 'finish') {
        // Flush any remaining buffered text
        streamBuffer.flush();
      } else if (part.type === 'error') {
        // Mark any running tools as failed
        for (const tool of toolProgressList) {
          if (tool.status === 'running') {
            tool.status = 'failed';
            tool.endTime = Date.now();
            tool.error = 'Request error';
          }
        }
        updateToolProgressUI();
      }
    }

    // Final flush to ensure all text is displayed
    streamBuffer.finalize();

    // Log streaming stats
    const bufferStats = streamBuffer.getStats();
    if (bufferStats.chunks > 0) {
      log.debug('Streaming buffer stats', bufferStats);
    }

    // Wait for all steps to complete
    await result.steps;
    const usage = await result.usage;
    
    // Record final metrics with token usage
    if (usage) {
      recordTokenUsage(
        usage.inputTokens || 0,
        usage.outputTokens || 0
      );
    }
    const requestMetrics = finishRequestMetrics();
    
    // Update the assistant message with metrics
    if (requestMetrics) {
      updateMessageMetrics(assistantId, {
        model: requestMetrics.model,
        mode: requestMetrics.mode,
        timings: {
          total: requestMetrics.totalDurationMs || 0,
          firstToken: requestMetrics.firstTokenMs,
        },
        tokens: {
          input: requestMetrics.inputTokens || 0,
          output: requestMetrics.outputTokens || 0,
          total: (requestMetrics.inputTokens || 0) + (requestMetrics.outputTokens || 0),
        },
        toolCalls: requestMetrics.toolCallCount > 0 ? requestMetrics.toolCallCount : undefined,
      });
    }
    
    setIsSending(false);

  } catch (error) {
    log.error('AI request failed', error);
    
    // Check if it was aborted
    if (error instanceof Error && error.name === 'AbortError') {
      setSendError('Request cancelled');
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: 'Request cancelled by user.',
        timestamp: Date.now(),
      });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      setSendError(message);
      
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Request failed: ${message}`,
        timestamp: Date.now(),
      });
    }
    
    setIsSending(false);
  }
}
