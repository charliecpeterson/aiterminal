import { createContext, useCallback, useContext, useMemo, useReducer, useEffect } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export type ContextType = "command" | "output" | "selection" | "file" | "command_output";

export type ContextIncludeMode = "smart" | "always" | "exclude";

export interface SecretFinding {
  secret_type: string;
  line: number;
  preview: string;
}

export interface ContextItem {
  id: string;
  type: ContextType;
  content: string;
  timestamp: number;
  metadata?: {
    command?: string;
    output?: string;
    path?: string;
    truncated?: boolean;
    byte_count?: number;
    exitCode?: number;
    cwd?: string;
    source?: string;
    sizeKb?: number;

    // Context controls (only used when global smart mode is off)
    includeMode?: ContextIncludeMode;
  };
  // Secret scanning fields
  hasSecrets: boolean;
  secretsRedacted: boolean;
  redactedContent?: string;
  secretFindings?: SecretFinding[];
  // Usage tracking
  lastUsedInMessageId?: string;
  lastUsedTimestamp?: number;
  usageCount?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  usedContext?: {
    mode: "smart" | "full";
    chunkCount: number;
    alwaysIncludedCount?: number;
    chunks?: Array<{
      sourceType: string;
      path?: string | null;
      text: string;
    }>;
  };
}

export interface PendingApproval {
  id: string;
  command: string;
  reason: string;
  category: string;
  terminalId: number;
  cwd?: string;
  timestamp: number;
}

interface AIState {
  contextItems: ContextItem[];
  messages: ChatMessage[];
  pendingApprovals: PendingApproval[];
  contextSmartMode: boolean;
}

type AIAction =
  | { type: "context:add"; item: ContextItem }
  | { type: "context:remove"; id: string }
  | { type: "context:clear" }
  | { type: "context:set-smart-mode"; value: boolean }
  | { type: "context:set-include-mode"; id: string; mode: ContextIncludeMode }
  | { type: "context:toggle-redaction"; id: string }
  | { type: "context:mark-used"; ids: string[]; messageId: string; timestamp: number }
  | { type: "chat:add"; message: ChatMessage }
  | { type: "chat:clear" }
  | { type: "chat:append"; id: string; content: string }
  | { type: "approval:add"; approval: PendingApproval }
  | { type: "approval:remove"; id: string };

const initialState: AIState = {
  contextItems: [],
  messages: [],
  pendingApprovals: [],
  contextSmartMode: true,
};

const aiReducer = (state: AIState, action: AIAction): AIState => {
  switch (action.type) {
    case "context:add":
      return {
        ...state,
        contextItems: [action.item, ...state.contextItems],
      };
    case "context:remove":
      return {
        ...state,
        contextItems: state.contextItems.filter((item) => item.id !== action.id),
      };
    case "context:clear":
      return {
        ...state,
        contextItems: [],
      };
    case "context:set-smart-mode":
      return {
        ...state,
        contextSmartMode: action.value,
      };
    case "context:set-include-mode":
      return {
        ...state,
        contextItems: state.contextItems.map((item) =>
          item.id === action.id
            ? {
                ...item,
                metadata: {
                  ...(item.metadata || {}),
                  includeMode: action.mode,
                },
              }
            : item
        ),
      };
    case "context:toggle-redaction":
      return {
        ...state,
        contextItems: state.contextItems.map((item) =>
          item.id === action.id
            ? { ...item, secretsRedacted: !item.secretsRedacted }
            : item
        ),
      };
    case "context:mark-used":
      return {
        ...state,
        contextItems: state.contextItems.map((item) =>
          action.ids.includes(item.id)
            ? {
                ...item,
                lastUsedInMessageId: action.messageId,
                lastUsedTimestamp: action.timestamp,
                usageCount: (item.usageCount || 0) + 1,
              }
            : item
        ),
      };
    case "chat:add":
      return {
        ...state,
        messages: [...state.messages, action.message],
      };
    case "chat:append":
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.id
            ? { ...message, content: `${message.content}${action.content}` }
            : message
        ),
      };
    case "chat:clear":
      return {
        ...state,
        messages: [],
      };
    case "approval:add":
      return {
        ...state,
        pendingApprovals: [...state.pendingApprovals, action.approval],
      };
    case "approval:remove":
      return {
        ...state,
        pendingApprovals: state.pendingApprovals.filter((a) => a.id !== action.id),
      };
    default:
      return state;
  }
};

interface AIContextValue extends AIState {
  formattedContextItems: string[];
  addContextItem: (item: ContextItem) => void;
  addContextItemWithScan: (content: string, type: ContextType, metadata?: ContextItem['metadata']) => Promise<void>;
  removeContextItem: (id: string) => void;
  clearContext: () => void;
  setContextSmartMode: (value: boolean) => void;
  setContextItemIncludeMode: (id: string, mode: ContextIncludeMode) => void;
  markContextAsUsed: (ids: string[], messageId: string) => void;
  addMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  buildPrompt: (userInput: string) => string;
  appendMessage: (id: string, content: string) => void;
  addPendingApproval: (approval: PendingApproval) => void;
  removePendingApproval: (id: string) => void;
  toggleSecretRedaction: (id: string) => void;
}

const AIContext = createContext<AIContextValue | undefined>(undefined);

export const AIProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(aiReducer, initialState);

  // Set up cross-window event synchronization
  useEffect(() => {
    const unlistenPromises = [
      listen<ContextItem>("ai-context:sync-add", (event) => {
        dispatch({ type: "context:add", item: event.payload });
      }),
      listen<{ id: string }>("ai-context:sync-remove", (event) => {
        dispatch({ type: "context:remove", id: event.payload.id });
      }),
      listen("ai-context:sync-clear", () => {
        dispatch({ type: "context:clear" });
      }),
    ];

    return () => {
      unlistenPromises.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, []);

  const addContextItem = useCallback((item: ContextItem) => {
    dispatch({ type: "context:add", item });
    // Broadcast to other windows
    invoke("emit_event", {
      event: "ai-context:sync-add",
      payload: item,
    }).catch((err) => console.error("Failed to broadcast context item:", err));
  }, []);

  const removeContextItem = useCallback((id: string) => {
    dispatch({ type: "context:remove", id });
    // Broadcast to other windows
    invoke("emit_event", {
      event: "ai-context:sync-remove",
      payload: { id },
    }).catch((err) => console.error("Failed to broadcast remove:", err));
  }, []);

  const clearContext = useCallback(() => {
    dispatch({ type: "context:clear" });
    // Broadcast to other windows
    invoke("emit_event", {
      event: "ai-context:sync-clear",
      payload: {},
    }).catch((err) => console.error("Failed to broadcast clear:", err));
  }, []);

  const setContextSmartMode = useCallback((value: boolean) => {
    dispatch({ type: 'context:set-smart-mode', value });
  }, []);

  const setContextItemIncludeMode = useCallback((id: string, mode: ContextIncludeMode) => {
    dispatch({ type: 'context:set-include-mode', id, mode });
  }, []);

  const markContextAsUsed = useCallback((ids: string[], messageId: string) => {
    dispatch({ type: 'context:mark-used', ids, messageId, timestamp: Date.now() });
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    dispatch({ type: "chat:add", message });
  }, []);

  const clearChat = useCallback(() => {
    dispatch({ type: "chat:clear" });
  }, []);

  const appendMessage = useCallback((id: string, content: string) => {
    dispatch({ type: "chat:append", id, content });
  }, []);

  const addPendingApproval = useCallback((approval: PendingApproval) => {
    dispatch({ type: "approval:add", approval });
  }, []);

  const removePendingApproval = useCallback((id: string) => {
    dispatch({ type: "approval:remove", id });
  }, []);

  // Centralized function that scans content for secrets before adding to context
  const addContextItemWithScan = useCallback(async (
    content: string,
    type: ContextType,
    metadata?: ContextItem['metadata']
  ) => {
    try {
      // Scan content for secrets
      const scanResult = await invoke<{
        has_secrets: boolean;
        findings: SecretFinding[];
        redacted_content: string;
      }>("scan_content_for_secrets", { content });

      // Also redact metadata fields if they contain secrets
      let redactedMetadata = metadata;
      if (scanResult.has_secrets && metadata) {
        redactedMetadata = { ...metadata };
        // For command_output, redact both command and output fields
        if (metadata.command && scanResult.redacted_content !== content) {
          // Apply the same replacements to metadata.command
          redactedMetadata.command = metadata.command;
          // Simple approach: scan each field separately
          const commandScanResult = await invoke<{
            has_secrets: boolean;
            findings: SecretFinding[];
            redacted_content: string;
          }>("scan_content_for_secrets", { content: metadata.command });
          if (commandScanResult.has_secrets) {
            redactedMetadata.command = commandScanResult.redacted_content;
          }
        }
        if (metadata.output && scanResult.redacted_content !== content) {
          const outputScanResult = await invoke<{
            has_secrets: boolean;
            findings: SecretFinding[];
            redacted_content: string;
          }>("scan_content_for_secrets", { content: metadata.output });
          if (outputScanResult.has_secrets) {
            redactedMetadata.output = outputScanResult.redacted_content;
          }
        }
      }

      const item: ContextItem = {
        id: crypto.randomUUID(),
        type,
        content,
        timestamp: Date.now(),
        metadata: redactedMetadata,
        hasSecrets: scanResult.has_secrets,
        secretsRedacted: scanResult.has_secrets, // Default to redacted if secrets found
        redactedContent: scanResult.has_secrets ? scanResult.redacted_content : undefined,
        secretFindings: scanResult.has_secrets ? scanResult.findings : undefined,
      };
      
      addContextItem(item);
    } catch (error) {
      console.error("Failed to scan content for secrets:", error);
      // Fall back to adding without secret detection
      const item: ContextItem = {
        id: crypto.randomUUID(),
        type,
        content,
        timestamp: Date.now(),
        metadata,
        hasSecrets: false,
        secretsRedacted: false,
      };
      addContextItem(item);
    }
  }, [addContextItem]);

  const toggleSecretRedaction = useCallback((id: string) => {
    dispatch({ type: "context:toggle-redaction", id });
  }, []);

  // Memoize expensive context item formatting
  const formattedContextItems = useMemo(() => {
    const itemsForPrompt = state.contextSmartMode
      ? state.contextItems
      : state.contextItems.filter((item) => item.metadata?.includeMode !== 'exclude');

    return itemsForPrompt.map((item) => {
      // Use redacted content if secrets exist and redaction is enabled
      const contentToUse = (item.hasSecrets && item.secretsRedacted && item.redactedContent)
        ? item.redactedContent
        : item.content;

      if (item.type === "command_output") {
        // For command_output, extract command and output from redacted content
        const command = item.metadata?.command || "";
        const output = contentToUse; // This already has secrets redacted if needed
        return `Type: command\nContent: ${command}\n\nType: output\nContent: ${output}`;
      }
      if (item.type === "file") {
        const pathLine = item.metadata?.path ? `\nPath: ${item.metadata.path}` : "";
        const truncatedLine =
          item.metadata?.truncated ? "\nTruncated: true" : "";
        return `Type: file\nContent: ${contentToUse}${pathLine}${truncatedLine}`;
      }
      if (item.metadata?.command) {
        return `Type: ${item.type}\nContent: ${contentToUse}\nCommand: ${item.metadata.command}`;
      }
      return `Type: ${item.type}\nContent: ${contentToUse}`;
    });
  }, [state.contextItems, state.contextSmartMode]);

  const buildPrompt = useCallback(
    (userInput: string) => {
      const trimmed = userInput.trim();
      const hasContext = formattedContextItems.length > 0;
      const contextBlock = hasContext
        ? formattedContextItems.join("\n\n")
        : "";

      const sections = [];
      if (contextBlock) {
        sections.push(`[Context Items]\n${contextBlock}`);
      }
      if (trimmed) {
        sections.push(`[User Query]\n${trimmed}`);
      }
      return sections.join("\n\n");
    },
    [formattedContextItems]
  );

  const value = useMemo(
    () => ({
      ...state,
      formattedContextItems,
      addContextItem,
      removeContextItem,
      clearContext,
      setContextSmartMode,
      setContextItemIncludeMode,
      markContextAsUsed,
      addMessage,
      clearChat,
      appendMessage,
      buildPrompt,
      addPendingApproval,
      removePendingApproval,
      addContextItemWithScan,
      toggleSecretRedaction,
    }),
    [
      state,
      formattedContextItems,
      addContextItem,
      removeContextItem,
      clearContext,
      setContextSmartMode,
      setContextItemIncludeMode,
      markContextAsUsed,
      addMessage,
      clearChat,
      appendMessage,
      buildPrompt,
      addPendingApproval,
      removePendingApproval,
      addContextItemWithScan,
      toggleSecretRedaction,
    ]
  );

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
};

export const useAIContext = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAIContext must be used within an AIProvider");
  }
  return context;
};
