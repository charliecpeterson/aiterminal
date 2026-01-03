import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage, PendingApproval } from "../context/AIContext";
import { formatChatTime, handlePromptKeyDown, roleLabel } from "../ai/panelUi";
import { AIMarkdown } from "./AIMarkdown";
import { ToolExecutionStatus, type ToolExecution } from "./ToolExecutionStatus";

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
    <div className="ai-panel-section">
      {/* Pending Approvals */}
      {toolExecutions.length > 0 && (
        <ToolExecutionStatus
          executions={toolExecutions}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      )}
      
      <div className="ai-panel-message-list">
        {messages.length === 0 ? (
          <div className="ai-panel-card ai-panel-intro">
            <div className="ai-panel-card-title">Start a prompt</div>
            <div className="ai-panel-card-body">
              Ask about output or draft commands with terminal context.
            </div>
            <div className="ai-panel-chip-row">
              <button
                className="ai-panel-chip"
                onClick={() => setPrompt("Summarize the last command and output.")}
              >
                Summarize last command
              </button>
              <button
                className="ai-panel-chip"
                onClick={() => setPrompt("Explain this error and suggest a fix.")}
              >
                Explain error
              </button>
              <button
                className="ai-panel-chip"
                onClick={() => setPrompt("Draft a fix for the issue above.")}
              >
                Draft fix
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`ai-panel-message ${message.role}`}>
              <div className="ai-panel-message-meta">
                <span>{roleLabel(message.role)}</span>
                <span>{formatChatTime(message.timestamp)}</span>
              </div>
              <div className="ai-panel-message-body">{renderMarkdown(message.content)}</div>

              {message.role === 'assistant' && message.usedContext && (
                <details className="ai-used-context">
                  <summary>
                    Context used: {message.usedContext.mode === 'smart' ? 'Smart' : 'Full'}
                    {message.usedContext.mode === 'smart' && typeof message.usedContext.alwaysIncludedCount === 'number'
                      ? ` (retrieved ${message.usedContext.chunkCount}, always ${message.usedContext.alwaysIncludedCount})`
                      : ` (${message.usedContext.chunkCount})`
                    }
                  </summary>
                  {message.usedContext.chunks && message.usedContext.chunks.length > 0 ? (
                    <div className="ai-used-context-list">
                      {message.usedContext.chunks.map((c, idx) => (
                        <details key={`${message.id}-ctx-${idx}`} className="ai-used-context-chunk">
                          <summary>
                            {c.sourceType}{c.path ? ` — ${c.path}` : ''}
                          </summary>
                          <pre className="ai-used-context-text">{c.text}</pre>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <div className="ai-used-context-empty">No retrieved chunks.</div>
                  )}
                </details>
              )}
            </div>
          ))
        )}
      </div>

      <div className="ai-panel-input-row">
        <textarea
          className="ai-panel-input"
          placeholder="Ask about the terminal output..."
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => handlePromptKeyDown(event, onSend)}
          disabled={isSending}
        />
        {isSending ? (
          <button className="ai-panel-cancel" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button className="ai-panel-send" onClick={onSend}>
            Send
          </button>
        )}
      </div>

      {sendError && <div className="ai-panel-error">{sendError}</div>}
    </div>
  );
}
