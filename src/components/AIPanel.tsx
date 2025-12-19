import { useState } from "react";
import "./AIPanel.css";

type PanelTab = "chat" | "context";

interface AIPanelProps {
  onClose: () => void;
}

const AIPanel = ({ onClose }: AIPanelProps) => {
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-title">AI Panel</div>
        <button className="ai-panel-close" onClick={onClose} aria-label="Close AI panel">
          ×
        </button>
      </div>
      <div className="ai-panel-tabs">
        <button
          className={`ai-panel-tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat
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
            <div className="ai-panel-placeholder">Chat history will appear here.</div>
            <div className="ai-panel-input-row">
              <textarea
                className="ai-panel-input"
                placeholder="Ask about the terminal output..."
                rows={3}
              />
              <button className="ai-panel-send">Send</button>
            </div>
          </div>
        )}
        {activeTab === "context" && (
          <div className="ai-panel-section">
            <div className="ai-panel-placeholder">Staged context will show up here.</div>
            <button className="ai-panel-clear">Clear All</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIPanel;
