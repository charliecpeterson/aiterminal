import { useState, useCallback } from "react";
import "./AIPanel.css";
import { useAIContext } from "../context/AIContext";
import { useSettings } from "../context/SettingsContext";
import { sendChatMessage } from "../ai/chatSend-vercel";
import { requestCaptureLast } from "../ai/contextCapture";
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
  const { settings } = useSettings();

  const {
    contextItems,
    messages,
    addMessage,
    appendMessage,
    removeContextItem,
    addContextItem,
    clearContext,
    clearChat,
    addPendingApproval,
    pendingApprovals,
    removePendingApproval,
  } = useAIContext();

  const handleApprove = useCallback(async (id: string) => {
    const approval = pendingApprovals.find(a => a.id === id);
    if (!approval) return;

    console.log('✅ Approving command:', approval.command);
    
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

      console.log('Command result:', { exit_code: result.exit_code, stdout: result.stdout, stderr: result.stderr });

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

    console.log('❌ Denying command:', approval.command);
    
    // Reject the promise
    rejectApproval(id, 'User denied command execution');

    // Remove from pending
    removePendingApproval(id);
  }, [pendingApprovals, removePendingApproval]);

  const handleSend = useCallback(async () => {
    const controller = new AbortController();
    setAbortController(controller);
    
    sendChatMessage({
      prompt,
      settingsAi: settings?.ai,
      messages,
      contextItems,
      terminalId: activeTerminalId || 0, // Default to terminal 0
      addMessage,
      appendMessage,
      setPrompt,
      setIsSending,
      setSendError,
      abortController: controller,
      addPendingApproval,
    });
  }, [prompt, settings?.ai, messages, contextItems, activeTerminalId, addMessage, appendMessage, setPrompt, addPendingApproval]);

  const handleCancel = useCallback(() => {
    if (abortController) {
      console.log('🛑 Cancelling AI request...');
      abortController.abort();
      setAbortController(null);
      setIsSending(false);
    }
  }, [abortController]);

  const handleCaptureLast = () => {
    console.log('[AIPanel] handleCaptureLast called', { captureCount });
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

      // Add to context
      const contextItem = {
        id: crypto.randomUUID(),
        type: 'file' as const,
        content: result.content,
        timestamp: Date.now(),
        metadata: {
          path: filePath,
          source: result.source,
          sizeKb: Math.round(result.content.length / 1024),
        },
      };

      addContextItem(contextItem);

      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Captured file: ${filePath} (${contextItem.metadata.sizeKb}KB, ${result.source})`,
        timestamp: Date.now(),
      });

      console.log('✅ File captured silently:', filePath);
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

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <div className="ai-panel-title-text">AI Panel</div>
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
