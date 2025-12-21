import { invoke } from '@tauri-apps/api/core';
import type { AiSettings, StreamingSettings } from '../context/SettingsContext';
import type { ChatMessage } from '../context/AIContext';
import { attachAiStreamListeners } from './aiStream';
import { toOpenAIFunctions } from './tools';

export interface ContinueChatDeps {
  settingsAi: AiSettings | null | undefined;
  settingsStreaming?: StreamingSettings | null;
  messages: ChatMessage[]; // Full message history including tool results
  
  addMessage: (message: ChatMessage) => void;
  appendMessage: (assistantMessageId: string, content: string) => void;
  
  setIsSending: (value: boolean) => void;
  setSendError: (value: string | null) => void;
  
  addToolCalls?: (toolCalls: any[]) => void;
}

/**
 * Continue the chat conversation with the full message history.
 * Used after tool execution to send results back to AI.
 */
export function continueChatWithHistory(deps: ContinueChatDeps): void {
  const {
    settingsAi,
    messages,
    addMessage,
    appendMessage,
    setIsSending,
    setSendError,
  } = deps;

  if (!settingsAi) {
    setIsSending(false);
    addMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: 'AI settings are missing. Open Settings to configure a provider.',
      timestamp: Date.now(),
    });
    return;
  }

  if (!settingsAi.provider || !settingsAi.model) {
    setIsSending(false);
    setSendError('AI provider and model must be configured');
    addMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: 'AI provider and model must be configured. Open Settings to complete the setup.',
      timestamp: Date.now(),
    });
    return;
  }

  const requestId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();

  // Add empty assistant message that will be filled by streaming
  addMessage({
    id: assistantId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  });

  setIsSending(true);
  setSendError(null);

  const stream = attachAiStreamListeners({
    requestId,
    handlers: {
      onChunk: (content) => appendMessage(assistantId, content),
      onToolCalls: (toolCalls) => {
        console.log('Tool calls received in continue:', toolCalls);
        if (deps.addToolCalls) {
          deps.addToolCalls(toolCalls);
        }
      },
      onEnd: () => {
        setIsSending(false);
      },
      onError: (error) => {
        setIsSending(false);
        setSendError(error);
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Request failed: ${error}`,
          timestamp: Date.now(),
        });
      },
    },
  });

  // Convert messages to API format
  const apiMessages = messages.map(msg => ({
    role: msg.role === 'system' ? 'user' : msg.role, // Convert system to user for API
    content: msg.content,
  }));

  console.log('🔄 Continuing conversation with', apiMessages.length, 'messages');

  // Get tool definitions in OpenAI format
  const tools = toOpenAIFunctions();

  invoke('ai_chat_stream', {
    provider: settingsAi.provider,
    apiKey: settingsAi.api_key,
    url: settingsAi.url,
    model: settingsAi.model,
    prompt: JSON.stringify(apiMessages), // Send as messages array
    requestId,
    maxTokens: deps.settingsStreaming?.max_tokens,
    timeoutSecs: deps.settingsStreaming?.timeout_secs,
    tools: JSON.stringify(tools),
    terminalCwd: undefined, // Not available in continuation
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Continue chat failed:', message);
    setSendError(message);
    setIsSending(false);
    addMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: `Request failed: ${message}`,
      timestamp: Date.now(),
    });
    stream.cleanup();
  });
}
