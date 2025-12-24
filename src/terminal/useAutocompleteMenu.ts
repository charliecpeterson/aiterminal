/**
 * Hook for LLM-powered autocomplete dropdown menu (Ctrl+Space)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { invoke } from '@tauri-apps/api/core';
import { HybridAutocomplete } from './autocomplete/hybrid';
import type { Suggestion } from './autocomplete/llm';

export function useAutocompleteMenu(
  terminalRef: React.RefObject<XTermTerminal | null>,
  enabled: boolean,
  ptyId: number,
  terminalReady: boolean,
) {
  console.log('🎯 useAutocompleteMenu hook created', { enabled, ptyId, terminalReady, hasTerminal: !!terminalRef.current });
  
  const [menuVisible, setMenuVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  
  const engineRef = useRef<HybridAutocomplete | null>(null);
  const currentInputRef = useRef<string>('');
  const trackingInputRef = useRef<boolean>(false);
  const trackedInputRef = useRef<string>('');
  
  // Initialize engine
  useEffect(() => {
    console.log('🔧 Initializing HybridAutocomplete engine');
    if (!engineRef.current) {
      engineRef.current = new HybridAutocomplete();
    }
  }, []);
  
  // Initialize LLM when enabled
  useEffect(() => {
    if (enabled && engineRef.current) {
      const modelPath = '~/.config/aiterminal/models/qwen3-1.7b-q4_k_m.gguf';
      engineRef.current.initLLM(modelPath).catch((error) => {
        console.error('Failed to initialize LLM:', error);
      });
    }
  }, [enabled]);
  
  // Load history
  useEffect(() => {
    if (!enabled || !engineRef.current) return;
    
    const loadHistory = async () => {
      try {
        const history = await invoke<string[]>('get_shell_history');
        engineRef.current?.updateHistory(history);
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    };
    
    loadHistory();
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, [enabled]);
  
  // Get current input from terminal
  const getCurrentInput = useCallback((): string => {
    const terminal = terminalRef.current;
    if (!terminal) return '';
    
    const buffer = terminal.buffer.active;
    const cursorY = buffer.cursorY;
    const cursorX = buffer.cursorX;
    const line = buffer.getLine(cursorY);
    if (!line) return '';
    
    const fullLine = line.translateToString(true);
    const textBeforeCursor = fullLine.substring(0, cursorX);
    
    // Extract command after prompt
    const promptMatch = textBeforeCursor.match(/[$>#]\s+(.*)$/);
    if (promptMatch) {
      return promptMatch[1].trim();
    }
    
    return textBeforeCursor.trim();
  }, [terminalRef]);
  
  // Calculate menu position
  const calculateMenuPosition = useCallback((): { x: number; y: number } => {
    const terminal = terminalRef.current;
    if (!terminal) return { x: 0, y: 0 };
    
    const rect = (terminal as any).element?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    
    const cursorX = terminal.buffer.active.cursorX;
    const cursorY = terminal.buffer.active.cursorY;
    
    // Approximate character dimensions
    const charWidth = 9;
    const lineHeight = 18;
    
    const x = rect.left + cursorX * charWidth;
    const y = rect.top + (cursorY + 1) * lineHeight;
    
    return { x, y };
  }, [terminalRef]);
  
  const showMenu = useCallback(async () => {
    console.log('📋 showMenu called');
    const terminal = terminalRef.current;
    const engine = engineRef.current;
    
    if (!terminal) {
      console.log('❌ No terminal ref');
      return;
    }
    if (!engine) {
      console.log('❌ No engine ref');
      return;
    }
    
    const currentInput = getCurrentInput();
    currentInputRef.current = currentInput;
    trackedInputRef.current = currentInput; // Start tracking from this point
    trackingInputRef.current = true;
    console.log(`📝 Current input: "${currentInput}"`);
    
    if (!currentInput.trim()) {
      console.log('⚠️ Empty input, not showing menu');
      setMenuVisible(false);
      return;
    }
    
    const position = calculateMenuPosition();
    console.log(`📍 Menu position:`, position);
    setMenuPosition(position);
    setMenuVisible(true);
    setLoading(true);
    setSuggestions([]);
    setSelectedIndex(0);
    
    // Get suggestions
    try {
      const cwd = await invoke<string>('get_pty_cwd', { id: ptyId }).catch(() => '/');
      const history = await invoke<string[]>('get_shell_history').catch(() => []);
      
      const results = await engine.getMenuSuggestions(currentInput, {
        shell: 'bash', // TODO: Get from PTY info
        cwd,
        last_command: history[history.length - 1] || '',
        history,
      });
      
      setSuggestions(results);
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [terminalRef, ptyId, getCurrentInput, calculateMenuPosition]);
  
  const acceptSuggestion = useCallback((text: string) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    
    // Use the tracked input (what we knew when menu opened)
    const currentInput = trackedInputRef.current;
    console.log('✅ Accepting suggestion:', text);
    console.log('📝 Tracked input was:', currentInput);
    
    trackingInputRef.current = false;
    
    // Build the command to send: backspaces + new text
    let command = '';
    
    // Add backspaces to clear current input
    for (let i = 0; i < currentInput.length; i++) {
      command += '\x7f'; // Backspace
    }
    
    // Add the new text
    command += text;
    
    console.log('📤 Sending to PTY:', JSON.stringify(command));
    
    // Send as single operation to avoid race conditions
    invoke('write_to_pty', { id: ptyId, data: command }).catch(console.error);
    
    setMenuVisible(false);
  }, [terminalRef, ptyId]);
  
  const closeMenu = useCallback(() => {
    setMenuVisible(false);
    trackingInputRef.current = false;
  }, []);
  
  // Keyboard navigation - intercept at WINDOW level before xterm sees it
  useEffect(() => {
    if (!menuVisible || !enabled) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      
      console.log('🎹 Window keydown:', key, 'menu visible:', menuVisible);
      
      if (key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
        console.log('⬇️ Menu: Arrow Down');
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSelectedIndex(i => Math.max(i - 1, 0));
        console.log('⬆️ Menu: Arrow Up');
      } else if (key === 'Enter' || key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (suggestions[selectedIndex]) {
          acceptSuggestion(suggestions[selectedIndex].text);
        }
        console.log('✅ Menu: Accept');
      } else if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeMenu();
        console.log('❌ Menu: Close');
      }
    };
    
    // Listen at capture phase (before xterm)
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [menuVisible, enabled, suggestions, selectedIndex, acceptSuggestion, closeMenu]);
  
  // Ctrl+Space to open menu
  useEffect(() => {
    if (!enabled) {
      console.log('⚠️ Menu not enabled');
      return;
    }
    
    if (!terminalReady) {
      console.log('⚠️ Terminal not ready yet');
      return;
    }
    
    const terminal = terminalRef.current;
    if (!terminal) {
      console.log('⚠️ Terminal ref not populated yet');
      return;
    }
    
    console.log('🔧 Setting up Ctrl+Space listener on terminal');
    
    const disposer = terminal.onKey((event) => {
      const key = event.domEvent.key;
      const ctrl = event.domEvent.ctrlKey;
      
      // Debug log every key with Ctrl
      if (ctrl) {
        console.log(`🔑 Ctrl+${key} pressed`);
      }
      
      if (key === ' ' && ctrl) {
        console.log('🚀 Ctrl+Space detected! Opening menu...');
        event.domEvent.preventDefault();
        showMenu();
      }
    });
    
    return () => {
      console.log('🧹 Cleaning up Ctrl+Space listener');
      disposer.dispose();
    };
  }, [enabled, terminalReady, showMenu]);
  
  return {
    menuVisible,
    suggestions,
    selectedIndex,
    loading,
    menuPosition,
    acceptSuggestion,
    closeMenu,
  };
}
