import { invoke } from '@tauri-apps/api/core';
import type { AiSettings } from '../context/SettingsContext';
import type { ChatMessage } from '../context/AIContext';
import { attachAiStreamListeners } from './aiStream';

export interface ChatSendDeps {
  prompt: string;
  buildPrompt: (userInput: string) => string;
  settingsAi: AiSettings | null | undefined;

  addMessage: (message: ChatMessage) => void;
  appendMessage: (assistantMessageId: string, content: string) => void;

  setPrompt: (value: string) => void;
  setIsSending: (value: boolean) => void;
  setSendError: (value: string | null) => void;
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

  const payload = buildPrompt(trimmed);
  const requestId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();

  addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    content: trimmed,
    timestamp: Date.now(),
  });

  addMessage({
    id: assistantId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  });

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

  const stream = attachAiStreamListeners({
    requestId,
    handlers: {
      onChunk: (content) => appendMessage(assistantId, content),
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

  invoke('ai_chat_stream', {
    provider: settingsAi.provider,
    apiKey: settingsAi.api_key,
    url: settingsAi.url,
    model: settingsAi.model,
    prompt: payload,
    requestId,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
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
