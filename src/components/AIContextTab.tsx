import { useMemo } from "react";
import { AlertTriangle, Lock, Unlock, ChevronUp, ChevronDown, X, ClipboardList, Lightbulb } from 'lucide-react';
import type { ContextIncludeMode, ContextItem } from "../context/AIContext";
import { formatChatTime } from "../ai/panelUi";
import "./AIContextTab.css";

export function AIContextTab(props: {
  contextItems: ContextItem[];
  expandedContextId: string | null;
  setExpandedContextId: (value: string | null) => void;
  removeContextItem: (id: string) => void;
  clearContext: () => void;
  toggleSecretRedaction: (id: string) => void;

  contextSmartMode: boolean;
  setContextSmartMode: (value: boolean) => void;
  setContextItemIncludeMode: (id: string, mode: ContextIncludeMode) => void;

  captureCount: number;
  setCaptureCount: (value: number) => void;
  onCaptureLast: () => void;
}) {
  const {
    contextItems,
    expandedContextId,
    setExpandedContextId,
    removeContextItem,
    clearContext,
    toggleSecretRedaction,
    contextSmartMode,
    setContextSmartMode,
    setContextItemIncludeMode,
    captureCount,
    setCaptureCount,
    onCaptureLast,
  } = props;

  const effectiveIncludeMode = (item: ContextItem): ContextIncludeMode => {
    if (contextSmartMode) return "smart";
    return item.metadata?.includeMode ?? "smart";
  };

  // Memoize expensive context item rendering
  const renderedContextItems = useMemo(() => {
    return contextItems.map((item) => {
      const isExpanded = expandedContextId === item.id;
      const includeMode = effectiveIncludeMode(item);
      const contentToDisplay = (item.hasSecrets && item.secretsRedacted && item.redactedContent)
        ? item.redactedContent
        : item.content;

      // Truncate preview to first 100 chars
      const preview = contentToDisplay.slice(0, 100) + (contentToDisplay.length > 100 ? '...' : '');

      return (
        <div key={item.id} className="ai-context-item">
          <div className="ai-context-item-header">
            <div className="ai-context-item-info">
              <div className="ai-context-item-meta">
                <span className="ai-context-item-type">{item.type}</span>
                <span className="ai-context-item-time">{formatChatTime(item.timestamp)}</span>
                {item.hasSecrets && (
                  <span title="Contains sensitive data">
                    <AlertTriangle size={12} style={{ color: '#ffa500' }} />
                  </span>
                )}
              </div>
              
              {item.metadata?.path && (
                <div className="ai-context-item-path" title={item.metadata.path}>
                  {item.metadata.path}
                </div>
              )}
              
              {item.hasSecrets && (
                <div className="ai-context-item-secrets">
                  {item.secretsRedacted 
                    ? `${item.secretFindings?.length || 0} secret(s) hidden`
                    : `${item.secretFindings?.length || 0} secret(s) visible`
                  }
                </div>
              )}
            </div>
            
            <div className="ai-context-item-actions">
              {!contextSmartMode && (
                <div className="ai-context-item-mode-toggle">
                  <button
                    type="button"
                    className={`ai-context-item-mode-btn ${includeMode === 'smart' ? 'active' : ''}`}
                    onClick={() => setContextItemIncludeMode(item.id, 'smart')}
                    title="Smart mode"
                  >
                    S
                  </button>
                  <button
                    type="button"
                    className={`ai-context-item-mode-btn ${includeMode === 'always' ? 'active' : ''}`}
                    onClick={() => setContextItemIncludeMode(item.id, 'always')}
                    title="Always include"
                  >
                    A
                  </button>
                  <button
                    type="button"
                    className={`ai-context-item-mode-btn ${includeMode === 'exclude' ? 'active' : ''}`}
                    onClick={() => setContextItemIncludeMode(item.id, 'exclude')}
                    title="Exclude"
                  >
                    X
                  </button>
                </div>
              )}
              
              {item.hasSecrets && (
                <button
                  className="ai-context-action-btn"
                  onClick={() => toggleSecretRedaction(item.id)}
                  title={item.secretsRedacted ? 'Show secrets' : 'Hide secrets'}
                >
                  {item.secretsRedacted ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
              )}
              
              <button
                className="ai-context-action-btn"
                onClick={() => setExpandedContextId(isExpanded ? null : item.id)}
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              
              <button
                className="ai-context-action-btn danger"
                onClick={() => removeContextItem(item.id)}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {!isExpanded && (
            <div className="ai-context-item-preview">
              {item.metadata?.command ? `$ ${item.metadata.command}` : preview}
            </div>
          )}

          {isExpanded && (
            <div className={`ai-context-item-body ${isExpanded ? "expanded" : ""}`}>
              {item.type === "command_output" ? (
                <>
                  {item.metadata?.command && (
                    <div className="ai-context-content-block">
                      <div className="ai-context-content-label">Command</div>
                      <div className="ai-context-content-text">{item.metadata.command}</div>
                    </div>
                  )}
                  {item.metadata?.output && (
                    <div className="ai-context-content-block">
                      <div className="ai-context-content-label">Output</div>
                      <div className="ai-context-content-text">{contentToDisplay}</div>
                    </div>
                  )}
                </>
              ) : item.type === "file" ? (
                <div className="ai-context-content-block">
                  <div className="ai-context-content-label">Content</div>
                  <div className="ai-context-content-text">{contentToDisplay}</div>
                </div>
              ) : (
                <div className="ai-context-content-block">
                  <div className="ai-context-content-text">{contentToDisplay}</div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  }, [contextItems, expandedContextId, setExpandedContextId, removeContextItem, toggleSecretRedaction, contextSmartMode, setContextItemIncludeMode]);

  return (
    <div className="ai-context-tab">
      <div className="ai-context-header">
        <div className="ai-context-title">Context Staging</div>
        <div className="ai-context-description">
          Selected output and notes appear here for AI conversation.
        </div>
      </div>

      <div className="ai-context-controls">
        <div className="ai-context-smart-mode">
          <span className="ai-context-smart-mode-label">Smart Context</span>
          <div className="ai-context-mode-toggle">
            <button
              type="button"
              className={`ai-context-mode-btn ${contextSmartMode ? 'active' : ''}`}
              onClick={() => setContextSmartMode(true)}
            >
              On
            </button>
            <button
              type="button"
              className={`ai-context-mode-btn ${!contextSmartMode ? 'active' : ''}`}
              onClick={() => setContextSmartMode(false)}
            >
              Off
            </button>
          </div>
        </div>
      </div>

      {contextItems.length > 0 ? (
        <div className="ai-context-list">
          {renderedContextItems}
        </div>
      ) : (
        <div className="ai-context-empty">
          <div className="ai-context-empty-icon"><ClipboardList size={32} /></div>
          <div>No context items yet.</div>
          <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.6 }}>
            Use aiterm_add in terminal or select text/commands
          </div>
        </div>
      )}

      <div className="ai-context-footer">
        <div className="ai-context-capture-row">
          <label htmlFor="ai-capture-count">Capture last</label>
          <input
            id="ai-capture-count"
            type="number"
            min={1}
            max={50}
            value={captureCount}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              const value = Number.isFinite(parsed)
                ? Math.min(50, Math.max(1, parsed))
                : 1;
              setCaptureCount(value);
            }}
          />
          <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>commands</span>
          <button className="ai-context-capture-btn" onClick={onCaptureLast}>
            Capture
          </button>
        </div>

        <div className="ai-context-tip">
          <Lightbulb size={14} style={{ opacity: 0.7, flexShrink: 0 }} />
          Use <code>aiterm_add &lt;file&gt;</code> to add files. Supports wildcards!
        </div>

        {contextItems.length > 0 && (
          <button className="ai-context-clear-btn" onClick={clearContext}>
            Clear All Context
          </button>
        )}
      </div>
    </div>
  );
}
