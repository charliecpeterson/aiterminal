import { useMemo } from "react";
import type { ContextItem } from "../context/AIContext";
import { formatChatTime } from "../ai/panelUi";

export function AIContextTab(props: {
  contextItems: ContextItem[];
  expandedContextId: string | null;
  setExpandedContextId: (value: string | null) => void;
  removeContextItem: (id: string) => void;
  clearContext: () => void;

  captureCount: number;
  setCaptureCount: (value: number) => void;
  onCaptureLast: () => void;

  filePath: string;
  setFilePath: (value: string) => void;

  fileLimitKb: number;
  setFileLimitKb: (value: number) => void;
  onCaptureFile: () => void;
}) {
  const {
    contextItems,
    expandedContextId,
    setExpandedContextId,
    removeContextItem,
    clearContext,
    captureCount,
    setCaptureCount,
    onCaptureLast,
    filePath,
    setFilePath,
    fileLimitKb,
    setFileLimitKb,
    onCaptureFile,
  } = props;

  // Memoize expensive context item rendering
  const renderedContextItems = useMemo(() => {
    return contextItems.map((item) => {
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
        });
    }, [contextItems, expandedContextId, setExpandedContextId, removeContextItem]);

  return (
    <div className="ai-panel-section">
      <div className="ai-panel-card">
        <div className="ai-panel-card-title">Context staging</div>
        <div className="ai-panel-card-body">Selected output and notes appear here.</div>
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
              const parsed = Number.parseInt(event.target.value, 10);
              const value = Number.isFinite(parsed)
                ? Math.min(2048, Math.max(1, parsed))
                : 200;
              setFileLimitKb(value);
            }}
          />
          <span className="ai-panel-unit">KB</span>
          <button className="ai-panel-action ghost" onClick={onCaptureFile}>
            Add File
          </button>
        </div>

        <button className="ai-panel-clear" onClick={clearContext}>
          Clear All
        </button>
      </div>
    </div>
  );
}
