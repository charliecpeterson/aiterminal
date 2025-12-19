import { useMemo, useState } from "react";
import "./AIPanel.css";
import { useAIContext } from "../context/AIContext";
import { useSettings } from "../context/SettingsContext";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    if (contextItems.length === 0) return "No context";
    if (contextItems.length === 1) return "1 item attached";
    return `${contextItems.length} items attached`;
  }, [contextItems.length]);

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const payload = buildPrompt(trimmed);
    const requestId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    });
    addMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    setPrompt("");
    setSendError(null);
    if (!settings?.ai) {
      setIsSending(false);
      addMessage({
        id: crypto.randomUUID(),
        role: "system",
        content: "AI settings are missing. Open Settings to configure a provider.",
        timestamp: Date.now(),
      });
      return;
    }
    setIsSending(true);
    const chunkPromise = listen<{ request_id: string; content: string }>(
      "ai-stream:chunk",
      (event) => {
        if (event.payload.request_id !== requestId) return;
        appendMessage(assistantId, event.payload.content);
      }
    );
    const endPromise = listen<{ request_id: string }>("ai-stream:end", (event) => {
      if (event.payload.request_id !== requestId) return;
      setIsSending(false);
      chunkPromise.then((unlisten) => unlisten());
      endPromise.then((unlisten) => unlisten());
      errorPromise.then((unlisten) => unlisten());
    });
    const errorPromise = listen<{ request_id: string; error: string }>(
      "ai-stream:error",
      (event) => {
        if (event.payload.request_id !== requestId) return;
        setIsSending(false);
        setSendError(event.payload.error);
        addMessage({
          id: crypto.randomUUID(),
          role: "system",
          content: `Request failed: ${event.payload.error}`,
          timestamp: Date.now(),
        });
        chunkPromise.then((unlisten) => unlisten());
        endPromise.then((unlisten) => unlisten());
        errorPromise.then((unlisten) => unlisten());
      }
    );

    invoke("ai_chat_stream", {
      provider: settings.ai.provider,
      apiKey: settings.ai.api_key,
      url: settings.ai.url,
      model: settings.ai.model,
      prompt: payload,
      requestId,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setSendError(message);
      setIsSending(false);
      addMessage({
        id: crypto.randomUUID(),
        role: "system",
        content: `Request failed: ${message}`,
        timestamp: Date.now(),
      });
      chunkPromise.then((unlisten) => unlisten());
      endPromise.then((unlisten) => unlisten());
      errorPromise.then((unlisten) => unlisten());
    });
  };

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const roleLabel = (role: "user" | "assistant" | "system") => {
    if (role === "user") return "You";
    if (role === "system") return "System";
    return "Assistant";
  };

  const handleCopyCode = async (code: string) => {
    try {
      await writeText(code);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };
  
  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        code: ({ className, children }) => {
          const raw = String(children).replace(/\n$/, "");
          const language = className?.replace("language-", "");
          if (!language) {
            return <code>{raw}</code>;
          }
          return (
            <div className="ai-panel-code-block">
              <div className="ai-panel-code-header">
                <span className="ai-panel-code-lang">{language}</span>
                <div className="ai-panel-code-actions">
                  <button className="ai-panel-code-copy" onClick={() => handleCopyCode(raw)}>
                    Copy
                  </button>
                  <button
                    className="ai-panel-code-run"
                    onClick={() => emitTo("main", "ai-run-command", { command: raw })}
                  >
                    Run
                  </button>
                </div>
              </div>
              <pre>
                <code>{raw}</code>
              </pre>
            </div>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  const handleCaptureLast = () => {
    const count = Math.max(1, Math.min(50, captureCount));
    emitTo("main", "ai-context:capture-last", { count }).catch((err) => {
      console.error("Failed to request capture:", err);
    });
  };

  const handleCaptureFile = () => {
    const path = filePath.trim();
    if (!path) return;
    const kb = Number.isFinite(fileLimitKb) ? Math.max(1, Math.min(2048, fileLimitKb)) : 200;
    emitTo("main", "ai-context:capture-file", {
      path,
      maxBytes: kb * 1024,
    }).catch((err) => {
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
                      <span>{formatTime(message.timestamp)}</span>
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
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    handleSend();
                  }
                }}
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
                          <div className="ai-panel-context-time">{formatTime(item.timestamp)}</div>
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
