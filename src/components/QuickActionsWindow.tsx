import React, { useState, useEffect } from "react";
import { Zap, X, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";
import { normalizeQuotes } from "../utils/text";
import { parseQuickActionCommands } from "../utils/quickActions";
import { createLogger } from "../utils/logger";
import { quickActionsStyles } from "./QuickActionsWindow.styles";

const log = createLogger('QuickActionsWindow');

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
      log.error('Failed to load quick actions', error);
      setActions([]);
    }
  };

  const saveActions = async (newActions: QuickAction[]) => {
    try {
      await invoke("save_quick_actions", { actions: newActions });
      setActions(newActions);
    } catch (error) {
      log.error('Failed to save quick actions', error);
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

    const commands = parseQuickActionCommands(formCommands);

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
    <div style={quickActionsStyles.window}>
      <div style={quickActionsStyles.header}>
        <h2 style={quickActionsStyles.headerTitle}><Zap size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Quick Actions</h2>
        <button
          className="btn-icon"
          style={quickActionsStyles.closeButton}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      {!isEditing ? (
        <div style={quickActionsStyles.content}>
          <div style={quickActionsStyles.toolbar}>
            <button
              className="btn-primary"
              style={quickActionsStyles.addActionButton}
              onClick={handleAdd}
            >
              + Add Action
            </button>
          </div>

          {actions.length === 0 ? (
            <div style={quickActionsStyles.empty}>
              <p style={quickActionsStyles.emptyText}>No quick actions yet.</p>
              <p style={quickActionsStyles.emptyText}>Click "Add Action" to create your first workflow.</p>
            </div>
          ) : (
            <div style={quickActionsStyles.list}>
              {actions.map((action) => {
                return (
                  <div
                    key={action.id}
                    className="quick-action-item"
                    style={quickActionsStyles.item}
                  >
                    <div style={quickActionsStyles.info}>
                      <div style={quickActionsStyles.name}>{action.name}</div>
                      <div style={quickActionsStyles.commands}>
                        {action.commands.slice(0, expandedActions.has(action.id) ? undefined : 5).map((cmd, idx) => (
                          <div key={idx} style={quickActionsStyles.command}>
                            {idx + 1}. {cmd}
                          </div>
                        ))}
                        {action.commands.length > 5 && (
                          <div
                            className="quick-action-expand"
                            style={quickActionsStyles.expand}
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
                              ? <><ChevronDown size={12} /> Show less</>
                              : <><ChevronRight size={12} /> Show {action.commands.length - 5} more...</>
                            }
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={quickActionsStyles.buttons}>
                      <button
                        className="btn-success"
                        style={quickActionsStyles.executeButton}
                        onClick={() => onExecute(action)}
                        title="Execute commands in active terminal"
                      >
                        <Play size={12} style={{ marginRight: 4 }} /> Execute
                      </button>
                      <button
                        className="btn-ghost"
                        style={quickActionsStyles.editButton}
                        onClick={() => handleEdit(action)}
                        title="Edit action"
                      >
                        Edit
                      </button>
                      <button
                        className="btn-danger"
                        style={quickActionsStyles.deleteButton}
                        onClick={() => handleDelete(action.id)}
                        title="Delete action"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={quickActionsStyles.form}>
          <div style={quickActionsStyles.formGroup}>
            <label style={quickActionsStyles.formLabel}>Action Name</label>
            <input
              type="text"
              style={quickActionsStyles.formInput}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Build & Test"
              autoFocus
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div style={quickActionsStyles.formGroup}>
            <label style={quickActionsStyles.formLabel}>Commands (one per line)</label>
            <textarea
              style={quickActionsStyles.formTextarea}
              value={formCommands}
              onChange={(e) => setFormCommands(e.target.value)}
              placeholder="npm install&#10;npm run build&#10;npm test"
              rows={10}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div style={quickActionsStyles.formButtons}>
            <button
              className="btn-primary"
              style={quickActionsStyles.saveButton}
              onClick={handleSave}
            >
              Save
            </button>
            <button
              className="btn-secondary"
              style={quickActionsStyles.cancelButton}
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickActionsWindow;
