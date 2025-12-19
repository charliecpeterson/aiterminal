import { useMemo, useState } from "react";
import "./AIPanel.css";
import { useAIContext } from "../context/AIContext";
import { useSettings } from "../context/SettingsContext";
import { emitTo } from "@tauri-apps/api/event";
import { sendChatMessage } from "../ai/chatSend";
import { requestCaptureFile, requestCaptureLast } from "../ai/contextCapture";
import {
  formatChatTime,
  formatContextCountLabel,
  handlePromptKeyDown,
  roleLabel,
} from "../ai/panelUi";
import { AIMarkdown } from "./AIMarkdown";

type PanelTab = "chat" | "context";

interface AIPanelProps {
  onClose?: () => void;
  onDetach?: () => void;
  onAttach?: () => void;
  mode?: "docked" | "detached";
}

const AIPanel = ({ onClose, onDetach, onAttach, mode = "docked" }: AIPanelProps) => {
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");
  const [prompt, setPrompt] = useState("");
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(1);
  const [filePath, setFilePath] = useState("");
  const [fileLimitKb, setFileLimitKb] = useState(200);
  const { settings } = useSettings();
  const {
    contextItems,
    messages,
    addMessage,
    appendMessage,
    removeContextItem,
    clearContext,
    clearChat,
    buildPrompt,
  } = useAIContext();

  const contextCountLabel = useMemo(() => {
    return formatContextCountLabel(contextItems.length);
  }, [contextItems.length]);

  const handleSend = () => {
    sendChatMessage({
      prompt,
      buildPrompt,
      settingsAi: settings?.ai,
      addMessage,
      appendMessage,
      setPrompt,
      setIsSending,
      setSendError,
    });
  };

  const renderMarkdown = (content: string) => (
    <AIMarkdown
      content={content}
      onRunCommand={(command) => emitTo("main", "ai-run-command", { command })}
    />
  );

  const handleCaptureLast = () => {
    requestCaptureLast(captureCount).catch((err) => {
      console.error("Failed to request capture:", err);
    });
  };

  const handleCaptureFile = () => {
    requestCaptureFile({ path: filePath, fileLimitKb }).catch((err) => {
      console.error("Failed to request file capture:", err);
    });
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <div className="ai-panel-title-text">AI Panel</div>
          <div className="ai-panel-subtitle">Terminal context</div>
        </div>
        <div className="ai-panel-actions">
          {onDetach && (
            <button className="ai-panel-action" onClick={onDetach}>
              Detach
            </button>
          )}
          {onAttach && mode === "detached" && (
            <button className="ai-panel-action" onClick={onAttach}>
              Attach
            </button>
          )}
          {onClose && mode === "docked" && (
            <button className="ai-panel-close" onClick={onClose} aria-label="Close AI panel">
              ×
            </button>
          )}
        </div>
      </div>
      <div className="ai-panel-tabs">
        <button
          className={`ai-panel-tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
          {contextItems.length > 0 && (
            <span className="ai-panel-tab-badge">{contextItems.length}</span>
          )}
        </button>
        <button
          className={`ai-panel-tab ${activeTab === "context" ? "active" : ""}`}
          onClick={() => setActiveTab("context")}
        >
          Context
        </button>
      </div>
      <div className="ai-panel-body">
        {activeTab === "chat" && (
          <div className="ai-panel-section">
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
                    <div className="ai-panel-message-body">
                      {renderMarkdown(message.content)}
                    </div>
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
                onKeyDown={(event) => handlePromptKeyDown(event, handleSend)}
              />
              <button className="ai-panel-send" onClick={handleSend} disabled={isSending}>
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
            <div className="ai-panel-input-footer">
              <span>{contextCountLabel}</span>
              <button className="ai-panel-clear" onClick={clearChat}>
                Clear Chat
              </button>
            </div>
            {sendError && <div className="ai-panel-error">{sendError}</div>}
          </div>
        )}
        {activeTab === "context" && (
          <div className="ai-panel-section">
            <div className="ai-panel-card">
              <div className="ai-panel-card-title">Context staging</div>
              <div className="ai-panel-card-body">
                Selected output and notes appear here.
              </div>
            </div>
            {contextItems.length > 0 ? (
              <div className="ai-panel-context-list">
                {contextItems.map((item) => {
                  const isExpanded = expandedContextId === item.id;
                  return (
                    <div key={item.id} className="ai-panel-context-card">
                      <div className="ai-panel-context-header">
                        <div>
                          <div className="ai-panel-context-type">{item.type}</div>
                          <div className="ai-panel-context-time">{formatChatTime(item.timestamp)}</div>
                        </div>
                        <div className="ai-panel-context-actions">
                          <button
                            className="ai-panel-link"
                            onClick={() =>
                              setExpandedContextId(isExpanded ? null : item.id)
                            }
                          >
                            {isExpanded ? "Collapse" : "Preview"}
                          </button>
                          <button
                            className="ai-panel-link danger"
                            onClick={() => removeContextItem(item.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className={`ai-panel-context-body ${isExpanded ? "expanded" : ""}`}>
                        {item.type === "command_output" ? (
                          <>
                            {item.metadata?.command && (
                              <div className="ai-panel-context-block">
                                <div className="ai-panel-context-label">Command</div>
                                <div className="ai-panel-context-content">{item.metadata.command}</div>
                              </div>
                            )}
                            {item.metadata?.output && (
                              <div className="ai-panel-context-block">
                                <div className="ai-panel-context-label">Output</div>
                                <div className="ai-panel-context-content">{item.metadata.output}</div>
                              </div>
                            )}
                          </>
                        ) : item.type === "file" ? (
                          <>
                            {item.metadata?.path && (
                              <div className="ai-panel-context-block">
                                <div className="ai-panel-context-label">Path</div>
                                <div className="ai-panel-context-content">{item.metadata.path}</div>
                              </div>
                            )}
                            <div className="ai-panel-context-block">
                              <div className="ai-panel-context-label">Content</div>
                              <div className="ai-panel-context-content">{item.content}</div>
                            </div>
                          </>
                        ) : (
                          item.content
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ai-panel-empty">No context items yet.</div>
            )}
            <div className="ai-panel-context-actions">
              <div className="ai-panel-capture-row">
                <label htmlFor="ai-capture-count">Last</label>
                <input
                  id="ai-capture-count"
                  type="number"
                  min={1}
                  max={50}
                  value={captureCount}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    setCaptureCount(Number.isFinite(value) ? value : 1);
                  }}
                />
                <button className="ai-panel-action ghost" onClick={handleCaptureLast}>
                  Capture
                </button>
              </div>
              <div className="ai-panel-file-row">
                <input
                  type="text"
                  value={filePath}
                  onChange={(event) => setFilePath(event.target.value)}
                  placeholder="Add file path…"
                />
                <input
                  type="number"
                  min={1}
                  max={2048}
                  value={fileLimitKb}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    setFileLimitKb(Number.isFinite(value) ? value : 200);
                  }}
                />
                <span className="ai-panel-unit">KB</span>
                <button className="ai-panel-action ghost" onClick={handleCaptureFile}>
                  Add File
                </button>
              </div>
              <button className="ai-panel-clear" onClick={clearContext}>
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIPanel;
