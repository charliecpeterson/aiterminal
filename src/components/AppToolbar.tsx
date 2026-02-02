/**
 * AppToolbar Component
 * Renders a minimal top toolbar with essential actions.
 * Additional actions are available via Command Palette (Cmd/Ctrl+Shift+P)
 */

interface AppToolbarProps {
  onSSHClick: () => void;
  onAIPanelClick: () => void;
  onCommandPaletteClick: () => void;
}

export function AppToolbar(props: AppToolbarProps) {
  const { onSSHClick, onAIPanelClick, onCommandPaletteClick } = props;

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
        className="segmented-button segmented-button-subtle"
        onClick={onCommandPaletteClick}
        title="Command Palette (Cmd/Ctrl+Shift+P)"
      >
        ⌘P
      </div>
    </div>
  );
}
