import React, { useState, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import "./CommandHistoryMenu.css";

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
  terminal,
  onJumpToCommand,
  onCopyCommand,
  onAddToContext,
  getCommandHistory,
}) => {
  const [commands, setCommands] = useState<CommandHistoryItem[]>([]);
  const [filteredCommands, setFilteredCommands] = useState<CommandHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
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
    <div className="command-history-overlay" onClick={onClose}>
      <div className="command-history-menu" onClick={(e) => e.stopPropagation()}>
        <div className="command-history-header">
          <input
            ref={inputRef}
            type="text"
            className="command-history-search"
            placeholder="Search command history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="command-history-hint">
            <kbd>↑↓</kbd> Navigate • <kbd>↵</kbd> Jump • <kbd>⌘C</kbd> Copy • <kbd>⌘A</kbd> Add to AI • <kbd>Esc</kbd> Close
          </div>
        </div>
        
        <div className="command-history-list" ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div className="command-history-empty">
              {searchQuery ? 'No matching commands' : 'No command history'}
            </div>
          ) : (
            filteredCommands.map((item, index) => (
              <div
                key={`${item.line}-${index}`}
                className={`command-history-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleJump(item)}
              >
                <div className="command-history-item-header">
                  <span className="command-history-text">{item.command}</span>
                  <span className="command-history-time">{formatTime(item.timestamp)}</span>
                </div>
                <div className="command-history-item-footer">
                  {item.exitCode !== undefined && (
                    <span className={`command-history-exit ${item.exitCode === 0 ? 'success' : 'error'}`}>
                      {item.exitCode === 0 ? '✓' : '✗'} {item.exitCode}
                    </span>
                  )}
                  {item.hasOutput && (
                    <span className="command-history-has-output">has output</span>
                  )}
                  <div className="command-history-actions">
                    <button
                      className="command-history-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(item);
                      }}
                      title="Copy to clipboard (⌘C)"
                    >
                      Copy
                    </button>
                    <button
                      className="command-history-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToContext(item);
                      }}
                      title="Add to AI context (⌘A)"
                    >
                      + AI
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandHistoryMenu;
