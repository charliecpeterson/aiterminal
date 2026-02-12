import { useState, useCallback, useEffect, useRef } from "react";
import { aiPanelStyles } from "./AIPanel.styles";
import { useAIContext } from "../context/AIContext";
import { useSettings } from "../context/SettingsContext";
import { sendChatMessage } from "../ai/chatSend-vercel";
import { requestCaptureLast } from "../ai/contextCapture";
import { getSmartContextForPrompt } from "../ai/smartContext";
import { AIChatTab, type QuickActionType } from "./AIChatTab";
import { AIContextTab } from "./AIContextTab";
import { invoke } from "@tauri-apps/api/core";
import { getCommandTimeout, resolveApproval, rejectApproval } from "../ai/tools-vercel";
import { createLogger } from "../utils/logger";
import { estimateTokens, formatTokenCount } from "../utils/tokens";
import { executeInPty } from "../terminal/core/executeInPty";

const log = createLogger('AIPanel');

const QUICK_ACTION_PROMPTS: Record<QuickActionType, string> = {
  'summarize': 'Summarize the last command and its output.',
  'explain-error': 'Explain this error and suggest a fix.',
  'draft-fix': 'Draft a fix for the issue shown in the output above.',
};

// Export chat conversations with different levels of detail
type ExportVerbosity = 'basic' | 'detailed' | 'verbose';

function exportConversation(messages: any[], verbosity: ExportVerbosity = 'detailed'): string {
  return messages
    .filter(msg => verbosity === 'verbose' || msg.role !== 'system')
    .map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const role = msg.role.toUpperCase();

      let content = `## ${role} - ${timestamp}\n`;
      if (verbosity === 'verbose') {
        content += `**Message ID**: ${msg.id}\n`;
      }
      content += `\n`;
      
      // Context details for user messages (verbosity-dependent)
      if (msg.role === 'user' && msg.usedContext) {
        const ctx = msg.usedContext;

        if (verbosity === 'detailed' || verbosity === 'verbose') {
          // Detailed and verbose: Show context metadata
          content += `**Context Sent**: ${ctx.chunkCount || 0} items`;
          if (ctx.contextBudget) content += ` (budget: ${ctx.contextBudget} tokens)`;
          content += `\n`;
          if (ctx.contextStrategy) content += `**Strategy**: ${ctx.contextStrategy}\n`;
          content += `\n`;
        }

        if (verbosity === 'verbose') {
          // Verbose only: Show full context details
          let totalContextTokens = 0;
          if (ctx.contextItems && ctx.contextItems.length > 0) {
            ctx.contextItems.forEach((item: any) => {
              totalContextTokens += estimateTokens(item.content || '');
            });
          }

          content += `### Request Metadata\n`;
          content += `- **Context Strategy**: ${ctx.contextStrategy || 'unknown'}\n`;
          content += `- **Context Budget**: ${ctx.contextBudget || 'unknown'} tokens\n`;
          content += `- **Items Sent**: ${ctx.chunkCount || 0}\n`;
          content += `- **Total Context Tokens** (est.): ~${formatTokenCount(totalContextTokens)}\n\n`;

          // List context items with details
          if (ctx.contextItems && ctx.contextItems.length > 0) {
            content += `### Context Items Selected\n`;
            content += `> These items were ranked and selected for inclusion. Their content is embedded in the System Prompt below.\n\n`;

            ctx.contextItems.forEach((item: any, idx: number) => {
              const itemTokens = estimateTokens(item.content || '');
              content += `${idx + 1}. **${item.label || item.path || item.id}** (~${formatTokenCount(itemTokens)} tokens)\n`;
              content += `   - Type: ${item.type}\n`;
              if (item.usageCount) content += `   - Usage count: ${item.usageCount}\n`;
              if (item.conversationMemoryPenalty !== undefined) {
                content += `   - Conversation memory penalty: ${item.conversationMemoryPenalty}\n`;
              }
              content += `\n`;
            });

            // Show full context content
            content += `### Full Context Content\n`;
            content += `> Raw content of each context item before embedding into the system prompt.\n\n`;

            ctx.contextItems.forEach((item: any, idx: number) => {
              const itemTokens = estimateTokens(item.content || '');
              const truncated = item.content && item.content.length > 5000;
              content += `#### ${idx + 1}. ${item.label || item.path || item.id} (~${formatTokenCount(itemTokens)} tokens)\n`;
              content += `\`\`\`\n${item.content ? item.content.substring(0, 5000) : '(empty)'}${truncated ? '\n... (truncated for export, full content sent to AI)' : ''}\n\`\`\`\n\n`;
            });
          }

          // Show system prompt
          if (msg.systemPrompt) {
            const systemPromptTokens = estimateTokens(msg.systemPrompt);
            content += `### System Prompt (~${formatTokenCount(systemPromptTokens)} tokens)\n`;
            content += `> This is the EXACT prompt sent to the AI. It includes the base system prompt + context items embedded above.\n`;
            content += `> The context appears both above (for readability) and here (showing exactly what the AI receives).\n\n`;
            content += `\`\`\`\n${msg.systemPrompt}\n\`\`\`\n\n`;
          }

          // Token summary
          const userMessageTokens = estimateTokens(msg.content || '');
          const systemPromptTokens = msg.systemPrompt ? estimateTokens(msg.systemPrompt) : 0;
          content += `### Token Summary (Estimated)\n`;
          content += `| Component | Tokens |\n`;
          content += `|-----------|--------|\n`;
          content += `| System Prompt | ~${formatTokenCount(systemPromptTokens)} |\n`;
          content += `| User Message | ~${formatTokenCount(userMessageTokens)} |\n`;
          content += `| **Total Input** | ~${formatTokenCount(systemPromptTokens + userMessageTokens)} |\n\n`;
        }
      }

      // Routing decision for user messages (verbosity-dependent)
      if (msg.role === 'user' && msg.routingDecision) {
        const rd = msg.routingDecision;

        if (verbosity === 'detailed') {
          // Detailed: Standard routing info
          content += `**Routing**: ${rd.tier} tier → ${rd.model}`;
          if (rd.fallbackUsed) content += ` (fallback from ${rd.originalTier})`;
          content += `\n`;
        } else if (verbosity === 'verbose') {
          // Verbose: Full routing details
          content += `### Routing Decision\n`;
          content += `- **Tier**: ${rd.tier}\n`;
          content += `- **Complexity Level**: ${rd.complexity}/3\n`;
          content += `- **Model Selected**: ${rd.model}\n`;
          content += `- **Context Budget**: ${rd.contextBudget} tokens\n`;
          content += `- **Temperature**: ${rd.temperature}\n`;
          if (rd.fallbackUsed) {
            content += `- **Fallback Used**: Yes (from ${rd.originalTier})\n`;
          }
          content += `\n`;

          if (rd.reasoning) {
            content += `#### Routing Reasoning\n`;
            content += `- **Query Type**: ${rd.reasoning.queryType}\n`;
            content += `- **Complexity Score**: ${rd.reasoning.score}/100\n\n`;

            if (rd.reasoning.factors && rd.reasoning.factors.length > 0) {
              content += `##### Scoring Factors\n`;
              rd.reasoning.factors.forEach((factor: any) => {
                content += `- **${factor.name}**: ${factor.value} (weight: ${factor.weight})`;
                if (factor.description) content += ` - ${factor.description}`;
                content += `\n`;
              });
              content += `\n`;
            }

            if (rd.reasoning.alternatives && rd.reasoning.alternatives.length > 0) {
              content += `##### Alternatives Considered\n`;
              rd.reasoning.alternatives.forEach((alt: any) => {
                content += `- **${alt.tier}**: score ${alt.score} - ${alt.reason}\n`;
              });
              content += `\n`;
            }
          }
        }
      }

      // Prompt enhancement for user messages (verbose only)
      if (verbosity === 'verbose' && msg.role === 'user' && msg.promptEnhancement?.wasEnhanced) {
        const pe = msg.promptEnhancement;
        content += `### Prompt Enhancement\n`;
        content += `- **Pattern Matched**: ${pe.pattern || 'unknown'}\n`;
        content += `- **Reason**: ${pe.reason || 'N/A'}\n`;
        content += `- **Original Prompt**:\n\`\`\`\n${pe.original}\n\`\`\`\n`;
        content += `- **Enhanced Prompt**:\n\`\`\`\n${pe.enhanced}\n\`\`\`\n\n`;
      }

      // Metrics for assistant messages (verbosity-dependent)
      if (msg.role === 'assistant' && msg.metrics) {
        const m = msg.metrics;

        if (verbosity === 'detailed') {
          // Detailed: Compact metrics
          content += `**Model**: ${m.model} | **Mode**: ${m.mode}\n`;
          content += `**Tokens**: ${m.tokens.input} input / ${m.tokens.output} output\n`;
          content += `**Duration**: ${(m.timings.total / 1000).toFixed(1)}s`;
          if (m.timings.contextSelection) {
            content += ` (context: ${m.timings.contextSelection}ms)`;
          }
          content += `\n\n`;
        } else if (verbosity === 'verbose') {
          // Verbose: Full metrics
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
      }

      // Message content
      if (verbosity === 'verbose') {
        content += `### Message Content\n${msg.content}\n`;
      } else {
        content += `${msg.content}\n`;
      }
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
  useEffect(() => {
    log.debug('activeTerminalId changed:', activeTerminalId);
  }, [activeTerminalId]);
  
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
      const timeoutMs = getCommandTimeout(approval.command);
      const result = await executeInPty({
        terminalId: approval.terminalId,
        command: ` ${approval.command}`,
        timeoutMs,
      });

      let formattedResult = result.output || '(no output)';
      if (result.exitCode !== 0) {
        formattedResult = `Command failed with exit code ${result.exitCode}\n${formattedResult}`;
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

  const handleSend = useCallback(async (promptOverride?: string) => {
    // Guard against duplicate sends while already processing
    if (isSending) {
      return;
    }
    
    // Use override if provided, otherwise use state
    const promptToSend = promptOverride ?? prompt;
    if (!promptToSend || typeof promptToSend !== 'string' || !promptToSend.trim()) {
      return;
    }
    
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
          query: promptToSend,
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
    
    // If we used an override, also update the prompt state for display
    if (promptOverride) {
      setPrompt(promptOverride);
    }
    
    sendChatMessage({
      prompt: promptToSend,
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
  }, [isSending, prompt, settings?.ai, settings, messages, contextItems, formattedContextItems, activeTerminalId, addMessage, appendMessage, updateMessageMetrics, updateToolProgress, setPrompt, addPendingApproval, contextSmartMode, markContextAsUsed]);

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

  // Track pending quick action to auto-send after context arrives
  const pendingQuickActionRef = useRef<{ prompt: string; contextCount: number } | null>(null);
  
  // Store handleSend in a ref so the effect can call it with the latest closure
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;


  // Handle quick action: capture context, set prompt, and auto-send
  const handleQuickAction = useCallback(async (action: QuickActionType) => {
    if (isSending) return;
    
    const actionPrompt = QUICK_ACTION_PROMPTS[action];
    const currentContextCount = contextItems.length;
    
    // Store the pending action
    pendingQuickActionRef.current = {
      prompt: actionPrompt,
      contextCount: currentContextCount,
    };
    
    // Request capture of last command
    try {
      await requestCaptureLast(1);
    } catch (err) {
      log.error('Failed to capture last command for quick action', err);
      pendingQuickActionRef.current = null;
    }
  }, [isSending, contextItems.length]);

  // Watch for context changes after quick action is triggered
  useEffect(() => {
    const pending = pendingQuickActionRef.current;
    if (!pending) return;
    
    // Check if new context has arrived (context count increased)
    if (contextItems.length > pending.contextCount) {
      // Context arrived! Send with the stored prompt
      const promptToSend = pending.prompt;
      pendingQuickActionRef.current = null;
      
      // Call handleSend with the prompt override
      handleSendRef.current(promptToSend);
    }
  }, [contextItems.length]);

  // Note: intentionally no global window error handler here.
  // Errors from handleSend are caught directly in that function.
  // Unhandled errors elsewhere should propagate to the ErrorBoundary.

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
            className={`ai-panel-tab ${activeTab === "chat" ? "active" : ""}`}
            style={
              activeTab === "chat"
                ? { ...aiPanelStyles.tab, ...aiPanelStyles.tabActive }
                : aiPanelStyles.tab
            }
            onClick={() => setActiveTab("chat")}
          >
            Chat
          </button>
          <button
            className={`ai-panel-tab ${activeTab === "context" ? "active" : ""}`}
            style={
              activeTab === "context"
                ? { ...aiPanelStyles.tab, ...aiPanelStyles.tabActive }
                : aiPanelStyles.tab
            }
            onClick={() => setActiveTab("context")}
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
              className={`ai-panel-mode-btn ${aiMode === 'chat' ? 'active' : ''}`}
              style={
                !settings
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonDisabled }
                  : aiMode === 'chat'
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonActive }
                  : aiPanelStyles.modeButton
              }
              onClick={() => setAiMode('chat')}
              disabled={!settings}
              type="button"
            >
              Chat
            </button>
            <button
              className={`ai-panel-mode-btn ${aiMode === 'agent' ? 'active' : ''}`}
              style={
                !settings
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonDisabled }
                  : aiMode === 'agent'
                  ? { ...aiPanelStyles.modeButton, ...aiPanelStyles.modeButtonActive }
                  : aiPanelStyles.modeButton
              }
              onClick={() => setAiMode('agent')}
              disabled={!settings}
              type="button"
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
                className="ai-panel-header-btn"
                style={{
                  ...aiPanelStyles.headerButton,
                  ...(messages.length === 0 ? aiPanelStyles.headerButtonDisabled : {}),
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
                    const exportContent = exportConversation(messages, exportMode);
                    
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
              >
                Export
              </button>
              <button
                className="ai-panel-header-btn"
                style={aiPanelStyles.headerButton}
                onClick={clearChat}
                title="Clear chat"
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
            onQuickAction={handleQuickAction}
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
