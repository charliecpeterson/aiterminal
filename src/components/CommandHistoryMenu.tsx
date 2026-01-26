import React, { useState, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { commandHistoryStyles } from "./CommandHistoryMenu.styles";

interface CommandHistoryItem {
  command: string;
  line: number;
  exitCode?: number;
  timestamp: number;
  hasOutput: boolean;
}

interface CommandHistoryMenuProps {
  isOpen: boolean;
  onClose: () => void;
  terminal: Terminal | null;
  onJumpToCommand: (line: number) => void;
  onCopyCommand: (line: number) => void;
  onAddToContext: (line: number) => void;
  getCommandHistory?: () => Array<{
    line: number;
    command: string;
    exitCode?: number;
    timestamp: number;
    hasOutput: boolean;
  }>;
}

const CommandHistoryMenu: React.FC<CommandHistoryMenuProps> = ({
  isOpen,
  onClose,
  terminal: _terminal,
  onJumpToCommand,
  onCopyCommand,
  onAddToContext,
  getCommandHistory,
}) => {
  const [commands, setCommands] = useState<CommandHistoryItem[]>([]);
  const [filteredCommands, setFilteredCommands] = useState<CommandHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && getCommandHistory) {
      // Get commands from marker manager
      const historyItems = getCommandHistory();
      
      // Sort by line number (most recent first)
      historyItems.sort((a, b) => b.line - a.line);
      
      // Limit to 50 most recent
      const recentCommands = historyItems.slice(0, 50);
      setCommands(recentCommands);
      setFilteredCommands(recentCommands);
      setSelectedIndex(0);
      
      // Focus input
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen, getCommandHistory]);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredCommands(commands);
      setSelectedIndex(0);
      return;
    }

    // Simple fuzzy search
    const query = searchQuery.toLowerCase();
    const filtered = commands.filter(cmd => 
      cmd.command.toLowerCase().includes(query)
    );
    setFilteredCommands(filtered);
    setSelectedIndex(0);
  }, [searchQuery, commands]);

  useEffect(() => {
    // Scroll selected item into view
    if (listRef.current && filteredCommands.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, filteredCommands]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleJump(filteredCommands[selectedIndex]);
      }
    } else if (e.metaKey && e.key === 'c') {
      // Cmd+C - copy
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleCopy(filteredCommands[selectedIndex]);
      }
    } else if (e.metaKey && e.key === 'a') {
      // Cmd+A - add to AI context
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleAddToContext(filteredCommands[selectedIndex]);
      }
    }
  };

  const handleJump = (item: CommandHistoryItem) => {
    onJumpToCommand(item.line);
    onClose();
  };

  const handleCopy = (item: CommandHistoryItem) => {
    onCopyCommand(item.line);
    onClose();
  };

  const handleAddToContext = (item: CommandHistoryItem) => {
    onAddToContext(item.line);
    onClose();
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div style={commandHistoryStyles.overlay} onClick={onClose}>
      <div style={commandHistoryStyles.menu} onClick={(e) => e.stopPropagation()}>
        <div style={commandHistoryStyles.header}>
          <input
            ref={inputRef}
            type="text"
            style={
              hoverStates.searchFocus
                ? { ...commandHistoryStyles.search, ...commandHistoryStyles.searchFocus }
                : commandHistoryStyles.search
            }
            placeholder="Search command history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setHoverStates(prev => ({ ...prev, searchFocus: true }))}
            onBlur={() => setHoverStates(prev => ({ ...prev, searchFocus: false }))}
          />
          <div style={commandHistoryStyles.hint}>
            <kbd style={commandHistoryStyles.kbd}>↑↓</kbd> Navigate • <kbd style={commandHistoryStyles.kbd}>↵</kbd> Jump • <kbd style={commandHistoryStyles.kbd}>⌘C</kbd> Copy • <kbd style={commandHistoryStyles.kbd}>⌘A</kbd> Add to AI • <kbd style={commandHistoryStyles.kbd}>Esc</kbd> Close
          </div>
        </div>
        
        <div style={commandHistoryStyles.list} ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div style={commandHistoryStyles.empty}>
              {searchQuery ? 'No matching commands' : 'No command history'}
            </div>
          ) : (
            filteredCommands.map((item, index) => {
              const itemHoverKey = `item-${index}`;
              const copyBtnKey = `copy-${index}`;
              const aiBtnKey = `ai-${index}`;
              const isSelected = index === selectedIndex;
              const isItemHover = hoverStates[itemHoverKey] || false;
              
              return (
                <div
                  key={`${item.line}-${index}`}
                  style={
                    isSelected
                      ? { ...commandHistoryStyles.item, ...commandHistoryStyles.itemSelected }
                      : isItemHover
                        ? { ...commandHistoryStyles.item, ...commandHistoryStyles.itemHover }
                        : commandHistoryStyles.item
                  }
                  onClick={() => handleJump(item)}
                  onMouseEnter={() => setHoverStates(prev => ({ ...prev, [itemHoverKey]: true }))}
                  onMouseLeave={() => setHoverStates(prev => ({ ...prev, [itemHoverKey]: false }))}
                >
                  <div style={commandHistoryStyles.itemHeader}>
                    <span style={commandHistoryStyles.text}>{item.command}</span>
                    <span style={commandHistoryStyles.time}>{formatTime(item.timestamp)}</span>
                  </div>
                  <div style={commandHistoryStyles.itemFooter}>
                    {item.exitCode !== undefined && (
                      <span style={
                        item.exitCode === 0
                          ? { ...commandHistoryStyles.exit, ...commandHistoryStyles.exitSuccess }
                          : { ...commandHistoryStyles.exit, ...commandHistoryStyles.exitError }
                      }>
                        {item.exitCode === 0 ? '✓' : '✗'} {item.exitCode}
                      </span>
                    )}
                    {item.hasOutput && (
                      <span style={commandHistoryStyles.hasOutput}>has output</span>
                    )}
                    <div style={
                      (isSelected || isItemHover)
                        ? { ...commandHistoryStyles.actions, ...commandHistoryStyles.actionsVisible }
                        : commandHistoryStyles.actions
                    }>
                      <button
                        style={
                          hoverStates[copyBtnKey]
                            ? { ...commandHistoryStyles.action, ...commandHistoryStyles.actionHover }
                            : commandHistoryStyles.action
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(item);
                        }}
                        onMouseEnter={() => setHoverStates(prev => ({ ...prev, [copyBtnKey]: true }))}
                        onMouseLeave={() => setHoverStates(prev => ({ ...prev, [copyBtnKey]: false }))}
                        title="Copy to clipboard (⌘C)"
                      >
                        Copy
                      </button>
                      <button
                        style={
                          hoverStates[aiBtnKey]
                            ? { ...commandHistoryStyles.action, ...commandHistoryStyles.actionHover }
                            : commandHistoryStyles.action
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToContext(item);
                        }}
                        onMouseEnter={() => setHoverStates(prev => ({ ...prev, [aiBtnKey]: true }))}
                        onMouseLeave={() => setHoverStates(prev => ({ ...prev, [aiBtnKey]: false }))}
                        title="Add to AI context (⌘A)"
                      >
                        + AI
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandHistoryMenu;
