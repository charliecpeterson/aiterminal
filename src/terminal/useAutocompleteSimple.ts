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
    console.log('🔧 Autocomplete init effect running. enabled:', enabled, 'ref exists:', !!autocompleteRef.current);
    if (enabled && !autocompleteRef.current) {
      console.log('🚀 Autocomplete initialized');
      autocompleteRef.current = new SimpleAutocomplete();
    }
  }, [enabled]);

  // Load history
  useEffect(() => {
    if (!enabled || !autocompleteRef.current) return;

    const loadHistory = async () => {
      try {
        const history = await invoke<string[]>('get_shell_history');
        console.log('✅ Loaded', history.length, 'commands from history');
        autocompleteRef.current?.updateHistory(history);
      } catch (error) {
        console.error('❌ Failed to load history:', error);
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
    
    console.log('⚙️ Keyboard effect running. enabled:', enabled, 'terminal:', !!terminal, 'autocomplete:', !!autocomplete);
    
    if (!enabled || !terminal || !autocomplete) {
      console.log('❌ Skipping keyboard setup:', { enabled, hasTerminal: !!terminal, hasAutocomplete: !!autocomplete });
      if (onDataDisposerRef.current) {
        onDataDisposerRef.current.dispose();
        onDataDisposerRef.current = null;
      }
      return;
    }
    
    console.log('✅ Setting up onKey handler');

    // Dispose previous listener
    if (onDataDisposerRef.current) {
      onDataDisposerRef.current.dispose();
    }

    // Use onKey instead of onData - fires BEFORE PTY gets the data
    const disposer = terminal.onKey((event) => {
      const domKey = event.domEvent.key;
      console.log('⌨️ onKey domEvent.key:', domKey, 'length:', domKey.length, 'charCodes:', Array.from(domKey).map(c => c.charCodeAt(0)));
      
      // Right arrow → accept suggestion
      if (domKey === 'ArrowRight') {
        const toInsert = autocomplete.acceptSuggestion();
        if (toInsert) {
          console.log('✓ Accepting:', toInsert);
          autocomplete.clearRender(terminal);
          // Only send to PTY - let the shell echo it back naturally
          // DON'T write to terminal display - that causes double rendering
          invoke('write_to_pty', { id: ptyId, data: toInsert }).catch(console.error);
          // Prevent default arrow key from being sent to PTY
          event.domEvent.preventDefault();
          event.domEvent.stopPropagation();
          return;
        }
        // If no suggestion, let arrow key through normally
      }

      // Enter → reset
      if (domKey === 'Enter') {
        console.log('↵ Enter pressed');
        autocomplete.clearRender(terminal);
        autocomplete.onEnter();
        return;
      }

      // Backspace
      if (domKey === 'Backspace') {
        console.log('⌫ Backspace');
        autocomplete.clearRender(terminal);
        autocomplete.onBackspace();
        setTimeout(() => autocomplete.render(terminal), 10);
        return;
      }

      // Ctrl+C → clear
      if (domKey === 'c' && event.domEvent.ctrlKey) {
        console.log('^C Ctrl+C');
        autocomplete.clearRender(terminal);
        autocomplete.onClear();
        return;
      }

      // Regular printable character - use domKey which is the actual character
      if (domKey.length === 1 && !event.domEvent.ctrlKey && !event.domEvent.metaKey && !event.domEvent.altKey) {
        console.log('✏️ Regular char:', domKey);
        autocomplete.clearRender(terminal);
        autocomplete.onChar(domKey);
        const suggestion = autocomplete.getSuggestion();
        console.log('💡 Suggestion after typing:', suggestion);
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
