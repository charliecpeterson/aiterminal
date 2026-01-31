import { useMemo } from "react";
import type { ContextIncludeMode, ContextItem } from "../context/AIContext";
import { formatChatTime } from "../ai/panelUi";

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

      return (
        <div key={item.id} className="ai-panel-context-card">
          <div className="ai-panel-context-header">
            <div>
              <div className="ai-panel-context-type">
                {item.type}
                {item.hasSecrets && (
                  <span style={{ marginLeft: '8px', color: '#ffa500', fontSize: '14px' }} title="Contains sensitive data">
                    ⚠️
                  </span>
                )}
              </div>
              <div className="ai-panel-context-time">{formatChatTime(item.timestamp)}</div>
              {item.hasSecrets && (
                <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                  {item.secretsRedacted 
                    ? `${item.secretFindings?.length || 0} secret(s) hidden`
                    : `${item.secretFindings?.length || 0} secret(s) visible`
                  }
                </div>
              )}
            </div>
            <div className="ai-panel-context-actions">
              {!contextSmartMode && (
                <div className="ai-panel-mode" style={{ marginRight: '8px' }}>
                  <button
                    type="button"
                    className={`ai-panel-mode-btn ${includeMode === 'smart' ? 'active' : ''}`}
                    onClick={() => setContextItemIncludeMode(item.id, 'smart')}
                  >
                    Smart
                  </button>
                  <button
                    type="button"
                    className={`ai-panel-mode-btn ${includeMode === 'always' ? 'active' : ''}`}
                    onClick={() => setContextItemIncludeMode(item.id, 'always')}
                  >
                    Always
                  </button>
                  <button
                    type="button"
                    className={`ai-panel-mode-btn ${includeMode === 'exclude' ? 'active' : ''}`}
                    onClick={() => setContextItemIncludeMode(item.id, 'exclude')}
                  >
                    Exclude
                  </button>
                </div>
              )}
              {item.hasSecrets && (
                <button
                  className="ai-panel-link"
                  onClick={() => toggleSecretRedaction(item.id)}
                  style={{ marginRight: '8px' }}
                >
                  {item.secretsRedacted ? '🔒 Show' : '🔓 Hide'}
                </button>
              )}
              <button
                className="ai-panel-link"
                onClick={() => setExpandedContextId(isExpanded ? null : item.id)}
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
                          <div className="ai-panel-context-content">{contentToDisplay}</div>
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
                        <div className="ai-panel-context-content">{contentToDisplay}</div>
                      </div>
                    </>
                  ) : (
                    contentToDisplay
                  )}
                </div>
              </div>
            );
        });
      }, [contextItems, expandedContextId, setExpandedContextId, removeContextItem, toggleSecretRedaction, contextSmartMode, setContextItemIncludeMode]);

  return (
    <div className="ai-panel-section">
      <div className="ai-panel-card">
        <div className="ai-panel-card-title">Context staging</div>
        <div className="ai-panel-card-body">Selected output and notes appear here.</div>
      </div>

      <div className="ai-panel-context-actions" style={{ marginTop: '10px' }}>
        <div className="ai-panel-capture-row" style={{ borderColor: 'var(--ai-panel-border)' }}>
          <span style={{ fontSize: '12px' }}>Smart Context</span>
          <div className="ai-panel-mode">
            <button
              type="button"
              className={`ai-panel-mode-btn ${contextSmartMode ? 'active' : ''}`}
              onClick={() => setContextSmartMode(true)}
            >
              On
            </button>
            <button
              type="button"
              className={`ai-panel-mode-btn ${!contextSmartMode ? 'active' : ''}`}
              onClick={() => setContextSmartMode(false)}
            >
              Off
            </button>
          </div>
        </div>
      </div>

      {contextItems.length > 0 ? (
        <div className="ai-panel-context-list">
          {renderedContextItems}
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
              const parsed = Number.parseInt(event.target.value, 10);
              const value = Number.isFinite(parsed)
                ? Math.min(50, Math.max(1, parsed))
                : 1;
              setCaptureCount(value);
            }}
          />
          <button className="ai-panel-action ghost" onClick={onCaptureLast}>
            Capture
          </button>
        </div>

        <div className="ai-panel-terminal-command-hint">
          <span style={{ opacity: 0.6 }}>💡 Tip: Use </span>
          <code>aiterm_add &lt;file&gt;</code>
          <span style={{ opacity: 0.6 }}> in terminal to add files. Supports wildcards!</span>
        </div>

        <button className="ai-panel-clear" onClick={clearContext}>
          Clear All
        </button>
      </div>
    </div>
  );
}
