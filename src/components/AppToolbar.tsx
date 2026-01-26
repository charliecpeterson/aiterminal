/**
 * AppToolbar Component
 * Renders the top toolbar with action buttons
 */

interface AppToolbarProps {
  onSSHClick: () => void;
  onAIPanelClick: () => void;
  onQuickActionsClick: () => void;
  onHistoryClick: () => void;
  onSettingsClick: () => void;
}

export function AppToolbar(props: AppToolbarProps) {
  const {
    onSSHClick,
    onAIPanelClick,
    onQuickActionsClick,
    onHistoryClick,
    onSettingsClick,
  } = props;

  return (
    <div className="top-segmented" role="group" aria-label="Top actions">
      <div
        className="segmented-button"
        onClick={onSSHClick}
        title="SSH Sessions (Cmd/Ctrl+Shift+O)"
      >
        SSH
      </div>
      <div
        className="segmented-button"
        onClick={onAIPanelClick}
        title="Open AI Panel (Cmd/Ctrl+B)"
      >
        AI Panel
      </div>
      <div
        className="segmented-button"
        onClick={onQuickActionsClick}
        title="Quick Actions"
      >
        Quick Actions
      </div>
      <div
        className="segmented-button"
        onClick={onHistoryClick}
        title="Command History (Cmd+R)"
      >
        History
      </div>
      <div 
        className="segmented-button"
        onClick={onSettingsClick}
        title="Settings (Cmd+,)"
      >
        Settings
      </div>
    </div>
  );
}
