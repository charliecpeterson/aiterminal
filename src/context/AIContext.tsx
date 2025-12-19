import { createContext, useCallback, useContext, useMemo, useReducer } from "react";

export type ContextType = "command" | "output" | "selection" | "file" | "command_output";

export interface ContextItem {
  id: string;
  type: ContextType;
  content: string;
  timestamp: number;
  metadata?: {
    command?: string;
    output?: string;
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

interface AIState {
  contextItems: ContextItem[];
  messages: ChatMessage[];
}

type AIAction =
  | { type: "context:add"; item: ContextItem }
  | { type: "context:remove"; id: string }
  | { type: "context:clear" }
  | { type: "chat:add"; message: ChatMessage }
  | { type: "chat:clear" }
  | { type: "chat:append"; id: string; content: string };

const initialState: AIState = {
  contextItems: [],
  messages: [],
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
}

const AIContext = createContext<AIContextValue | undefined>(undefined);

export const AIProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(aiReducer, initialState);

  const addContextItem = useCallback((item: ContextItem) => {
    dispatch({ type: "context:add", item });
  }, []);

  const removeContextItem = useCallback((id: string) => {
    dispatch({ type: "context:remove", id });
  }, []);

  const clearContext = useCallback(() => {
    dispatch({ type: "context:clear" });
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

  const buildPrompt = useCallback(
    (userInput: string) => {
      const trimmed = userInput.trim();
      const hasContext = state.contextItems.length > 0;
      const contextBlock = hasContext
        ? state.contextItems
            .map((item) => {
              if (item.type === "command_output") {
                const command = item.metadata?.command || "";
                const output = item.metadata?.output || item.content;
                return `Type: command\nContent: ${command}\n\nType: output\nContent: ${output}`;
              }
              if (item.metadata?.command) {
                return `Type: ${item.type}\nContent: ${item.content}\nCommand: ${item.metadata.command}`;
              }
              return `Type: ${item.type}\nContent: ${item.content}`;
            })
            .join("\n\n")
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
    [state.contextItems]
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
