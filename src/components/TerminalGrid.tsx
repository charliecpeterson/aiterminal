/**
 * TerminalGrid Component
 * Renders terminal grid with split panes and dividers
 */

import React from "react";
import Terminal from "./Terminal";
import { TerminalErrorBoundary } from "./TerminalErrorBoundary";
import { PortForwardStatus } from "./PortForwardStatus";
import { createLogger } from "../utils/logger";
import type { PortForward } from "../types/ssh";

const log = createLogger('TerminalGrid');

interface Pane {
  id: number;
  isRemote?: boolean;
  remoteHost?: string;
}

interface Tab {
  id: number;
  title: string;
  customName?: string;
  panes: Pane[];
  focusedPaneId: number | null;
  splitLayout: 'single' | 'vertical' | 'horizontal';
  splitRatio: number;
  profileId?: string;
}

interface TerminalGridProps {
  tabs: Tab[];
  activeTabId: number | null;
  onFocusPane: (tabId: number, paneId: number) => void;
  onUpdateRemoteState: (tabId: number, paneId: number, isRemote: boolean, remoteHost?: string) => void;
  onClosePane: (tabId: number, paneId: number) => void;
  onCommandRunning: (paneId: number, isRunning: boolean, startTime?: number) => void;
  onUpdateSplitRatio: (tabId: number, ratio: number) => void;
  getProfileById: (profileId: string) => { portForwards?: PortForward[] } | undefined;
}

export function TerminalGrid(props: TerminalGridProps) {
  const {
    tabs,
    activeTabId,
    onFocusPane,
    onUpdateRemoteState,
    onClosePane,
    onCommandRunning,
    onUpdateSplitRatio,
    getProfileById,
  } = props;

  return (
    <div className="workbench">
      <div className="terminal-pane" style={{ flex: 1 }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-content ${tab.id === activeTabId ? "active" : ""}`}
            style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
          >
            <div 
              className={`split-container split-${tab.splitLayout}`}
              style={{
                display: 'grid',
                gridTemplateColumns: tab.splitLayout === 'vertical' 
                  ? `${tab.splitRatio}% 4px ${100 - tab.splitRatio}%` 
                  : '1fr',
                gridTemplateRows: tab.splitLayout === 'horizontal' 
                  ? `${tab.splitRatio}% 4px ${100 - tab.splitRatio}%` 
                  : '1fr',
                width: '100%',
                height: '100%'
              }}
            >
              {tab.panes.map((pane, index) => (
                <React.Fragment key={pane.id}>
                  <div
                    className={`terminal-wrapper ${pane.id === tab.focusedPaneId ? "focused" : ""}`}
                    onClick={() => onFocusPane(tab.id, pane.id)}
                    style={{
                      border: pane.id === tab.focusedPaneId ? '2px solid #007acc' : '2px solid transparent',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Show port forwards if this is an SSH tab with forwarding configured */}
                    {tab.profileId && (() => {
                      const profile = getProfileById(tab.profileId);
                      return profile?.portForwards && profile.portForwards.length > 0 ? (
                        <PortForwardStatus portForwards={profile.portForwards} />
                      ) : null;
                    })()}
                    <TerminalErrorBoundary 
                      terminalId={pane.id}
                      onReset={() => {
                        // Terminal will be recreated when error boundary resets
                        log.debug(`Terminal ${pane.id} reset after error`);
                      }}
                    >
                      <Terminal 
                        id={pane.id} 
                        visible={tab.id === activeTabId}
                        onUpdateRemoteState={(isRemote, remoteHost) => onUpdateRemoteState(tab.id, pane.id, isRemote, remoteHost)}
                        onClose={() => onClosePane(tab.id, pane.id)}
                        onCommandRunning={(isRunning, startTime) => onCommandRunning(pane.id, isRunning, startTime)}
                      />
                    </TerminalErrorBoundary>
                  </div>
                  {index === 0 && tab.panes.length > 1 && (
                    <div
                      className={`split-divider split-divider-${tab.splitLayout}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const container = e.currentTarget.parentElement;
                        if (!container) return;

                        const handleMouseMove = (e: MouseEvent) => {
                          const containerRect = container.getBoundingClientRect();
                          const containerStart = tab.splitLayout === 'vertical' ? containerRect.left : containerRect.top;
                          const containerSize = tab.splitLayout === 'vertical' ? containerRect.width : containerRect.height;
                          const currentPos = tab.splitLayout === 'vertical' ? e.clientX : e.clientY;
                          const newRatio = ((currentPos - containerStart) / containerSize) * 100;
                          onUpdateSplitRatio(tab.id, newRatio);
                        };

                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };

                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
