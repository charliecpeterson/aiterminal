/**
 * TabBar Component
 * Renders the tab bar with draggable tabs, tab renaming, and new tab button
 */

import { useState } from "react";

interface Tab {
  id: number;
  title: string;
  customName?: string;
}

interface RunningCommand {
  startTime: number;
  elapsed: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: number | null;
  runningCommands: Map<number, RunningCommand>;
  onTabClick: (tabId: number) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: number) => void;
  onRenameTab: (tabId: number, name: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
}

export function TabBar(props: TabBarProps) {
  const {
    tabs,
    activeTabId,
    runningCommands,
    onTabClick,
    onNewTab,
    onCloseTab,
    onRenameTab,
    onReorderTabs,
  } = props;

  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);

  const formatElapsedTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  return (
    <>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? "active" : ""} ${isDragging && draggedTabIndex === index ? "dragging" : ""}`}
          onMouseDown={(e) => {
            if (editingTabId === tab.id || e.button !== 0) return;
            setDragStartX(e.clientX);
            setDraggedTabIndex(index);
          }}
          onMouseMove={(e) => {
            if (draggedTabIndex === index && e.buttons === 1 && Math.abs(e.clientX - dragStartX) > 5) {
              setIsDragging(true);
            }
            if (isDragging && draggedTabIndex !== null && draggedTabIndex !== index) {
              onReorderTabs(draggedTabIndex, index);
              setDraggedTabIndex(index);
            }
          }}
          onMouseUp={() => {
            setIsDragging(false);
            setDraggedTabIndex(null);
          }}
          onClick={() => {
            if (!isDragging && editingTabId !== tab.id) {
              onTabClick(tab.id);
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingTabId(tab.id);
          }}
        >
          {editingTabId === tab.id ? (
            <input
              type="text"
              className="tab-name-input"
              defaultValue={tab.customName || tab.title}
              autoFocus
              onBlur={(e) => {
                onRenameTab(tab.id, e.target.value);
                setEditingTabId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRenameTab(tab.id, e.currentTarget.value);
                  setEditingTabId(null);
                } else if (e.key === "Escape") {
                  setEditingTabId(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              {runningCommands.has(tab.id) && runningCommands.get(tab.id)!.elapsed >= 10000 && (
                <span className="tab-running-indicator" title="Command running">
                  {formatElapsedTime(runningCommands.get(tab.id)!.elapsed)}
                </span>
              )}
              {tab.customName || tab.title}
            </>
          )}
          <span
            className="close-tab"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
          >
            ×
          </span>
        </div>
      ))}
      <div className="new-tab-button" onClick={onNewTab}>
        +
      </div>
    </>
  );
}
