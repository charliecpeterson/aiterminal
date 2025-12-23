/**
 * React hook for managing autocomplete in terminal
 * Handles engine lifecycle, keyboard events, and rendering
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { invoke } from '@tauri-apps/api/core';
import { AutocompleteEngine } from './autocomplete/engine';
import { getCurrentLine } from './autocomplete/parser';
import { renderInlineSuggestion, clearInlineSuggestion } from './autocomplete/renderer';
import type { Suggestion } from './autocomplete/types';

interface UseAutocompleteParams {
  term: XTermTerminal | null;
  enableInline: boolean;
  enableMenu: boolean;
  ptyId?: number;
}

export function useAutocomplete({ term, enableInline, enableMenu, ptyId: _ptyId }: UseAutocompleteParams) {
  const engineRef = useRef<AutocompleteEngine | null>(null);
  const [inlineSuggestion, setInlineSuggestion] = useState<string | null>(null);
  const [menuSuggestions, setMenuSuggestions] = useState<Suggestion[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const inlineSuggestionRef = useRef<string | null>(null);
  const historyRef = useRef<string[]>([]);

  // Initialize engine
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new AutocompleteEngine(enableInline, enableMenu);
    } else {
      engineRef.current.updateSettings(enableInline, enableMenu);
    }
  }, [enableInline, enableMenu]);

  // Load shell history (Fish-style: read from actual history file)
  useEffect(() => {
    if (!engineRef.current) return;

    const loadHistory = async () => {
      try {
        const history = await invoke<string[]>('get_shell_history');
        historyRef.current = history;
        engineRef.current?.updateHistory(history);
        console.log('📚 Loaded shell history:', history.length, 'commands');
      } catch (error) {
        console.error('Failed to load shell history:', error);
      }
    };

    loadHistory();
    
    // Reload history periodically (every 10 seconds)
    const interval = setInterval(loadHistory, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // Update inline suggestion when typing
  const updateInlineSuggestion = useCallback(async () => {
    if (!term || !engineRef.current || !enableInline) {
      setInlineSuggestion(null);
      inlineSuggestionRef.current = null;
      if (term) clearInlineSuggestion(term);
      return;
    }

    const currentLine = getCurrentLine(term);
    console.log('🔍 Checking autocomplete for:', currentLine, 'History size:', historyRef.current.length);
    
    const suggestion = await engineRef.current.updateInlineSuggestion(currentLine);
    console.log('💡 Suggestion:', suggestion);
    
    setInlineSuggestion(suggestion);
    inlineSuggestionRef.current = suggestion;
    
    // Render in terminal
    renderInlineSuggestion(term, suggestion);
  }, [term, enableInline]);

  // Show menu
  const showMenu = useCallback(async () => {
    if (!term || !engineRef.current || !enableMenu) return;

    const currentLine = getCurrentLine(term);
    const suggestions = await engineRef.current.showMenu(currentLine);
    
    if (suggestions.length > 0) {
      setMenuSuggestions(suggestions);
      setMenuVisible(true);
      setSelectedIndex(0);

      // Calculate menu position based on cursor
      const cursor = term.buffer.active.cursorX;
      const cursorY = term.buffer.active.cursorY;
      
      // Convert terminal coordinates to pixels (approximate)
      const charWidth = 9; // Approximate character width
      const lineHeight = 20; // Approximate line height
      
      setMenuPosition({
        x: cursor * charWidth,
        y: (cursorY + 1) * lineHeight,
      });
    }
  }, [term, enableMenu]);

  // Hide menu
  const hideMenu = useCallback(() => {
    setMenuVisible(false);
    setMenuSuggestions([]);
    setSelectedIndex(0);
    if (engineRef.current) {
      engineRef.current.hideMenu();
    }
  }, []);

  // Navigate menu
  const navigateMenu = useCallback((direction: 'up' | 'down') => {
    if (!menuVisible || menuSuggestions.length === 0) return;

    setSelectedIndex(prev => {
      if (direction === 'down') {
        return (prev + 1) % menuSuggestions.length;
      } else {
        return (prev - 1 + menuSuggestions.length) % menuSuggestions.length;
      }
    });

    if (engineRef.current) {
      engineRef.current.navigateMenu(direction);
    }
  }, [menuVisible, menuSuggestions.length]);

  // Accept suggestion
  const acceptSuggestion = useCallback((suggestion?: Suggestion) => {
    if (!term) return;

    let textToInsert: string;
    
    if (suggestion) {
      // From menu
      textToInsert = suggestion.name;
      console.log('✅ Accepting menu suggestion:', textToInsert);
    } else if (inlineSuggestionRef.current) {
      // From inline - just insert the remaining part
      textToInsert = inlineSuggestionRef.current;
      console.log('✅ Accepting inline suggestion:', JSON.stringify(textToInsert));
    } else {
      console.log('❌ No suggestion to accept');
      return;
    }

    // Clear inline suggestion display first
    clearInlineSuggestion(term);
    
    // Write to terminal (will be sent to PTY)
    term.write(textToInsert);
    
    // Clear state
    setInlineSuggestion(null);
    inlineSuggestionRef.current = null;
    hideMenu();
  }, [term, hideMenu]);

  // Handle keyboard events
  useEffect(() => {
    if (!term) return;

    const handleData = async (data: string) => {
      // Ctrl+Space (0x00) - Show menu
      if (data === '\x00') {
        await showMenu();
        return;
      }

      // Escape - Close menu
      if (data === '\x1b') {
        if (menuVisible) {
          hideMenu();
          return;
        }
      }

      // Arrow Up - Navigate menu up
      if (data === '\x1b[A' && menuVisible) {
        navigateMenu('up');
        return;
      }

      // Arrow Down - Navigate menu down
      if (data === '\x1b[B' && menuVisible) {
        navigateMenu('down');
        return;
      }

      // Enter - Accept menu selection
      if (data === '\r' && menuVisible) {
        const selected = menuSuggestions[selectedIndex];
        if (selected) {
          acceptSuggestion(selected);
        }
        return;
      }

      // Arrow Right - Accept inline suggestion
      if (data === '\x1b[C' && inlineSuggestionRef.current && !menuVisible) {
        acceptSuggestion();
        return;
      }

      // Space or typing - Update inline suggestion
      if (data === ' ' || (data.length === 1 && data >= ' ' && data <= '~')) {
        // Wait a bit for the character to be processed
        setTimeout(() => updateInlineSuggestion(), 10);
      }
    };

    const disposable = term.onData(handleData);
    return () => disposable.dispose();
  }, [term, menuVisible, menuSuggestions, selectedIndex, showMenu, hideMenu, navigateMenu, acceptSuggestion, updateInlineSuggestion]);

  return {
    inlineSuggestion,
    menuSuggestions,
    menuVisible,
    selectedIndex,
    menuPosition,
    showMenu,
    hideMenu,
    acceptSuggestion,
  };
}
