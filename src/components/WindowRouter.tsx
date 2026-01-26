/**
 * Routes rendering to appropriate window type
 * Separates main window, AI panel, SSH panel, Quick Actions, Preview, and Output Viewer
 */

import React, { Suspense } from 'react';
import AIPanel from './AIPanel';
import SSHSessionWindow from './SSHSessionWindow';
import OutputViewer from './OutputViewer';
import QuickActionsWindow from './QuickActionsWindow';
import { QuickAction } from './QuickActionsWindow';
import { ErrorBoundary } from './ErrorBoundary';
import { AIPanelErrorBoundary } from './AIPanelErrorBoundary';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const PreviewWindow = React.lazy(() => import('./PreviewWindow'));

interface WindowRouterProps {
  isAiWindow: boolean;
  isSSHWindow: boolean;
  isOutputViewer: boolean;
  isQuickActionsWindow: boolean;
  isPreviewWindow: boolean;
  mainActiveTabId: number | null;
  onExecuteQuickAction: (action: QuickAction) => Promise<void>;
  children: React.ReactNode;
}

export function WindowRouter(props: WindowRouterProps) {
  const {
    isAiWindow,
    isSSHWindow,
    isOutputViewer,
    isQuickActionsWindow,
    isPreviewWindow,
    mainActiveTabId,
    onExecuteQuickAction,
    children,
  } = props;

  // AI Panel Window
  if (isAiWindow) {
    return (
      <div className="ai-window">
        <AIPanelErrorBoundary>
          <AIPanel activeTerminalId={mainActiveTabId} />
        </AIPanelErrorBoundary>
      </div>
    );
  }

  // SSH Session Window
  if (isSSHWindow) {
    return (
      <div className="ssh-window">
        <ErrorBoundary name="SSH Session Window">
          <SSHSessionWindow />
        </ErrorBoundary>
      </div>
    );
  }

  // Quick Actions Window
  if (isQuickActionsWindow) {
    return (
      <div className="quick-actions-window-wrapper">
        <ErrorBoundary name="Quick Actions Window">
          <QuickActionsWindow
            onClose={async () => {
              const window = await WebviewWindow.getByLabel("quick-actions");
              await window?.close();
            }}
            onExecute={onExecuteQuickAction}
          />
        </ErrorBoundary>
      </div>
    );
  }

  // Preview Window
  if (isPreviewWindow) {
    return (
      <ErrorBoundary name="Preview Window">
        <Suspense fallback={
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100vh', 
            color: '#999' 
          }}>
            Loading preview...
          </div>
        }>
          <PreviewWindow />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Output Viewer Window
  if (isOutputViewer) {
    return (
      <ErrorBoundary name="Output Viewer">
        <OutputViewer />
      </ErrorBoundary>
    );
  }

  // Main Window (default)
  return <>{children}</>;
}
