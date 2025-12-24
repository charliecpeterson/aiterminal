import { createContext, useCallback, useContext, useMemo, useReducer, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export type ContextType = "command" | "output" | "selection" | "file" | "command_output";

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
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
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
}

type AIAction =
  | { type: "context:add"; item: ContextItem }
  | { type: "context:remove"; id: string }
  | { type: "context:clear" }
  | { type: "chat:add"; message: ChatMessage }
  | { type: "chat:clear" }
  | { type: "chat:append"; id: string; content: string }
  | { type: "approval:add"; approval: PendingApproval }
  | { type: "approval:remove"; id: string };

const initialState: AIState = {
  contextItems: [],
  messages: [],
  pendingApprovals: [],
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
  addContextItem: (item: ContextItem) => void;
  removeContextItem: (id: string) => void;
  clearContext: () => void;
  addMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  buildPrompt: (userInput: string) => string;
  appendMessage: (id: string, content: string) => void;
  addPendingApproval: (approval: PendingApproval) => void;
  removePendingApproval: (id: string) => void;
}

const AIContext = createContext<AIContextValue | undefined>(undefined);

export const AIProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(aiReducer, initialState);

  // Set up cross-window event synchronization
  useEffect(() => {
    const unlistenPromises = [
      listen<ContextItem>("ai-context:sync-add", (event) => {
        console.log('[AIContext] Received sync-add event', event.payload);
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
    console.log('[AIContext] Adding context item', item);
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

  // Memoize expensive context item formatting
  const formattedContextItems = useMemo(() => {
    return state.contextItems.map((item) => {
      if (item.type === "command_output") {
        const command = item.metadata?.command || "";
        const output = item.metadata?.output || item.content;
        return `Type: command\nContent: ${command}\n\nType: output\nContent: ${output}`;
      }
      if (item.type === "file") {
        const pathLine = item.metadata?.path ? `\nPath: ${item.metadata.path}` : "";
        const truncatedLine =
          item.metadata?.truncated ? "\nTruncated: true" : "";
        return `Type: file\nContent: ${item.content}${pathLine}${truncatedLine}`;
      }
      if (item.metadata?.command) {
        return `Type: ${item.type}\nContent: ${item.content}\nCommand: ${item.metadata.command}`;
      }
      return `Type: ${item.type}\nContent: ${item.content}`;
    });
  }, [state.contextItems]);

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
      addContextItem,
      removeContextItem,
      clearContext,
      addMessage,
      clearChat,
      appendMessage,
      buildPrompt,
      addPendingApproval,
      removePendingApproval,
    }),
    [
      state,
      addContextItem,
      removeContextItem,
      clearContext,
      addMessage,
      clearChat,
      appendMessage,
      buildPrompt,
      addPendingApproval,
      removePendingApproval,
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
