import { useState, useCallback, useEffect } from "react";
import "./AIPanel.css";
import { useAIContext } from "../context/AIContext";
import { useSettings } from "../context/SettingsContext";
import { sendChatMessage } from "../ai/chatSend-vercel";
import { requestCaptureLast } from "../ai/contextCapture";
import { getSmartContextForPrompt } from "../ai/smartContext";
import { AIChatTab } from "./AIChatTab";
import { AIContextTab } from "./AIContextTab";
import { invoke } from "@tauri-apps/api/core";
import { resolveApproval, rejectApproval } from "../ai/tools-vercel";

type PanelTab = "chat" | "context";

interface AIPanelProps {
  activeTerminalId?: number | null;
  isRemote?: boolean;
  remoteHost?: string;
}

const AIPanel = ({
  activeTerminalId,
  isRemote = false,
}: AIPanelProps) => {
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");
  const [prompt, setPrompt] = useState("");
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(1);
  const [filePath, setFilePath] = useState("");
  const [fileLimitKb, setFileLimitKb] = useState(200);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [smartContextStatus, setSmartContextStatus] = useState<string | null>(null);
  const { settings, updateSettings } = useSettings();

  const aiMode: 'chat' | 'agent' = settings?.ai?.mode === 'chat' ? 'chat' : 'agent';

  const setAiMode = useCallback((mode: 'chat' | 'agent') => {
    if (!settings) return;
    if (settings.ai?.mode === mode) return;
    void updateSettings({
      ...settings,
      ai: {
        ...settings.ai,
        mode,
      },
    }).catch((err) => {
      console.error('Failed to update AI mode:', err);
    });
  }, [settings, updateSettings]);

  const {
    contextItems,
    formattedContextItems,
    contextSmartMode,
    setContextSmartMode,
    setContextItemIncludeMode,
    messages,
    addMessage,
    appendMessage,
    removeContextItem,
    // addContextItem, // Not used directly, we use addContextItemWithScan
    addContextItemWithScan,
    clearContext,
    clearChat,
    addPendingApproval,
    pendingApprovals,
    removePendingApproval,
    toggleSecretRedaction,
    markContextAsUsed,
  } = useAIContext();

  const handleApprove = useCallback(async (id: string) => {
    const approval = pendingApprovals.find(a => a.id === id);
    if (!approval) return;
    
    try {
      // Execute the command via Tauri (same format as executeCommand in tools-vercel.ts)
      const result = await invoke<{
        stdout: string;
        stderr: string;
        exit_code: number;
      }>('execute_tool_command', {
        command: approval.command,
        workingDirectory: approval.cwd || null,
      });

      // Format the result like executeCommand does
      let formattedResult: string;
      if (result.exit_code !== 0) {
        formattedResult = `Command failed with exit code ${result.exit_code}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`;
      } else {
        formattedResult = result.stdout || '(no output)';
      }

      // Resolve the promise waiting in the tool
      resolveApproval(id, formattedResult);

      // Remove from pending
      removePendingApproval(id);
    } catch (error) {
      console.error('Failed to execute approved command:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Reject the promise
      rejectApproval(id, errorMsg);
      
      // Remove from pending
      removePendingApproval(id);
    }
  }, [pendingApprovals, removePendingApproval]);

  const handleDeny = useCallback((id: string) => {
    const approval = pendingApprovals.find(a => a.id === id);
    if (!approval) return;
    
    // Reject the promise
    rejectApproval(id, 'User denied command execution');

    // Remove from pending
    removePendingApproval(id);
  }, [pendingApprovals, removePendingApproval]);

  const handleSend = useCallback(async () => {
    const controller = new AbortController();
    setAbortController(controller);

    let contextForSend = formattedContextItems;
    let usedContextForNextAssistantMessage: (typeof messages)[number]["usedContext"] | undefined;

    // If an embedding model is configured, retrieve only relevant context chunks.
    // Falls back to full context on any failure.
    try {
      const embeddingModel = settings?.ai?.embedding_model?.trim();
      if (embeddingModel && settings?.ai) {
        const smart = await getSmartContextForPrompt({
          ai: settings.ai,
          contextItems,
          query: prompt,
          topK: 8,
          globalSmartMode: contextSmartMode,
        });
        if (smart.formatted.length > 0) {
          contextForSend = smart.formatted;
          usedContextForNextAssistantMessage = {
            mode: 'smart',
            chunkCount: smart.retrieved.length,
            alwaysIncludedCount: smart.formatted.length - smart.retrieved.length,
            chunks: smart.retrieved.map((c) => ({
              sourceType: c.source_type,
              path: c.path ?? null,
              text: c.text,
            })),
          };
          setSmartContextStatus(`Smart context: ${smart.formatted.length} chunks`);
        } else {
          usedContextForNextAssistantMessage = {
            mode: 'smart',
            chunkCount: 0,
            alwaysIncludedCount: 0,
          };
          setSmartContextStatus(null);
        }
      } else {
        setSmartContextStatus(null);
      }
    } catch (err) {
      console.warn('Smart context retrieval failed; falling back to full context:', err);
      setSmartContextStatus(null);
    }
    
    sendChatMessage({
      prompt,
      settingsAi: settings?.ai,
      messages,
      contextItems,
      formattedContextItems: contextForSend,
      terminalId: activeTerminalId || 0, // Default to terminal 0
      addMessage,
      appendMessage,
      setPrompt,
      setIsSending,
      setSendError,
      abortController: controller,
      addPendingApproval,
      usedContextForNextAssistantMessage,
      markContextAsUsed,
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('AI request failed:', err);
      setSendError(message);
      setIsSending(false);
    });
  }, [prompt, settings?.ai, settings, messages, contextItems, formattedContextItems, activeTerminalId, addMessage, appendMessage, setPrompt, addPendingApproval, contextSmartMode]);

  const handleCancel = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsSending(false);
    }
  }, [abortController]);

  const handleCaptureLast = () => {
    requestCaptureLast(captureCount).catch((err) => {
      console.error("Failed to request capture:", err);
    });
  };

  const handleCaptureFile = async () => {
    if (!filePath.trim()) return;

    try {
      // Import the new smart capture function
      const { captureFileContent } = await import('../ai/contextCapture');
      
      const result = await captureFileContent({
        path: filePath,
        fileLimitKb,
        isRemote,
        workingDirectory: undefined,
      });

      // Add to context with secret scanning
      await addContextItemWithScan(
        result.content,
        'file',
        {
          path: filePath,
          source: result.source,
          sizeKb: Math.round(result.content.length / 1024),
        }
      );

      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Captured file: ${filePath} (${Math.round(result.content.length / 1024)}KB, ${result.source})`,
        timestamp: Date.now(),
      });

      setFilePath(''); // Clear input after successful capture
    } catch (err) {
      console.error('Failed to capture file:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Failed to capture file: ${errorMsg}`,
        timestamp: Date.now(),
      });
    }
  };

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = event.error instanceof Error ? event.error.message : event.message;
      setSendError(message || 'Unexpected error in AI panel');
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      setSendError(reason || 'Unhandled promise rejection in AI panel');
      event.preventDefault();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <div className="ai-panel-title-text">AI Panel</div>
          {settings?.ai?.embedding_model?.trim() && smartContextStatus && (
            <div className="ai-panel-subtitle">{smartContextStatus}</div>
          )}
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
            {contextItems.length > 0 && (
              <span className="ai-panel-tab-badge">{contextItems.length}</span>
            )}
          </button>
        </div>
        <div className="ai-panel-actions">
          <div className="ai-panel-mode" title="Chat: no tools. Agent: tools enabled.">
            <button
              className={`ai-panel-mode-btn ${aiMode === 'chat' ? 'active' : ''}`}
              onClick={() => setAiMode('chat')}
              disabled={!settings}
              type="button"
            >
              Chat
            </button>
            <button
              className={`ai-panel-mode-btn ${aiMode === 'agent' ? 'active' : ''}`}
              onClick={() => setAiMode('agent')}
              disabled={!settings}
              type="button"
            >
              Agent
            </button>
          </div>
          {activeTab === "chat" && (
            <>
              <button className="ai-panel-header-btn" onClick={async () => {
                if (messages.length === 0) return;
                try {
                  const { save } = await import('@tauri-apps/plugin-dialog');
                  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
                  const filePath = await save({
                    defaultPath: `aiterminal-chat-${Date.now()}.md`,
                    filters: [{ name: 'Markdown', extensions: ['md'] }]
                  });
                  if (!filePath) return;
                  const exportContent = messages.map(msg => {
                    const timestamp = new Date(msg.timestamp).toLocaleString();
                    const role = msg.role.toUpperCase();
                    return `## ${role} - ${timestamp}\n\n${msg.content}\n`;
                  }).join('\n---\n\n');
                  await writeTextFile(filePath, exportContent);
                } catch (error) {
                  console.error('Failed to export chat:', error);
                }
              }} disabled={messages.length === 0} title="Export chat">
                Export
              </button>
              <button className="ai-panel-header-btn" onClick={clearChat} title="Clear chat">
                Clear
              </button>
            </>
          )}
        </div>
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
            onCancel={handleCancel}
            onClearChat={clearChat}
            targetTerminalId={activeTerminalId}
            pendingApprovals={pendingApprovals}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        )}
        {activeTab === "context" && (
          <AIContextTab
            contextItems={contextItems}
            expandedContextId={expandedContextId}
            setExpandedContextId={setExpandedContextId}
            removeContextItem={removeContextItem}
            clearContext={clearContext}
            toggleSecretRedaction={toggleSecretRedaction}
            contextSmartMode={contextSmartMode}
            setContextSmartMode={setContextSmartMode}
            setContextItemIncludeMode={setContextItemIncludeMode}
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
