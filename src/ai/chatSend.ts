import { invoke } from '@tauri-apps/api/core';
import type { AiSettings, StreamingSettings } from '../context/SettingsContext';
import type { ChatMessage } from '../context/AIContext';
import { attachAiStreamListeners } from './aiStream';
import { toOpenAIFunctions } from './tools';

export interface ChatSendDeps {
  prompt: string;
  buildPrompt: (userInput: string) => string;
  settingsAi: AiSettings | null | undefined;
  settingsStreaming?: StreamingSettings | null;

  addMessage: (message: ChatMessage) => void;
  appendMessage: (assistantMessageId: string, content: string) => void;

  setPrompt: (value: string) => void;
  setIsSending: (value: boolean) => void;
  setSendError: (value: string | null) => void;

  // Tool calling callbacks
  addToolCalls?: (toolCalls: any[]) => void;
  messages?: ChatMessage[]; // Message history for multi-turn
  terminalCwd?: string; // Terminal's current working directory
}

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

export function sendChatMessage(deps: ChatSendDeps): void {
  const {
    prompt,
    buildPrompt,
    settingsAi,
    addMessage,
    appendMessage,
    setPrompt,
    setIsSending,
    setSendError,
  } = deps;

  const trimmed = prompt.trim();
  if (!trimmed) return;

  // Build the payload, optionally injecting terminal context
  let finalPrompt = trimmed;
  if (deps.terminalCwd) {
    finalPrompt = `[Terminal Working Directory: ${deps.terminalCwd}]\n\n${trimmed}`;
    console.log('📂 Injecting terminal CWD into prompt:', deps.terminalCwd);
    console.log('📝 Final prompt:', finalPrompt);
  } else {
    console.warn('⚠️ No terminal CWD available');
  }
  
  const payload = buildPrompt(finalPrompt);
  console.log('📤 Payload to AI:', payload);
  const requestId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();

  addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    content: trimmed, // Show user's original message, not the modified one
    timestamp: Date.now(),
  });

  // Don't create assistant message yet - wait for actual content or tool calls
  let assistantMessageCreated = false;

  setPrompt('');
  setSendError(null);

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

  setIsSending(true);

  // Validate required AI settings
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

  const stream = attachAiStreamListeners({
    requestId,
    handlers: {
      onChunk: (content) => {
        if (!assistantMessageCreated) {
          addMessage({
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          });
          assistantMessageCreated = true;
        }
        appendMessage(assistantId, content);
      },
      onToolCalls: (toolCalls) => {
        console.log('🔧 Tool calls received:', toolCalls);
        if (!assistantMessageCreated) {
          addMessage({
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
          });
          assistantMessageCreated = true;
        }
        if (deps.addToolCalls) {
          // Convert tool calls to PendingToolCall format
          const pendingToolCalls = toolCalls.map((tc: any) => {
            const args = typeof tc.function.arguments === 'string' 
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
            
            return {
              id: tc.id,
              name: tc.function.name,
              arguments: args,
              reasoning: args.reasoning,
              status: 'pending' as const,
              timestamp: Date.now(),
            };
          });
          console.log('✅ Converted to pending tool calls:', pendingToolCalls);
          deps.addToolCalls(pendingToolCalls);
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

  // Get tool definitions in OpenAI format
  const tools = toOpenAIFunctions();
  console.log('🔧 Sending request with tools:', tools.length, 'tools defined');

  invoke('ai_chat_stream', {
    provider: settingsAi.provider,
    apiKey: settingsAi.api_key,
    url: settingsAi.url,
    model: settingsAi.model,
    prompt: payload,
    requestId,
    maxTokens: deps.settingsStreaming?.max_tokens,
    timeoutSecs: deps.settingsStreaming?.timeout_secs,
    tools: JSON.stringify(tools), // Pass tool definitions
    terminalCwd: deps.terminalCwd, // Pass terminal working directory
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ AI request failed:', message);
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
