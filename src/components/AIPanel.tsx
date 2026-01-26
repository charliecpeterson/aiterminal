import { useState, useCallback, useEffect } from "react";
import {
  aiPanelStyles,
  getModeButtonStyle,
  getHeaderButtonStyle,
  getTabStyle,
} from "./AIPanel.styles";
import { useAIContext } from "../context/AIContext";
import { useSettings } from "../context/SettingsContext";
import { sendChatMessage } from "../ai/chatSend-vercel";
import { requestCaptureLast } from "../ai/contextCapture";
import { getSmartContextForPrompt } from "../ai/smartContext";
import { AIChatTab } from "./AIChatTab";
import { AIContextTab } from "./AIContextTab";
import { invoke } from "@tauri-apps/api/core";
import { resolveApproval, rejectApproval } from "../ai/tools-vercel";
import { createLogger } from "../utils/logger";

const log = createLogger('AIPanel');

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

  // Hover states for interactive elements
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});

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
      log.error('Failed to update AI mode', err);
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
    updateMessageMetrics,
    updateToolProgress,
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
      log.error('Failed to execute approved command', error);
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
      log.warn('Smart context retrieval failed; falling back to full context', err);
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
      updateMessageMetrics,
      updateToolProgress,
      setPrompt,
      setIsSending,
      setSendError,
      abortController: controller,
      addPendingApproval,
      usedContextForNextAssistantMessage,
      markContextAsUsed,
    }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error('AI request failed', err);
      setSendError(message);
      setIsSending(false);
    });
  }, [prompt, settings?.ai, settings, messages, contextItems, formattedContextItems, activeTerminalId, addMessage, appendMessage, updateMessageMetrics, updateToolProgress, setPrompt, addPendingApproval, contextSmartMode]);

  const handleCancel = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsSending(false);
    }
  }, [abortController]);

  const handleCaptureLast = () => {
    requestCaptureLast(captureCount).catch((err) => {
      log.error('Failed to request capture', err);
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
      log.error('Failed to capture file', err);
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
    <div style={aiPanelStyles.panel}>
      <div style={aiPanelStyles.header}>
        <div style={aiPanelStyles.title}>
          <div style={aiPanelStyles.titleText}>AI Panel</div>
          {settings?.ai?.embedding_model?.trim() && smartContextStatus && (
            <div style={aiPanelStyles.subtitle}>{smartContextStatus}</div>
          )}
        </div>
        <div style={aiPanelStyles.tabs}>
          <button
            style={getTabStyle(activeTab === "chat", hoverStates.chatTab || false)}
            onClick={() => setActiveTab("chat")}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, chatTab: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, chatTab: false }))}
          >
            Chat
          </button>
          <button
            style={getTabStyle(activeTab === "context", hoverStates.contextTab || false)}
            onClick={() => setActiveTab("context")}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, contextTab: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, contextTab: false }))}
          >
            Context
            {contextItems.length > 0 && (
              <span style={aiPanelStyles.tabBadge}>{contextItems.length}</span>
            )}
          </button>
        </div>
        <div style={aiPanelStyles.actions}>
          <div style={aiPanelStyles.mode} title="Chat: no tools. Agent: tools enabled.">
            <button
              style={getModeButtonStyle(
                aiMode === 'chat',
                hoverStates.chatMode || false,
                !settings
              )}
              onClick={() => setAiMode('chat')}
              disabled={!settings}
              type="button"
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, chatMode: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, chatMode: false }))}
            >
              Chat
            </button>
            <button
              style={getModeButtonStyle(
                aiMode === 'agent',
                hoverStates.agentMode || false,
                !settings
              )}
              onClick={() => setAiMode('agent')}
              disabled={!settings}
              type="button"
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, agentMode: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, agentMode: false }))}
            >
              Agent
            </button>
          </div>
          {activeTab === "chat" && (
            <>
              <button 
                style={getHeaderButtonStyle(hoverStates.exportBtn || false, messages.length === 0)}
                onClick={async () => {
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
                    log.error('Failed to export chat', error);
                  }
                }}
                disabled={messages.length === 0}
                title="Export chat"
                onMouseEnter={() => setHoverStates(prev => ({ ...prev, exportBtn: true }))}
                onMouseLeave={() => setHoverStates(prev => ({ ...prev, exportBtn: false }))}
              >
                Export
              </button>
              <button 
                style={getHeaderButtonStyle(hoverStates.clearBtn || false, false)}
                onClick={clearChat}
                title="Clear chat"
                onMouseEnter={() => setHoverStates(prev => ({ ...prev, clearBtn: true }))}
                onMouseLeave={() => setHoverStates(prev => ({ ...prev, clearBtn: false }))}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>
      <div style={aiPanelStyles.body}>
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
