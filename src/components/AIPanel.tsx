import { useState, useCallback, useEffect } from "react";
import { aiPanelStyles } from "./AIPanel.styles";
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

// Export functions for chat conversations
function exportBasic(messages: any[]): string {
  return messages
    .filter(msg => msg.role !== 'system')
    .map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const role = msg.role.toUpperCase();
      return `## ${role} - ${timestamp}\n\n${msg.content}\n`;
    })
    .join('\n---\n\n');
}

function exportDetailed(messages: any[]): string {
  return messages
    .filter(msg => msg.role !== 'system')
    .map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const role = msg.role.toUpperCase();
      
      let content = `## ${role} - ${timestamp}\n\n`;
      
      // Add metadata for user messages (context sent)
      if (msg.role === 'user' && msg.usedContext) {
        const ctx = msg.usedContext;
        content += `**Context Sent**: ${ctx.chunkCount || 0} items`;
        if (ctx.contextBudget) content += ` (budget: ${ctx.contextBudget} tokens)`;
        content += `\n`;
        if (ctx.contextStrategy) content += `**Strategy**: ${ctx.contextStrategy}\n`;
        content += `\n`;
      }
      
      // Add metrics for assistant messages
      if (msg.role === 'assistant' && msg.metrics) {
        const m = msg.metrics;
        content += `**Model**: ${m.model} | **Mode**: ${m.mode}\n`;
        content += `**Tokens**: ${m.tokens.input} input / ${m.tokens.output} output\n`;
        content += `**Duration**: ${(m.timings.total / 1000).toFixed(1)}s`;
        if (m.timings.contextSelection) {
          content += ` (context: ${m.timings.contextSelection}ms)`;
        }
        content += `\n\n`;
      }
      
      content += `${msg.content}\n`;
      return content;
    })
    .join('\n---\n\n');
}

function exportVerbose(messages: any[]): string {
  return messages
    .filter(msg => msg.role !== 'system')
    .map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const role = msg.role.toUpperCase();
      
      let content = `## ${role} - ${timestamp}\n`;
      content += `**Message ID**: ${msg.id}\n\n`;
      
      // Verbose context details for user messages
      if (msg.role === 'user' && msg.usedContext) {
        const ctx = msg.usedContext;
        content += `### Request Metadata\n`;
        content += `- **Context Strategy**: ${ctx.contextStrategy || 'unknown'}\n`;
        content += `- **Context Budget**: ${ctx.contextBudget || 'unknown'} tokens\n`;
        content += `- **Items Sent**: ${ctx.chunkCount || 0}\n\n`;
        
        // List context items with details
        if (ctx.contextItems && ctx.contextItems.length > 0) {
          content += `### Context Items Sent\n`;
          ctx.contextItems.forEach((item: any, idx: number) => {
            content += `${idx + 1}. **${item.label || item.path || item.id}**\n`;
            content += `   - Type: ${item.type}\n`;
            if (item.usageCount) content += `   - Usage count: ${item.usageCount}\n`;
            if (item.conversationMemoryPenalty !== undefined) {
              content += `   - Conversation memory penalty: ${item.conversationMemoryPenalty}\n`;
            }
            content += `\n`;
          });
          
          // Show full context content
          content += `### Full Context Content\n\n`;
          ctx.contextItems.forEach((item: any, idx: number) => {
            content += `#### ${idx + 1}. ${item.label || item.path || item.id}\n`;
            content += `\`\`\`\n${item.content.substring(0, 5000)}${item.content.length > 5000 ? '\n... (truncated)' : ''}\n\`\`\`\n\n`;
          });
        }
        
        // Show system prompt if available
        if (msg.systemPrompt) {
          content += `### System Prompt\n\`\`\`\n${msg.systemPrompt}\n\`\`\`\n\n`;
        }
      }
      
      // Verbose metrics for assistant messages
      if (msg.role === 'assistant' && msg.metrics) {
        const m = msg.metrics;
        content += `### Response Metadata\n`;
        content += `- **Model**: ${m.model}\n`;
        content += `- **Mode**: ${m.mode}\n`;
        content += `- **Tokens**: ${m.tokens.input} input / ${m.tokens.output} output / ${m.tokens.total} total\n`;
        content += `- **Duration**: ${(m.timings.total / 1000).toFixed(1)}s\n`;
        if (m.timings.firstToken) {
          content += `- **Time to first token**: ${m.timings.firstToken}ms\n`;
        }
        if (m.timings.contextSelection) {
          content += `- **Context selection time**: ${m.timings.contextSelection}ms\n`;
        }
        if (m.toolCalls) {
          content += `- **Tool calls**: ${m.toolCalls}\n`;
        }
        content += `\n`;
      }
      
      content += `### Message Content\n${msg.content}\n`;
      return content;
    })
    .join('\n---\n\n');
}

type PanelTab = "chat" | "context";

interface AIPanelProps {
  activeTerminalId?: number | null;
}

const AIPanel = ({
  activeTerminalId,
}: AIPanelProps) => {
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");
  const [prompt, setPrompt] = useState("");
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(1);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [smartContextStatus, setSmartContextStatus] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<'basic' | 'detailed' | 'verbose'>('basic');
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
    clearContext,
    clearChat,
    addPendingApproval,
    pendingApprovals,
    removePendingApproval,
    toggleSecretRedaction,
    markContextAsUsed,
  } = useAIContext();

  // Request context sync when AI Panel mounts (for newly opened windows)
  useEffect(() => {
    const requestSync = async () => {
      try {
        log.debug('AI Panel mounted, requesting context sync');
        await invoke("emit_event", {
          event: "ai-context:request-sync",
          payload: {},
        });
      } catch (err) {
        log.error('Failed to request context sync', err);
      }
    };
    
    // Small delay to ensure event listeners are set up
    const timer = setTimeout(requestSync, 100);
    return () => clearTimeout(timer);
  }, []); // Only run once on mount

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
            style={
              activeTab === "chat"
                ? { ...aiPanelStyles.tab, ...aiPanelStyles.tabActive }
                : hoverStates.chatTab
                ? { ...aiPanelStyles.tab, ...aiPanelStyles.tabHover }
                : aiPanelStyles.tab
            }
            onClick={() => setActiveTab("chat")}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, chatTab: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, chatTab: false }))}
          >
            Chat
          </button>
          <button
            style={
              activeTab === "context"
                ? { ...aiPanelStyles.tab, ...aiPanelStyles.tabActive }
                : hoverStates.contextTab
                ? { ...aiPanelStyles.tab, ...aiPanelStyles.tabHover }
                : aiPanelStyles.tab
            }
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
              style={
                !settings
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonDisabled }
                  : aiMode === 'chat'
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonActive }
                  : hoverStates.chatMode
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonHover }
                  : aiPanelStyles.modeButton
              }
              onClick={() => setAiMode('chat')}
              disabled={!settings}
              type="button"
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, chatMode: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, chatMode: false }))}
            >
              Chat
            </button>
            <button
              style={
                !settings
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonDisabled }
                  : aiMode === 'agent'
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonActive }
                  : hoverStates.agentMode
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonHover }
                  : aiPanelStyles.modeButton
              }
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
              <select
                value={exportMode}
                onChange={(e) => setExportMode(e.target.value as 'basic' | 'detailed' | 'verbose')}
                style={{
                  ...aiPanelStyles.headerButton,
                  padding: '4px 8px',
                  marginRight: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
                title="Export format"
              >
                <option value="basic">Basic</option>
                <option value="detailed">Detailed</option>
                <option value="verbose">Verbose</option>
              </select>
              <button 
                style={{
                  ...aiPanelStyles.headerButton,
                  ...(messages.length === 0
                    ? aiPanelStyles.headerButtonDisabled
                    : hoverStates.exportBtn
                    ? aiPanelStyles.headerButtonHover
                    : {}),
                }}
                onClick={async () => {
                  if (messages.length === 0) return;
                  try {
                    const { save } = await import('@tauri-apps/plugin-dialog');
                    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
                    
                    log.debug('Opening save dialog', { exportMode });
                    const filePath = await save({
                      defaultPath: `aiterminal-chat-${exportMode}-${Date.now()}.md`,
                      filters: [{ name: 'Markdown', extensions: ['md'] }]
                    });
                    
                    if (!filePath) {
                      log.debug('Save dialog cancelled by user');
                      return;
                    }
                    
                    log.debug('Generating export content', { mode: exportMode, filePath });
                    let exportContent = '';
                    if (exportMode === 'basic') {
                      exportContent = exportBasic(messages);
                    } else if (exportMode === 'detailed') {
                      exportContent = exportDetailed(messages);
                    } else {
                      exportContent = exportVerbose(messages);
                    }
                    
                    log.debug('Writing file', { filePath, contentLength: exportContent.length });
                    await writeTextFile(filePath, exportContent);
                    log.info('Chat exported successfully', { filePath, mode: exportMode });
                    
                    // Show success feedback (using existing error state temporarily)
                    setSendError(null);
                    
                    // Could add a toast notification here in the future
                  } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    log.error('Failed to export chat', { error: errorMsg, exportMode });
                    setSendError(`Export failed: ${errorMsg}`);
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
                style={{
                  ...aiPanelStyles.headerButton,
                  ...(hoverStates.clearBtn ? aiPanelStyles.headerButtonHover : {}),
                }}
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
          />
        )}
      </div>

    </div>
  );
};

export default AIPanel;
