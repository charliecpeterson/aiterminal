import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./QuickActionsWindow.css";

export interface QuickAction {
  id: string;
  name: string;
  commands: string[];
  stopOnError?: boolean;  // Optional: stop execution if a command fails
}

interface QuickActionsWindowProps {
  onClose: () => void;
  onExecute: (action: QuickAction) => void;
}

const QuickActionsWindow: React.FC<QuickActionsWindowProps> = ({ onClose, onExecute }) => {
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingAction, setEditingAction] = useState<QuickAction | null>(null);
  const [formName, setFormName] = useState("");
  const [formCommands, setFormCommands] = useState("");
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadActions();
  }, []);

  const loadActions = async () => {
    try {
      const loaded = await invoke<QuickAction[]>("load_quick_actions");
      setActions(loaded);
    } catch (error) {
      console.error("Failed to load quick actions:", error);
      setActions([]);
    }
  };

  const saveActions = async (newActions: QuickAction[]) => {
    try {
      await invoke("save_quick_actions", { actions: newActions });
      setActions(newActions);
    } catch (error) {
      console.error("Failed to save quick actions:", error);
    }
  };

  const handleAdd = () => {
    setIsEditing(true);
    setEditingAction(null);
    setFormName("");
    setFormCommands("");
  };

  const handleEdit = (action: QuickAction) => {
    setIsEditing(true);
    setEditingAction(action);
    setFormName(action.name);
    setFormCommands(action.commands.join("\n"));
  };

  const handleDelete = async (id: string) => {
    const newActions = actions.filter((a) => a.id !== id);
    await saveActions(newActions);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCommands.trim()) {
      return;
    }

    const normalizeQuotes = (value: string) =>
      value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

    const commands = formCommands
      .split("\n")
      .map((cmd) => normalizeQuotes(cmd.trim()))
      .filter((cmd) => cmd.length > 0);

    if (commands.length === 0) {
      return;
    }

    let newActions: QuickAction[];
    if (editingAction) {
      // Update existing
      newActions = actions.map((a) =>
        a.id === editingAction.id
          ? { ...a, name: normalizeQuotes(formName), commands }
          : a
      );
    } else {
      // Add new
      const newAction: QuickAction = {
        id: Date.now().toString(),
        name: formName,
        commands,
      };
      newActions = [...actions, newAction];
    }

    await saveActions(newActions);
    setIsEditing(false);
    setEditingAction(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingAction(null);
    setFormName("");
    setFormCommands("");
  };

  return (
    <div className="quick-actions-window">
      <div className="quick-actions-header">
        <h2>⚡ Quick Actions</h2>
        <button className="close-button" onClick={onClose}>
          ×
        </button>
      </div>

      {!isEditing ? (
        <div className="quick-actions-content">
          <div className="quick-actions-toolbar">
            <button className="add-action-button" onClick={handleAdd}>
              + Add Action
            </button>
          </div>

          {actions.length === 0 ? (
            <div className="quick-actions-empty">
              <p>No quick actions yet.</p>
              <p>Click "Add Action" to create your first workflow.</p>
            </div>
          ) : (
            <div className="quick-actions-list">
              {actions.map((action) => (
                <div key={action.id} className="quick-action-item">
                  <div className="quick-action-info">
                    <div className="quick-action-name">{action.name}</div>
                    <div className="quick-action-commands">
                      {action.commands.slice(0, expandedActions.has(action.id) ? undefined : 5).map((cmd, idx) => (
                        <div key={idx} className="quick-action-command">
                          {idx + 1}. {cmd}
                        </div>
                      ))}
                      {action.commands.length > 5 && (
                        <div 
                          className="quick-action-expand"
                          onClick={() => {
                            const newExpanded = new Set(expandedActions);
                            if (expandedActions.has(action.id)) {
                              newExpanded.delete(action.id);
                            } else {
                              newExpanded.add(action.id);
                            }
                            setExpandedActions(newExpanded);
                          }}
                        >
                          {expandedActions.has(action.id) 
                            ? '▼ Show less' 
                            : `▶ Show ${action.commands.length - 5} more...`
                          }
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="quick-action-buttons">
                    <button
                      className="execute-button"
                      onClick={() => onExecute(action)}
                      title="Execute commands in active terminal"
                    >
                      ▶ Execute
                    </button>
                    <button
                      className="edit-button"
                      onClick={() => handleEdit(action)}
                      title="Edit action"
                    >
                      Edit
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(action.id)}
                      title="Delete action"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="quick-actions-form">
          <div className="form-group">
            <label>Action Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Build & Test"
              autoFocus
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="form-group">
            <label>Commands (one per line)</label>
            <textarea
              value={formCommands}
              onChange={(e) => setFormCommands(e.target.value)}
              placeholder="npm install&#10;npm run build&#10;npm test"
              rows={10}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="form-buttons">
            <button className="save-button" onClick={handleSave}>
              Save
            </button>
            <button className="cancel-button" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickActionsWindow;
