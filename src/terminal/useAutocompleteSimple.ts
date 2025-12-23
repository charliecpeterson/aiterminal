/**
 * Clean rewrite: Fish-style autocomplete that tracks user input directly
 * No terminal buffer parsing - just track what the user types
 */

import { useEffect, useRef } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { invoke } from '@tauri-apps/api/core';
import { SimpleAutocomplete } from './autocomplete/simple';

export function useAutocompleteSimple(
  terminalRef: React.RefObject<XTermTerminal | null>,
  enabled: boolean,
  ptyId: number,
) {
  const autocompleteRef = useRef<SimpleAutocomplete | null>(null);
  const onDataDisposerRef = useRef<{ dispose: () => void } | null>(null);

  // Initialize
  useEffect(() => {
    if (enabled && !autocompleteRef.current) {
      autocompleteRef.current = new SimpleAutocomplete();
    }
  }, [enabled]);

  // Load history
  useEffect(() => {
    if (!enabled || !autocompleteRef.current) return;

    const loadHistory = async () => {
      try {
        const history = await invoke<string[]>('get_shell_history');
        autocompleteRef.current?.updateHistory(history);
      } catch (error) {
        console.error('Failed to load shell history:', error);
      }
    };

    loadHistory();
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, [enabled]);

  // Handle keyboard - use onKey instead of onData since PTY consumes onData first
  useEffect(() => {
    const terminal = terminalRef.current;
    const autocomplete = autocompleteRef.current;
    
    if (!enabled || !terminal || !autocomplete) {
      if (onDataDisposerRef.current) {
        onDataDisposerRef.current.dispose();
        onDataDisposerRef.current = null;
      }
      return;
    }

    // Dispose previous listener
    if (onDataDisposerRef.current) {
      onDataDisposerRef.current.dispose();
    }

    // Use onKey instead of onData - fires BEFORE PTY gets the data
    const disposer = terminal.onKey((event) => {
      const domKey = event.domEvent.key;
      
      // Right arrow → accept suggestion
      if (domKey === 'ArrowRight') {
        const toInsert = autocomplete.acceptSuggestion();
        if (toInsert) {
          autocomplete.clearRender(terminal);
          // Only send to PTY - let the shell echo it back naturally
          invoke('write_to_pty', { id: ptyId, data: toInsert }).catch(console.error);
          event.domEvent.preventDefault();
          event.domEvent.stopPropagation();
          return;
        }
      }

      // Enter → reset
      if (domKey === 'Enter') {
        autocomplete.clearRender(terminal);
        autocomplete.onEnter();
        return;
      }

      // Backspace
      if (domKey === 'Backspace') {
        autocomplete.clearRender(terminal);
        autocomplete.onBackspace();
        setTimeout(() => autocomplete.render(terminal), 10);
        return;
      }

      // Ctrl+C → clear
      if (domKey === 'c' && event.domEvent.ctrlKey) {
        autocomplete.clearRender(terminal);
        autocomplete.onClear();
        return;
      }

      // Regular printable character
      if (domKey.length === 1 && !event.domEvent.ctrlKey && !event.domEvent.metaKey && !event.domEvent.altKey) {
        autocomplete.clearRender(terminal);
        autocomplete.onChar(domKey);
        setTimeout(() => autocomplete.render(terminal), 10);
      }
    });

    onDataDisposerRef.current = disposer;

    return () => {
      disposer.dispose();
    };
  }, [enabled, terminalRef.current]); // Re-run when terminal becomes available

  return null;
}
