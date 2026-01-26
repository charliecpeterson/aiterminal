import React, { useState, useEffect } from "react";
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
  
  // Hover states
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({
    closeButton: false,
    addButton: false,
    saveButton: false,
    cancelButton: false,
    nameInput: false,
    commandsTextarea: false,
  });

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
        <h2 style={quickActionsStyles.headerTitle}>⚡ Quick Actions</h2>
        <button 
          style={
            hoverStates.closeButton
              ? { ...quickActionsStyles.closeButton, ...quickActionsStyles.closeButtonHover }
              : quickActionsStyles.closeButton
          }
          onClick={onClose}
          onMouseEnter={() => setHoverStates(prev => ({ ...prev, closeButton: true }))}
          onMouseLeave={() => setHoverStates(prev => ({ ...prev, closeButton: false }))}
        >
          ×
        </button>
      </div>

      {!isEditing ? (
        <div style={quickActionsStyles.content}>
          <div style={quickActionsStyles.toolbar}>
            <button 
              style={
                hoverStates.addButton
                  ? { ...quickActionsStyles.addActionButton, ...quickActionsStyles.addActionButtonHover }
                  : quickActionsStyles.addActionButton
              }
              onClick={handleAdd}
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, addButton: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, addButton: false }))}
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
                const itemHoverKey = `item-${action.id}`;
                const expandHoverKey = `expand-${action.id}`;
                const executeHoverKey = `execute-${action.id}`;
                const editHoverKey = `edit-${action.id}`;
                const deleteHoverKey = `delete-${action.id}`;
                
                return (
                  <div 
                    key={action.id} 
                    style={
                      hoverStates[itemHoverKey]
                        ? { ...quickActionsStyles.item, ...quickActionsStyles.itemHover }
                        : quickActionsStyles.item
                    }
                    onMouseEnter={() => setHoverStates(prev => ({ ...prev, [itemHoverKey]: true }))}
                    onMouseLeave={() => setHoverStates(prev => ({ ...prev, [itemHoverKey]: false }))}
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
                            style={
                              hoverStates[expandHoverKey]
                                ? { ...quickActionsStyles.expand, ...quickActionsStyles.expandHover }
                                : quickActionsStyles.expand
                            }
                            onClick={() => {
                              const newExpanded = new Set(expandedActions);
                              if (expandedActions.has(action.id)) {
                                newExpanded.delete(action.id);
                              } else {
                                newExpanded.add(action.id);
                              }
                              setExpandedActions(newExpanded);
                            }}
                            onMouseEnter={() => setHoverStates(prev => ({ ...prev, [expandHoverKey]: true }))}
                            onMouseLeave={() => setHoverStates(prev => ({ ...prev, [expandHoverKey]: false }))}
                          >
                            {expandedActions.has(action.id) 
                              ? '▼ Show less' 
                              : `▶ Show ${action.commands.length - 5} more...`
                            }
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={quickActionsStyles.buttons}>
                      <button
                        style={
                          hoverStates[executeHoverKey]
                            ? { ...quickActionsStyles.executeButton, ...quickActionsStyles.executeButtonHover }
                            : quickActionsStyles.executeButton
                        }
                        onClick={() => onExecute(action)}
                        title="Execute commands in active terminal"
                        onMouseEnter={() => setHoverStates(prev => ({ ...prev, [executeHoverKey]: true }))}
                        onMouseLeave={() => setHoverStates(prev => ({ ...prev, [executeHoverKey]: false }))}
                      >
                        ▶ Execute
                      </button>
                      <button
                        style={
                          hoverStates[editHoverKey]
                            ? { ...quickActionsStyles.editButton, ...quickActionsStyles.editButtonHover }
                            : quickActionsStyles.editButton
                        }
                        onClick={() => handleEdit(action)}
                        title="Edit action"
                        onMouseEnter={() => setHoverStates(prev => ({ ...prev, [editHoverKey]: true }))}
                        onMouseLeave={() => setHoverStates(prev => ({ ...prev, [editHoverKey]: false }))}
                      >
                        Edit
                      </button>
                      <button
                        style={
                          hoverStates[deleteHoverKey]
                            ? { ...quickActionsStyles.deleteButton, ...quickActionsStyles.deleteButtonHover }
                            : quickActionsStyles.deleteButton
                        }
                        onClick={() => handleDelete(action.id)}
                        title="Delete action"
                        onMouseEnter={() => setHoverStates(prev => ({ ...prev, [deleteHoverKey]: true }))}
                        onMouseLeave={() => setHoverStates(prev => ({ ...prev, [deleteHoverKey]: false }))}
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
              style={
                hoverStates.nameInput
                  ? { ...quickActionsStyles.formInput, ...quickActionsStyles.formInputFocus }
                  : quickActionsStyles.formInput
              }
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Build & Test"
              autoFocus
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              onFocus={() => setHoverStates(prev => ({ ...prev, nameInput: true }))}
              onBlur={() => setHoverStates(prev => ({ ...prev, nameInput: false }))}
            />
          </div>

          <div style={quickActionsStyles.formGroup}>
            <label style={quickActionsStyles.formLabel}>Commands (one per line)</label>
            <textarea
              style={
                hoverStates.commandsTextarea
                  ? { ...quickActionsStyles.formTextarea, ...quickActionsStyles.formTextareaFocus }
                  : quickActionsStyles.formTextarea
              }
              value={formCommands}
              onChange={(e) => setFormCommands(e.target.value)}
              placeholder="npm install&#10;npm run build&#10;npm test"
              rows={10}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              onFocus={() => setHoverStates(prev => ({ ...prev, commandsTextarea: true }))}
              onBlur={() => setHoverStates(prev => ({ ...prev, commandsTextarea: false }))}
            />
          </div>

          <div style={quickActionsStyles.formButtons}>
            <button 
              style={
                hoverStates.saveButton
                  ? { ...quickActionsStyles.saveButton, ...quickActionsStyles.saveButtonHover }
                  : quickActionsStyles.saveButton
              }
              onClick={handleSave}
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, saveButton: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, saveButton: false }))}
            >
              Save
            </button>
            <button 
              style={
                hoverStates.cancelButton
                  ? { ...quickActionsStyles.cancelButton, ...quickActionsStyles.cancelButtonHover }
                  : quickActionsStyles.cancelButton
              }
              onClick={handleCancel}
              onMouseEnter={() => setHoverStates(prev => ({ ...prev, cancelButton: true }))}
              onMouseLeave={() => setHoverStates(prev => ({ ...prev, cancelButton: false }))}
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
