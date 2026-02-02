/**
 * Command Palette - VS Code-style command palette for quick action access
 * 
 * Open with Cmd+Shift+P (macOS) or Ctrl+Shift+P (Windows/Linux)
 * 
 * Features:
 * - Fuzzy search across all actions
 * - Keyboard navigation (arrows, Enter, Escape)
 * - Category grouping
 * - Shortcut display
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  searchActions, 
  groupActionsByCategory, 
  sortCategories,
  type Action,
  type ActionCategory,
} from '../actions/actionRegistry';
import './CommandPalette.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter actions based on query
  const filteredActions = useMemo(() => {
    return searchActions(query);
  }, [query]);

  // Group actions by category when no query (show all)
  const groupedActions = useMemo(() => {
    if (query.trim()) {
      // When searching, show flat list sorted by relevance
      return null;
    }
    return groupActionsByCategory(filteredActions);
  }, [filteredActions, query]);

  // Build flat list for keyboard navigation
  const flatList = useMemo(() => {
    if (groupedActions) {
      const list: Action[] = [];
      const sortedCategories = sortCategories(Array.from(groupedActions.keys()));
      for (const category of sortedCategories) {
        const actions = groupedActions.get(category) || [];
        list.push(...actions);
      }
      return list;
    }
    return filteredActions;
  }, [groupedActions, filteredActions]);

  // Pre-compute action ID to index mapping for O(1) lookups
  const actionIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatList.forEach((action, index) => {
      map.set(action.id, index);
    });
    return map;
  }, [flatList]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredActions.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector('.command-palette-item.selected');
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatList[selectedIndex]) {
          executeAction(flatList[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else {
          setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
        }
        break;
    }
  }, [flatList, selectedIndex, onClose]);

  // Execute an action and close the palette
  const executeAction = useCallback((action: Action) => {
    onClose();
    // Small delay to ensure palette closes before action runs
    setTimeout(() => {
      action.execute();
    }, 50);
  }, [onClose]);

  // Handle click outside to close
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={handleOverlayClick}>
      <div className="command-palette">
        <div className="command-palette-input-wrapper">
          <span className="command-palette-icon">⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button 
              className="command-palette-clear"
              onClick={() => setQuery('')}
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>
        
        <div className="command-palette-list" ref={listRef}>
          {flatList.length === 0 ? (
            <div className="command-palette-empty">
              {query.trim() 
                ? `No commands found for "${query}"` 
                : 'No commands available'
              }
            </div>
          ) : groupedActions && !query.trim() ? (
            // Grouped view (no search query)
            <>
              {sortCategories(Array.from(groupedActions.keys())).map(category => (
                <CategoryGroup
                  key={category}
                  category={category}
                  actions={groupedActions.get(category) || []}
                  selectedIndex={selectedIndex}
                  actionIndexMap={actionIndexMap}
                  onSelect={executeAction}
                  onHover={setSelectedIndex}
                />
              ))}
            </>
          ) : (
            // Flat view (search results)
            flatList.map((action, index) => (
              <ActionItem
                key={action.id}
                action={action}
                isSelected={index === selectedIndex}
                showCategory={true}
                onSelect={() => executeAction(action)}
                onHover={() => setSelectedIndex(index)}
              />
            ))
          )}
        </div>
        
        <div className="command-palette-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Run</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

// Category group component
interface CategoryGroupProps {
  category: ActionCategory;
  actions: Action[];
  selectedIndex: number;
  actionIndexMap: Map<string, number>;
  onSelect: (action: Action) => void;
  onHover: (index: number) => void;
}

function CategoryGroup({ 
  category, 
  actions, 
  selectedIndex, 
  actionIndexMap,
  onSelect, 
  onHover 
}: CategoryGroupProps) {
  return (
    <div className="command-palette-category">
      <div className="command-palette-category-header">{category}</div>
      {actions.map(action => {
        const flatIndex = actionIndexMap.get(action.id) ?? -1;
        return (
          <ActionItem
            key={action.id}
            action={action}
            isSelected={flatIndex === selectedIndex}
            showCategory={false}
            onSelect={() => onSelect(action)}
            onHover={() => onHover(flatIndex)}
          />
        );
      })}
    </div>
  );
}

// Individual action item component
interface ActionItemProps {
  action: Action;
  isSelected: boolean;
  showCategory: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function ActionItem({ action, isSelected, showCategory, onSelect, onHover }: ActionItemProps) {
  return (
    <div
      className={`command-palette-item ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      {action.icon && <span className="command-palette-item-icon">{action.icon}</span>}
      <span className="command-palette-item-label">{action.label}</span>
      {showCategory && (
        <span className="command-palette-item-category">{action.category}</span>
      )}
      {action.shortcut && (
        <span className="command-palette-item-shortcut">{action.shortcut}</span>
      )}
    </div>
  );
}
