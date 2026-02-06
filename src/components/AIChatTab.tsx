import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage, PendingApproval } from "../context/AIContext";
import { formatChatTime, handlePromptKeyDown, roleLabel } from "../ai/panelUi";
import { AIMarkdown } from "./AIMarkdown";
import { ToolExecutionStatus, type ToolExecution } from "./ToolExecutionStatus";
import { MessageMetrics } from "./ContextUsageDisplay";
import { ToolProgressDisplay } from "./ToolProgressDisplay";
import { chatStyles } from "./AIChatTab.styles";

// Send arrow icon component
const SendIcon = () => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

// Stop/Cancel icon component
const StopIcon = () => (
  <svg 
    width="14" 
    height="14" 
    viewBox="0 0 24 24" 
    fill="currentColor"
  >
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export type QuickActionType = 'summarize' | 'explain-error' | 'draft-fix';

export function AIChatTab(props: {
  messages: ChatMessage[];
  prompt: string;
  setPrompt: (value: string) => void;
  isSending: boolean;
  sendError: string | null;
  onSend: () => void;
  onCancel?: () => void;
  onClearChat: () => void;
  targetTerminalId?: number | null;
  pendingApprovals?: PendingApproval[];
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
  onQuickAction?: (action: QuickActionType) => void;
}) {
  const {
    messages,
    prompt,
    setPrompt,
    isSending,
    sendError,
    onSend,
    onCancel,
    targetTerminalId,
    pendingApprovals = [],
    onApprove,
    onDeny,
    onQuickAction,
  } = props;

  const [inputFocus, setInputFocus] = useState(false);
  
  // Ref for auto-resize textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate new height (min 24px, max 120px as defined in styles)
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 120);
    textarea.style.height = `${newHeight}px`;
  }, []);

  // Adjust height when prompt changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [prompt, adjustTextareaHeight]);

  const renderMarkdown = (content: string) => (
    <AIMarkdown
      content={content}
      onRunCommand={(command) => {
        const payload =
          targetTerminalId === null || targetTerminalId === undefined
            ? { command, source: "ai-panel" }
            : { command, terminalId: targetTerminalId, source: "ai-panel" };
        invoke("emit_event", { event: "ai-run-command", payload });
      }}
    />
  );

  // Convert pending approvals to tool executions (memoized to prevent unnecessary re-renders)
  const toolExecutions = useMemo<ToolExecution[]>(() => 
    pendingApprovals.map(approval => ({
      id: approval.id,
      toolName: 'execute_command',
      status: 'pending' as const,
      command: approval.command,
      workingDirectory: approval.cwd,
      startTime: approval.timestamp,
    }))
  , [pendingApprovals]);

  return (
    <div style={chatStyles.section}>
      {/* Pending Approvals */}
      {toolExecutions.length > 0 && (
        <ToolExecutionStatus
          executions={toolExecutions}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      )}
      
      <div style={chatStyles.messageList}>
        {messages.length === 0 ? (
          <div style={chatStyles.introCard}>
            <div style={chatStyles.introTitle}>Start a conversation</div>
            <div style={chatStyles.introBody}>
              Ask about terminal output, draft commands, or get help with errors.
            </div>
            <div style={chatStyles.chipRow}>
              <button
                className="chat-chip"
                onClick={() => onQuickAction?.('summarize')}
              >
                Summarize last command
              </button>
              <button
                className="chat-chip"
                onClick={() => onQuickAction?.('explain-error')}
              >
                Explain error
              </button>
              <button
                className="chat-chip"
                onClick={() => onQuickAction?.('draft-fix')}
              >
                Draft a fix
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id} 
              style={
                message.role === 'user'
                  ? { ...chatStyles.message, ...chatStyles.messageUser }
                  : { ...chatStyles.message, ...chatStyles.messageAssistant }
              }
            >
              <div style={chatStyles.messageMeta}>
                <span style={chatStyles.messageRole}>{roleLabel(message.role)}</span>
                <span style={chatStyles.messageTime}>{formatChatTime(message.timestamp)}</span>
              </div>
              <div style={chatStyles.messageBody}>{renderMarkdown(message.content)}</div>
              
              {message.role === 'assistant' && message.toolProgress && message.toolProgress.length > 0 && (
                <ToolProgressDisplay toolProgress={message.toolProgress} />
              )}
              
              {message.role === 'assistant' && message.metrics && (
                <MessageMetrics 
                  metrics={message.metrics}
                  usedContext={message.usedContext}
                  routingDecision={message.routingDecision}
                  promptEnhancement={message.promptEnhancement}
                />
              )}
              
              {/* Show routing info for user messages if available */}
              {message.role === 'user' && (message.routingDecision || message.promptEnhancement) && (
                <MessageMetrics 
                  routingDecision={message.routingDecision}
                  promptEnhancement={message.promptEnhancement}
                />
              )}
            </div>
          ))
        )}
      </div>

      <div style={chatStyles.inputRow}>
        <div 
          style={{
            ...chatStyles.inputContainer,
            ...(isSending ? chatStyles.inputContainerDisabled : {}),
            ...(inputFocus && !isSending ? chatStyles.inputContainerFocus : {}),
          }}
        >
          <textarea
            ref={textareaRef}
            style={{
              ...chatStyles.input,
              ...(isSending ? chatStyles.inputDisabled : {}),
            }}
            placeholder="Ask about the terminal output..."
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => handlePromptKeyDown(event, onSend)}
            onFocus={() => setInputFocus(true)}
            onBlur={() => setInputFocus(false)}
            disabled={isSending}
          />
          {isSending ? (
            <button
              style={chatStyles.cancelButton}
              onClick={onCancel}
              title="Cancel"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              style={{
                ...chatStyles.sendButton,
                ...(!prompt.trim() ? chatStyles.sendButtonDisabled : {}),
              }}
              onClick={onSend}
              disabled={!prompt.trim()}
              title="Send (Enter)"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>

      {sendError && <div style={chatStyles.error}>{sendError}</div>}
    </div>
  );
}
