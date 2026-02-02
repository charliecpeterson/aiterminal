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
import type { RoutingDecision, PromptEnhancement } from '../types/routing';
import { createTools } from './tools-vercel';
import { buildEnhancedSystemPrompt, summarizeContext, addChainOfThought } from './prompts';
import { rankContextByRelevance, deduplicateContext, formatRankedContext } from './contextRanker';
import { extractRecentTopics } from './contextTracking';
import { getCachedContext, setCachedContext } from './contextCache';
import { getSmartContextForPrompt } from './smartContext';
import { classifyAndRoute, isAutoRoutingEnabled } from './queryRouter';
import { enhancePromptIfNeeded } from './promptEnhancer';
import {
  startRequestMetrics,
  recordContextProcessing,
  recordFirstToken,
  recordToolCall,
  recordTokenUsage,
  finishRequestMetrics,
} from './metrics';
import { createLogger } from '../utils/logger';
import { estimateTokens } from '../utils/tokens';
import { prepareConversationHistory } from './conversationHistory';
import { buildConversationMemory } from './conversationMemory';
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
 * Detect shell type from context items by examining prompts, commands, and output
 */
function detectShellFromContext(contextItems: ContextItem[]): 'bash' | 'zsh' | 'fish' {
  for (const item of contextItems) {
    const content = item.content.toLowerCase();
    // Check for zsh indicators in prompts/output
    if (content.includes('zsh') || content.includes('oh-my-zsh') || content.includes('powerlevel')) {
      return 'zsh';
    }
    // Check for fish indicators
    if (content.includes('fish') || content.includes('fisher') || content.includes('omf ')) {
      return 'fish';
    }
  }
  // Default to bash (most common)
  return 'bash';
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

  // Generate message IDs upfront so we can use them for tracking
  const userMsgId = crypto.randomUUID();
  const assistantMsgId = crypto.randomUUID();

  setPrompt('');
  setSendError(null);
  setIsSending(true);

  // Start performance metrics tracking
  startRequestMetrics(settingsAi.model, settingsAi.mode || 'agent'); // Initial model, may be overridden by routing
  let firstTokenRecorded = false;
  
  // Track context selection timing
  const contextSelectionStart = Date.now();

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

    const aiMode = settingsAi.mode || 'agent';
    const enableTools = aiMode === 'agent';

    // LAYER 1: Prompt Enhancement (if enabled)
    let enhancedPrompt = trimmed;
    let promptEnhancement: PromptEnhancement | undefined;
    
    if (settingsAi.auto_routing?.enable_prompt_enhancement !== false) {
      const enhancement = await enhancePromptIfNeeded(
        trimmed,
        deps.contextItems,
        settingsAi
      );
      
      if (enhancement.wasEnhanced) {
        enhancedPrompt = enhancement.enhanced;
        promptEnhancement = enhancement;
        
        log.info('Prompt enhanced', {
          original: trimmed.substring(0, 50),
          enhanced: enhancedPrompt.substring(0, 50),
          reason: enhancement.reason
        });
      }
    }

    // LAYER 2: Complexity Classification & Routing
    let model = settingsAi.model; // Fallback
    let contextTokenBudget = aiMode === 'chat' 
      ? (settingsAi.context_token_budget_chat ?? 12000)
      : (settingsAi.context_token_budget_agent ?? 6000);
    let temperature = 0.7; // Fallback
    let routingDecision: RoutingDecision | undefined;

    if (isAutoRoutingEnabled(settingsAi)) {
      routingDecision = classifyAndRoute(
        enhancedPrompt,
        deps.contextItems,
        settingsAi,
        aiMode
      );
      
      model = routingDecision.model;
      contextTokenBudget = routingDecision.contextBudget;
      temperature = routingDecision.temperature;
      
      log.info('Auto-routing decision', {
        tier: routingDecision.tier,
        model,
        complexity: routingDecision.complexity,
        score: routingDecision.reasoning.score,
        queryType: routingDecision.reasoning.queryType,
      });
    } else {
      log.debug('Auto-routing disabled, using manual model selection');
    }

    // Enhance user prompt with chain-of-thought for complex queries only
    // Pass complexity level so CoT is only added for moderate+ queries (saves ~30 tokens on simple queries)
    const enhancedUserPrompt = addChainOfThought(enhancedPrompt, routingDecision?.complexity);

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

    // Mode-specific context strategies
    // Chat mode: Front-load context (can't fetch files later)
    // Agent mode: Just-in-time context (can use tools to fetch more)
    // Note: contextTokenBudget may already be set by auto-routing above
    
    log.debug(`Using ${aiMode} mode with ${contextTokenBudget} token budget for context`, {
      mode: aiMode,
      budget: contextTokenBudget,
      routingEnabled: isAutoRoutingEnabled(settingsAi),
      tier: routingDecision?.tier,
    });

    // Extract recent conversation topics for better relevance scoring
    const recentTopics = extractRecentTopics(messages, 3);

    // Try to get cached context first
    const cached = getCachedContext(deps.contextItems, trimmed);
    
    let formattedContextArray: string[];
    let contextForPrompt: string;
    let usedContextIds: string[];
    let useSmartContext = false;
    let rankedContext: any[] | undefined; // Store for verbose export

    if (cached) {
      // Use cached context
      formattedContextArray = cached.formatted;
      contextForPrompt = formattedContextArray.join('\n\n---\n\n');
      usedContextIds = cached.ranked.map(r => r.item.id);
      rankedContext = cached.ranked; // Store ranked context
      log.debug('Using cached context', { items: cached.ranked.length });
    } else {
      // Decide whether to use smart context (embeddings) or keyword ranking
      const hasEmbeddingModel = settingsAi.embedding_model?.trim();
      const hasEnoughContext = deps.contextItems.length >= 10; // Smart context is most valuable with lots of context
      
      if (hasEmbeddingModel && hasEnoughContext) {
        // Use smart context with embeddings for better relevance
        try {
          useSmartContext = true;
          // Chat mode: Retrieve more context items (topK: 12)
          // Agent mode: Retrieve fewer items, rely on tools (topK: 6)
          const smartTopK = aiMode === 'chat' ? 12 : 6;
          
          const smartResult = await getSmartContextForPrompt({
            ai: settingsAi,
            contextItems: deps.contextItems,
            query: trimmed,
            topK: smartTopK,
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
          rankedContext = rankContextByRelevance(deduped, trimmed, contextTokenBudget, {
            recentMessageTopics: recentTopics,
            recentMessages: messages, // Pass message history for conversation memory
            mode: aiMode, // Pass mode for mode-specific scoring
          });
          
          formattedContextArray = formatRankedContext(rankedContext);
          contextForPrompt = formattedContextArray.join('\n\n---\n\n');
          usedContextIds = rankedContext.map(r => r.item.id);
        }
      } else {
        // Use traditional keyword-based ranking
        const deduped = deduplicateContext(deps.contextItems);
        rankedContext = rankContextByRelevance(deduped, trimmed, contextTokenBudget, {
          recentMessageTopics: recentTopics,
          recentMessages: messages, // Pass message history for conversation memory
          mode: aiMode, // Pass mode for mode-specific scoring
        });
        
        formattedContextArray = formatRankedContext(rankedContext);
        contextForPrompt = formattedContextArray.join('\n\n---\n\n');
        usedContextIds = rankedContext.map(r => r.item.id);
        
        log.debug('Using keyword ranking', { items: rankedContext.length });
      }
      
      // Cache the results for future requests (only cache keyword ranking for now)
      if (!useSmartContext && rankedContext) {
        const cachedTokens = estimateTokens(contextForPrompt);
        setCachedContext(deps.contextItems, trimmed, rankedContext, formattedContextArray, cachedTokens);
        log.debug('Cached new context', { items: rankedContext.length });
      }
    }
    
    // Calculate context selection time
    const contextSelectionTime = Date.now() - contextSelectionStart;

    const contextSummary = summarizeContext(deps.contextItems);

    // Record context processing metrics
    recordContextProcessing(
      deps.contextItems.length,
      formattedContextArray.length,
      undefined // Token count not calculated yet
    );

    // Detect user skill level from conversation history (instead of hardcoding 'intermediate')
    const conversationMemory = buildConversationMemory(messages);
    const detectedUserLevel = conversationMemory.userPreferences.skillLevel || 'intermediate';
    
    // Detect shell type from terminal context (instead of hardcoding 'bash')
    const detectedShellType = detectShellFromContext(deps.contextItems);

    // Build enhanced system prompt
    // Pass complexity score to conditionally include few-shot examples (saves ~400 tokens on simple queries)
    // Pass queryType to select only relevant few-shot examples (saves additional ~240-320 tokens)
    const systemPrompt = buildEnhancedSystemPrompt({
      mode: aiMode,
      terminalId,
      config: {
        userLevel: detectedUserLevel,
        shellType: detectedShellType,
      },
      contextSummary,
      complexityScore: routingDecision?.reasoning.score,
      queryType: routingDecision?.reasoning.queryType,
    });
    
    // Add context to system prompt if available
    const finalSystemPrompt = contextForPrompt 
      ? `${systemPrompt}\n\nTERMINAL CONTEXT PROVIDED BY USER:\n${contextForPrompt}`
      : systemPrompt;
    
    log.debug('System prompt prepared', {
      length: finalSystemPrompt.length,
      estimatedTokens: estimateTokens(finalSystemPrompt),
      hasContext: !!contextForPrompt,
    });
    
    // Now add user message with verbose metadata for export
    addMessage({
      id: userMsgId,
      role: 'user',
      content: trimmed, // Store original, not enhanced
      timestamp: Date.now(),
      usedContext: {
        mode: useSmartContext ? 'smart' : 'full',
        chunkCount: usedContextIds.length,
        contextBudget: contextTokenBudget,
        contextStrategy: useSmartContext ? 'smart' : (cached ? 'cached' : 'keyword'),
        // Store detailed context items for verbose export
        contextItems: rankedContext?.map(rc => ({
          id: rc.item.id,
          type: rc.item.type,
          label: rc.item.metadata?.path || rc.item.id,
          path: rc.item.metadata?.path,
          content: rc.item.content,
          usageCount: rc.item.usageCount,
          conversationMemoryPenalty: rc.breakdown?.conversationMemory,
        })),
      },
      systemPrompt: finalSystemPrompt, // Store system prompt for verbose export
      routingDecision,    // Routing information for intelligent model selection
      promptEnhancement,  // Prompt enhancement details
    });

    // Create tools only when enabled (Agent mode)
    const tools = enableTools
      ? createTools(
          terminalId,
          settingsAi.require_command_approval !== false,
          addPendingApproval
        )
      : undefined;

    log.debug('Sending to AI', {
      messageCount: coreMessages.length,
      toolsEnabled: enableTools,
      model,
    });

    const result = await streamText({
      model: openai(model),  // Use routed model (may differ from settingsAi.model)
      messages: coreMessages,
      ...(enableTools
        ? {
            tools,
            stopWhen: stepCountIs(15), // Allow up to 15 tool roundtrips for complex tasks
          }
        : {}),
      abortSignal: abortController?.signal, // Enable cancellation
      system: finalSystemPrompt,
      temperature,  // Use routed temperature (may differ based on query type)
      // Note: maxTokens not specified - uses model default
    });

    // Create assistant message
    
    // Mark context as used in this message
    if (deps.markContextAsUsed && usedContextIds.length > 0) {
      deps.markContextAsUsed(usedContextIds, assistantMsgId);
    }
    
    // We'll add metrics after streaming completes
    let assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      usedContext: usedContextForNextAssistantMessage,
    };
    
    addMessage(assistantMessage);

    // Create streaming buffer to batch UI updates
    const streamBuffer = createStreamingBuffer((text) => {
      appendMessage(assistantMsgId, text);
    });

    // Track tool executions
    const toolProgressList: ToolProgress[] = [];
    
    const updateToolProgressUI = () => {
      updateToolProgress(assistantMsgId, [...toolProgressList]);
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
      updateMessageMetrics(assistantMsgId, {
        model: model, // Use actual routed model, not requestMetrics.model which is the initial one
        mode: requestMetrics.mode,
        timings: {
          total: requestMetrics.totalDurationMs || 0,
          firstToken: requestMetrics.firstTokenMs,
          contextSelection: contextSelectionTime, // Add context selection time
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
