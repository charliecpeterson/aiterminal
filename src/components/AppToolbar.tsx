/**
 * AppToolbar Component
 * Renders a minimal top toolbar with essential actions.
 * Additional actions are available via Command Palette (Cmd/Ctrl+Shift+P)
 */
import { Server, BrainCircuit, Command } from "lucide-react";

interface AppToolbarProps {
  onSSHClick: () => void;
  onAIPanelClick: () => void;
  onCommandPaletteClick: () => void;
}

export function AppToolbar(props: AppToolbarProps) {
  const { onSSHClick, onAIPanelClick, onCommandPaletteClick } = props;

  return (
    <div className="top-segmented" role="group" aria-label="Top actions">
      <button
        className="segmented-button"
        onClick={onSSHClick}
        title="SSH Sessions (Cmd/Ctrl+Shift+O)"
      >
        <Server size={14} />
        <span className="segmented-label">SSH</span>
      </button>
      <button
        className="segmented-button"
        onClick={onAIPanelClick}
        title="Open AI Panel (Cmd/Ctrl+B)"
      >
        <BrainCircuit size={14} />
        <span className="segmented-label">AI</span>
      </button>
      <button
        className="segmented-button segmented-button-subtle"
        onClick={onCommandPaletteClick}
        title="Command Palette (Cmd/Ctrl+Shift+P)"
      >
        <Command size={13} />
      </button>
    </div>
  );
}
