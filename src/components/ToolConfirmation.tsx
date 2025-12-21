import { useState } from 'react';
import type { PendingToolCall } from '../ai/tools';
import { describeToolCall, isDangerousCommand } from '../ai/tools';
import './ToolConfirmation.css';

interface ToolConfirmationProps {
  toolCalls: PendingToolCall[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onEdit: (id: string, newArgs: Record<string, any>) => void;
}

export const ToolConfirmation = ({
  toolCalls,
  onApprove,
  onDeny,
  onEdit,
}: ToolConfirmationProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedCommand, setEditedCommand] = useState('');

  const pendingCalls = toolCalls.filter((tc) => tc.status === 'pending');

  if (pendingCalls.length === 0) return null;

  const handleStartEdit = (toolCall: PendingToolCall) => {
    setEditingId(toolCall.id);
    if (toolCall.name === 'execute_command') {
      setEditedCommand(toolCall.arguments.command || '');
    }
  };

  const handleSaveEdit = (id: string, toolCall: PendingToolCall) => {
    if (toolCall.name === 'execute_command') {
      onEdit(id, { ...toolCall.arguments, command: editedCommand });
    }
    setEditingId(null);
  };

  return (
    <div className="tool-confirmation-overlay">
      <div className="tool-confirmation-modal">
        <div className="tool-confirmation-header">
          <h3>🤖 AI wants to use tools</h3>
          <p className="tool-confirmation-subtitle">
            Review and approve each action
          </p>
        </div>

        <div className="tool-confirmation-list">
          {pendingCalls.map((toolCall) => {
            const isDangerous =
              toolCall.name === 'execute_command'
                ? isDangerousCommand(toolCall.arguments.command)
                : { dangerous: false };
            const isEditing = editingId === toolCall.id;

            return (
              <div
                key={toolCall.id}
                className={`tool-confirmation-item ${
                  isDangerous.dangerous ? 'dangerous' : ''
                }`}
              >
                <div className="tool-confirmation-icon">
                  {toolCall.name === 'execute_command' && '💻'}
                  {toolCall.name === 'read_file' && '📄'}
                  {toolCall.name === 'list_directory' && '📁'}
                  {toolCall.name === 'search_files' && '🔍'}
                  {toolCall.name === 'get_environment_variable' && '🔧'}
                </div>

                <div className="tool-confirmation-content">
                  <div className="tool-confirmation-title">
                    {describeToolCall(toolCall)}
                  </div>

                  {toolCall.reasoning && (
                    <div className="tool-confirmation-reasoning">
                      <strong>Reason:</strong> {toolCall.reasoning}
                    </div>
                  )}

                  {isDangerous.dangerous && (
                    <div className="tool-confirmation-warning">
                      ⚠️ <strong>Warning:</strong> {isDangerous.reason}
                    </div>
                  )}

                  {/* Show command details for execute_command */}
                  {toolCall.name === 'execute_command' && (
                    <div className="tool-confirmation-command">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedCommand}
                          onChange={(e) => setEditedCommand(e.target.value)}
                          className="tool-confirmation-edit-input"
                          autoFocus
                        />
                      ) : (
                        <code>$ {toolCall.arguments.command}</code>
                      )}
                    </div>
                  )}

                  {/* Show file path for read_file */}
                  {toolCall.name === 'read_file' && (
                    <div className="tool-confirmation-detail">
                      <code>{toolCall.arguments.path}</code>
                      {toolCall.arguments.max_bytes && (
                        <span className="tool-confirmation-meta">
                          {' '}
                          (max {parseInt(toolCall.arguments.max_bytes).toLocaleString()} bytes)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Show other arguments */}
                  {toolCall.name !== 'execute_command' &&
                    toolCall.name !== 'read_file' &&
                    Object.keys(toolCall.arguments).length > 0 && (
                      <div className="tool-confirmation-args">
                        {Object.entries(toolCall.arguments).map(([key, value]) => {
                          if (key === 'reasoning') return null;
                          return (
                            <div key={key} className="tool-confirmation-arg">
                              <span className="arg-key">{key}:</span>{' '}
                              <span className="arg-value">{String(value)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>

                <div className="tool-confirmation-actions">
                  {isEditing ? (
                    <>
                      <button
                        className="tool-action-button save"
                        onClick={() => handleSaveEdit(toolCall.id, toolCall)}
                      >
                        Save
                      </button>
                      <button
                        className="tool-action-button cancel"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="tool-action-button approve"
                        onClick={() => onApprove(toolCall.id)}
                      >
                        Allow
                      </button>
                      {toolCall.name === 'execute_command' && (
                        <button
                          className="tool-action-button edit"
                          onClick={() => handleStartEdit(toolCall)}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className="tool-action-button deny"
                        onClick={() => onDeny(toolCall.id)}
                      >
                        Deny
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="tool-confirmation-footer">
          <button
            className="tool-action-button approve-all"
            onClick={() => pendingCalls.forEach((tc) => onApprove(tc.id))}
          >
            Approve All ({pendingCalls.length})
          </button>
          <button
            className="tool-action-button deny-all"
            onClick={() => pendingCalls.forEach((tc) => onDeny(tc.id))}
          >
            Deny All
          </button>
        </div>
      </div>
    </div>
  );
};
