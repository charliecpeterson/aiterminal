import { useMemo, useState, useCallback } from "react";
import "./AIPanel.css";
import { useAIContext } from "../context/AIContext";
import { useSettings } from "../context/SettingsContext";
import { sendChatMessage } from "../ai/chatSend";
import { requestCaptureFile, requestCaptureLast } from "../ai/contextCapture";
import { formatContextCountLabel } from "../ai/panelUi";
import { AIChatTab } from "./AIChatTab";
import { AIContextTab } from "./AIContextTab";

type PanelTab = "chat" | "context";

interface AIPanelProps {
  onClose?: () => void;
  onDetach?: () => void;
  onAttach?: () => void;
  mode?: "docked" | "detached";
  activeTerminalId?: number | null;
}

const AIPanel = ({
  onClose,
  onDetach,
  onAttach,
  mode = "docked",
  activeTerminalId,
}: AIPanelProps) => {
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

  const handleSend = useCallback(() => {
    sendChatMessage({
      prompt,
      buildPrompt,
      settingsAi: settings?.ai,
      settingsStreaming: settings?.streaming,
      addMessage,
      appendMessage,
      setPrompt,
      setIsSending,
      setSendError,
    });
  }, [prompt, buildPrompt, settings?.ai, settings?.streaming, addMessage, appendMessage]);

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
          <AIChatTab
            messages={messages}
            prompt={prompt}
            setPrompt={setPrompt}
            isSending={isSending}
            sendError={sendError}
            onSend={handleSend}
            onClearChat={clearChat}
            contextCountLabel={contextCountLabel}
            targetTerminalId={activeTerminalId}
          />
        )}
        {activeTab === "context" && (
          <AIContextTab
            contextItems={contextItems}
            expandedContextId={expandedContextId}
            setExpandedContextId={setExpandedContextId}
            removeContextItem={removeContextItem}
            clearContext={clearContext}
            captureCount={captureCount}
            setCaptureCount={setCaptureCount}
            onCaptureLast={handleCaptureLast}
            filePath={filePath}
            setFilePath={setFilePath}
            fileLimitKb={fileLimitKb}
            setFileLimitKb={setFileLimitKb}
            onCaptureFile={handleCaptureFile}
          />
        )}
      </div>
    </div>
  );
};

export default AIPanel;
