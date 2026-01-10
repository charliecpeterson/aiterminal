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
import type { ChatMessage, PendingApproval, ContextItem } from '../context/AIContext';
import { createTools } from './tools-vercel';
import { buildEnhancedSystemPrompt, summarizeContext, addChainOfThought } from './prompts';
import { rankContextByRelevance, deduplicateContext, formatRankedContext } from './contextRanker';

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
  setPrompt: (value: string) => void;
  setIsSending: (value: boolean) => void;
  setSendError: (value: string | null) => void;
  abortController?: AbortController; // For cancellation
  addPendingApproval: (approval: PendingApproval) => void;
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
    formattedContextItems,
    terminalId,
    usedContextForNextAssistantMessage,
    addMessage,
    appendMessage,
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

  // Use pre-formatted context (already handles redaction)
  const formattedContext = formattedContextItems.join('\n\n---\n\n');

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

  try {
    // Enhance user prompt with chain-of-thought for complex queries
    const enhancedUserPrompt = addChainOfThought(trimmed);

    // Create OpenAI client with user's settings
    const openai = createOpenAI({
      apiKey: settingsAi.api_key,
      baseURL: settingsAi.url || 'https://api.openai.com/v1',
    });

    // Convert message history with enhanced prompt
    const coreMessages = convertToCoreMessages([...messages, {
      id: crypto.randomUUID(),
      role: 'user',
      content: enhancedUserPrompt,
      timestamp: Date.now(),
    }]);

    const aiMode = settingsAi.mode || 'agent';
    const enableTools = aiMode === 'agent';

    // Deduplicate and rank context by relevance
    const deduped = deduplicateContext(deps.contextItems);
    const rankedContext = rankContextByRelevance(deduped, trimmed, 8000);
    const contextSummary = summarizeContext(deps.contextItems);
    
    // Format ranked context
    const formattedRankedContext = formatRankedContext(rankedContext);
    const contextForPrompt = formattedRankedContext.join('\n\n---\n\n');

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
            stopWhen: stepCountIs(5), // Allow up to 5 tool roundtrips
          }
        : {}),
      abortSignal: abortController?.signal, // Enable cancellation
      system: finalSystemPrompt,
      temperature: 0.7, // Balanced creativity
      maxTokens: 2000, // Reasonable response length
    });

    // Create assistant message
    const assistantId = crypto.randomUUID();
    
    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      usedContext: usedContextForNextAssistantMessage,
    });

    // Stream the full response including tool calls and results
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        appendMessage(assistantId, part.text);
      } else if (part.type === 'tool-call') {
        // Tool being called - no action needed, handled by tool-result
      } else if (part.type === 'tool-result') {
        // Tool completed - no action needed
      } else if (part.type === 'finish') {
      }
    }

    // Get final text after all tool executions
    const finalText = await result.text;
    
    // If we got final text but haven't displayed it (tools only, no streaming text)
    if (finalText && finalText.length > 0) {
      const currentMessage = messages.find(m => m.id === assistantId);
      if (!currentMessage?.content || currentMessage.content.length === 0) {
        appendMessage(assistantId, finalText);
      }
    }
    
    await result.steps;
    await result.usage;
    
    setIsSending(false);

  } catch (error) {
    console.error('❌ AI request failed:', error);
    
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
