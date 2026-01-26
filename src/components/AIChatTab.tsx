import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage, PendingApproval } from "../context/AIContext";
import { formatChatTime, handlePromptKeyDown, roleLabel } from "../ai/panelUi";
import { AIMarkdown } from "./AIMarkdown";
import { ToolExecutionStatus, type ToolExecution } from "./ToolExecutionStatus";
import { MessageMetrics } from "./ContextUsageDisplay";
import { ToolProgressDisplay } from "./ToolProgressDisplay";
import { chatStyles } from "./AIChatTab.styles";

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
  } = props;

  // Hover states for interactive elements
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
  const [inputFocus, setInputFocus] = useState(false);

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

  // Convert pending approvals to tool executions
  const toolExecutions: ToolExecution[] = pendingApprovals.map(approval => ({
    id: approval.id,
    toolName: 'execute_command',
    status: 'pending' as const,
    command: approval.command,
    workingDirectory: approval.cwd,
    startTime: approval.timestamp,
  }));

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
                style={
                  hoverStates.chip1
                    ? { ...chatStyles.chip, ...chatStyles.chipHover }
                    : chatStyles.chip
                }
                onMouseEnter={() => setHoverStates(prev => ({ ...prev, chip1: true }))}
                onMouseLeave={() => setHoverStates(prev => ({ ...prev, chip1: false }))}
                onClick={() => setPrompt("Summarize the last command and output.")}
              >
                Summarize last command
              </button>
              <button
                style={
                  hoverStates.chip2
                    ? { ...chatStyles.chip, ...chatStyles.chipHover }
                    : chatStyles.chip
                }
                onMouseEnter={() => setHoverStates(prev => ({ ...prev, chip2: true }))}
                onMouseLeave={() => setHoverStates(prev => ({ ...prev, chip2: false }))}
                onClick={() => setPrompt("Explain this error and suggest a fix.")}
              >
                Explain error
              </button>
              <button
                style={
                  hoverStates.chip3
                    ? { ...chatStyles.chip, ...chatStyles.chipHover }
                    : chatStyles.chip
                }
                onMouseEnter={() => setHoverStates(prev => ({ ...prev, chip3: true }))}
                onMouseLeave={() => setHoverStates(prev => ({ ...prev, chip3: false }))}
                onClick={() => setPrompt("Draft a fix for the issue above.")}
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
                />
              )}
            </div>
          ))
        )}
      </div>

      <div style={chatStyles.inputRow}>
        <textarea
          style={
            isSending
              ? { ...chatStyles.input, ...chatStyles.inputDisabled }
              : inputFocus
                ? { ...chatStyles.input, ...chatStyles.inputFocus }
                : chatStyles.input
          }
          placeholder="Ask about the terminal output..."
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => handlePromptKeyDown(event, onSend)}
          onFocus={() => setInputFocus(true)}
          onBlur={() => setInputFocus(false)}
          disabled={isSending}
        />
        {isSending ? (
          <button
            style={
              hoverStates.cancelBtn
                ? { ...chatStyles.cancelButton, ...chatStyles.cancelButtonHover }
                : chatStyles.cancelButton
            }
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, cancelBtn: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, cancelBtn: false }))}
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : (
          <button
            style={
              hoverStates.sendBtn
                ? { ...chatStyles.sendButton, ...chatStyles.sendButtonHover }
                : chatStyles.sendButton
            }
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, sendBtn: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, sendBtn: false }))}
            onClick={onSend}
          >
            Send
          </button>
        )}
      </div>

      {sendError && <div style={chatStyles.error}>{sendError}</div>}
    </div>
  );
}
