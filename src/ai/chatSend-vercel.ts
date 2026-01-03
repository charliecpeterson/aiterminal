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
    // Create OpenAI client with user's settings
    const openai = createOpenAI({
      apiKey: settingsAi.api_key,
      baseURL: settingsAi.url || 'https://api.openai.com/v1',
    });

    // Convert message history
    const coreMessages = convertToCoreMessages([...messages, {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    }]);

    console.log('🤖 Sending to Vercel AI SDK:', {
      model: settingsAi.model,
      messageCount: coreMessages.length,
      terminalId,
      requireApproval: settingsAi.require_command_approval !== false,
      aiMode: settingsAi.mode || 'agent',
    });

    const aiMode = settingsAi.mode || 'agent';
    const enableTools = aiMode === 'agent';

    const systemPromptAgent = `You are a helpful AI assistant embedded in a terminal emulator.
You have access to tools to help users interact with their system.

IMPORTANT GUIDELINES:
- Use tools proactively to answer questions
- When users ask about "current directory" or "here", use execute_command("pwd") to get the path
- After getting pwd, use that path for subsequent operations
- Be concise but helpful
- Explain what you're doing with tools
- If a command might be destructive, warn the user first

CURRENT CONTEXT:
- Terminal ID: ${terminalId}
- You have access to: execute_command, read_file, list_directory, search_files, get_environment_variable

${formattedContext ? `TERMINAL CONTEXT PROVIDED BY USER:\n${formattedContext}\n\n` : ''}Use the terminal context above to answer the user's question.`;

    const systemPromptChat = `You are a helpful AI assistant embedded in a terminal emulator.
You do NOT have access to any tools and you MUST NOT claim that you executed commands or read files.

IMPORTANT GUIDELINES:
- Provide explanations and suggested commands the user can run
- Put commands in fenced code blocks
- If a command might be destructive, warn the user first and suggest safer alternatives
- Be concise but helpful

CURRENT CONTEXT:
- Terminal ID: ${terminalId}

${formattedContext ? `TERMINAL CONTEXT PROVIDED BY USER:\n${formattedContext}\n\n` : ''}Use the terminal context above to answer the user's question.`;

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
      system: enableTools ? systemPromptAgent : systemPromptChat,
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

    console.log('✅ Stream completed');
    
    // Get final text after all tool executions
    const finalText = await result.text;
    console.log('📝 Final text length:', finalText.length);
    
    // If we got final text but haven't displayed it (tools only, no streaming text)
    if (finalText && finalText.length > 0) {
      const currentMessage = messages.find(m => m.id === assistantId);
      if (!currentMessage?.content || currentMessage.content.length === 0) {
        appendMessage(assistantId, finalText);
      }
    }
    
    const steps = await result.steps;
    console.log('📊 Total steps:', steps.length);
    console.log('📝 Usage:', await result.usage);
    
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
