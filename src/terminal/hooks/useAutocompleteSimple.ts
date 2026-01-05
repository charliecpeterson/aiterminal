/**
 * Router: Fish-style autocomplete with multiple sources
 * Supports: history-only, LLM-only, or hybrid
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { invoke } from '@tauri-apps/api/core';
import { SimpleAutocomplete, type DirEntry } from '../autocomplete/simple';
import { LLMInlineAutocomplete } from '../autocomplete/llm-inline';

export function useAutocompleteSimple(
  terminalRef: React.RefObject<XTermTerminal | null>,
  enabled: boolean,
  ptyId: number,
  source: 'history' | 'llm' | 'hybrid' = 'history',
  debounceMs: number = 300,
  terminalReady: boolean = false,
) {
  const historyEngineRef = useRef<SimpleAutocomplete | null>(null);
  const llmEngineRef = useRef<LLMInlineAutocomplete | null>(null);
  const onKeyDisposerRef = useRef<{ dispose: () => void } | null>(null);
  const pathCommandsRef = useRef<string[]>([]);
  const homeDirRef = useRef<string>('');
  const dirRequestRef = useRef<{ path: string; input: string } | null>(null);


  // Initialize engines based on source
  useEffect(() => {
    if (!enabled) return;

    // Init history engine (for history or hybrid)
    if ((source === 'history' || source === 'hybrid') && !historyEngineRef.current) {
      historyEngineRef.current = new SimpleAutocomplete();
    }

    // Init LLM engine (for llm or hybrid)
    if ((source === 'llm' || source === 'hybrid') && !llmEngineRef.current) {
      llmEngineRef.current = new LLMInlineAutocomplete();
      const modelPath = '~/.config/aiterminal/models/qwen3-1.7b-q4_k_m.gguf';
      llmEngineRef.current.initialize(modelPath).catch(console.error);
    }
  }, [enabled, source]);

  // Load history (for history and hybrid modes)
  useEffect(() => {
    if (!enabled || !historyEngineRef.current) return;

    const loadHistory = async () => {
      try {
        const history = await invoke<string[]>('get_shell_history');
        historyEngineRef.current?.updateHistory(history);
      } catch (error) {
        console.error('Failed to load shell history:', error);
      }
    };

    loadHistory();
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, [enabled, source]);

  // Load PATH commands and HOME directory (for history/hybrid)
  useEffect(() => {
    if (!enabled || !historyEngineRef.current) return;

    const loadPathCommands = async () => {
      try {
        const commands = await invoke<string[]>('get_path_commands');
        pathCommandsRef.current = commands;
        historyEngineRef.current?.setPathCommands(commands);
      } catch (error) {
        console.error('Failed to load PATH commands:', error);
      }
    };

    const loadHomeDir = async () => {
      try {
        const home = await invoke<string | null>('get_env_var_tool', { variable: 'HOME' });
        if (home) {
          homeDirRef.current = home;
          historyEngineRef.current?.setHomeDir(home);
        }
      } catch (error) {
        console.error('Failed to load HOME:', error);
      }
    };

    loadPathCommands();
    loadHomeDir();
  }, [enabled, source]);

  // Track CWD for deterministic file completion
  useEffect(() => {
    if (!enabled || !historyEngineRef.current) return;

    const getCwd = async () => {
      try {
        const cwd = await invoke<string>('get_pty_cwd', { id: ptyId });
        historyEngineRef.current?.setCwd(cwd);
      } catch (error) {
        historyEngineRef.current?.setCwd('/');
      }
    };

    getCwd();
    const interval = setInterval(getCwd, 5000);
    return () => clearInterval(interval);
  }, [enabled, ptyId, source]);

  const refreshDirEntries = useCallback((engine: SimpleAutocomplete, terminal: XTermTerminal) => {
    const { dirPath, prefix, showHidden } = engine.getFileCompletionContext();
    if (!dirPath || !prefix) {
      return;
    }

    if (dirRequestRef.current?.path === dirPath && dirRequestRef.current?.input === engine.getCurrentInput()) {
      return;
    }

    dirRequestRef.current = { path: dirPath, input: engine.getCurrentInput() };

    invoke<DirEntry[]>('list_dir_entries', { path: dirPath, showHidden })
      .then((entries) => {
        if (dirRequestRef.current?.input !== engine.getCurrentInput()) {
          return;
        }
        engine.setDirEntries(dirPath, entries);
        engine.refreshSuggestion();
        engine.clearRender(terminal);
        engine.render(terminal);
      })
      .catch((error) => {
        console.error('Failed to list directory entries:', error);
      });
  }, []);

  // Get CWD for LLM context
  useEffect(() => {
    if (!enabled || source === 'history') return;

    const getCwd = async () => {
      try {
        const cwd = await invoke<string>('get_pty_cwd', { id: ptyId });
        cwdRef.current = cwd;
      } catch (error) {
        cwdRef.current = '/';
      }
    };

    getCwd();
    const interval = setInterval(getCwd, 5000);
    return () => clearInterval(interval);
  }, [enabled, source, ptyId]);

  // Handle keyboard events
  useEffect(() => {
    const terminal = terminalRef.current;
    
    if (!enabled || !terminal || !terminalReady) {
      onKeyDisposerRef.current?.dispose();
      onKeyDisposerRef.current = null;
      return;
    }

    // Dispose previous listener
    onKeyDisposerRef.current?.dispose();

    const disposer = terminal.onKey((event) => {
      const key = event.domEvent.key;
      const historyEngine = historyEngineRef.current;
      const llmEngine = llmEngineRef.current;

      // Route to appropriate handler based on source
      if (historyEngine) {
        handleHistoryKey(event, key, terminal, historyEngine, ptyId, refreshDirEntries);
      }

      if (source === 'llm' && llmEngine) {
        const currentInput = historyEngine?.getCurrentInput() ?? '';
        const trimmed = currentInput.trimEnd();
        const tokens = trimmed.split(/\s+/).filter(Boolean);
        const lastToken = tokens[tokens.length - 1] ?? '';
        const allowLLM = tokens.length >= 2 && lastToken.length >= 2;
        if (allowLLM) {
          handleLLMKey(event, key, terminal, llmEngine, ptyId, debounceMs);
        }
      } else if (source === 'hybrid') {
        if (historyEngine) {
          handleHistoryKey(event, key, terminal, historyEngine, ptyId, refreshDirEntries);
        }
      }
    });

    onKeyDisposerRef.current = disposer;

    return () => {
      onKeyDisposerRef.current?.dispose();
      onKeyDisposerRef.current = null;
    };
  }, [enabled, terminalRef, ptyId, source, terminalReady, debounceMs]);
}

// History mode (current working behavior)
function handleHistoryKey(
  event: any,
  key: string,
  terminal: XTermTerminal,
  engine: SimpleAutocomplete,
  ptyId: number,
  refreshDirEntries: (engine: SimpleAutocomplete, terminal: XTermTerminal) => void
) {
  const scheduleRenderAfterCursorMove = () => {
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => window.setTimeout(cb, 16);
    const startX = terminal.buffer.active.cursorX;
    const startY = terminal.buffer.active.cursorY;
    let attempts = 0;

    const tryRender = () => {
      const { cursorX, cursorY } = terminal.buffer.active;
      const moved = cursorX !== startX || cursorY !== startY;

      if (moved || attempts >= 5) {
        engine.render(terminal);
        return;
      }

      attempts += 1;
      raf(tryRender);
    };

    raf(tryRender);
  };

  if (key === 'ArrowRight') {
    const toInsert = engine.acceptSuggestion();
    if (toInsert) {
      engine.clearRender(terminal);
      invoke('write_to_pty', { id: ptyId, data: toInsert }).catch(console.error);
      event.domEvent.preventDefault();
      event.domEvent.stopPropagation();
      return;
    }
  }

  if (key === 'Enter') {
    engine.clearRender(terminal);
    engine.onEnter();
    return;
  }

  if (key === 'Backspace') {
    engine.clearRender(terminal);
    engine.onBackspace();
    scheduleRenderAfterCursorMove();
    refreshDirEntries(engine, terminal);
    return;
  }

  // Regular character
  if (key.length === 1 && !event.domEvent.ctrlKey && !event.domEvent.altKey) {
    engine.clearRender(terminal);
    engine.onChar(key);
    // Defer render until the terminal cursor advances.
    scheduleRenderAfterCursorMove();
    refreshDirEntries(engine, terminal);
  }
}

// LLM mode (smart AI-powered completion with debouncing)
function handleLLMKey(
  event: any,
  key: string,
  terminal: XTermTerminal,
  engine: LLMInlineAutocomplete,
  ptyId: number,
  debounceMs: number
) {
  if (key === 'ArrowRight') {
    const toInsert = engine.acceptSuggestion();
    if (toInsert) {
      engine.clearRender(terminal);
      invoke('write_to_pty', { id: ptyId, data: toInsert }).catch(console.error);
      event.domEvent.preventDefault();
      event.domEvent.stopPropagation();
      return;
    }
  }

  if (key === 'Enter') {
    engine.clearRender(terminal);
    engine.onEnter();
    return;
  }

  if (key === 'Backspace') {
    engine.clearRender(terminal);
    engine.onBackspace();
    
    // Show cached suggestion immediately if available
    const currentInput = engine.getCurrentInput();
    const cached = engine.getCachedSuggestion(currentInput);
    if (cached) {
      engine.render(terminal, cached);
    }
    
    // Debounced LLM query for new suggestion
    if (currentInput.length > 0) {
      clearTimeout(debounceTimerRef.current!);
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const context = {
            shell: 'bash',
            cwd: cwdRef.current || '/',
          };
          const suggestion = await engine.getSuggestionAsync(currentInput, context, 0);
          if (suggestion && currentInput === engine.getCurrentInput()) {
            engine.clearRender(terminal);
            engine.render(terminal, suggestion);
          }
        } catch (error) {
          console.error('[LLM inline] Query failed:', error);
        }
      }, debounceMs);
    }
    return;
  }

  // Regular character
  if (key.length === 1 && !event.domEvent.ctrlKey && !event.domEvent.altKey) {
    // Clear any existing gray suggestion
    engine.clearRender(terminal);
    
    // Update input state
    engine.onChar(key);
    const currentInput = engine.getCurrentInput();
    
    // Wait for terminal to process the character before rendering gray text
    // This ensures cursor position is updated
    setTimeout(() => {
      // Show cached suggestion immediately if available
      const cached = engine.getCachedSuggestion(currentInput);
      if (cached) {
        engine.render(terminal, cached);
      }
    }, 0);
    
    // Debounced LLM query for new/updated suggestion
    clearTimeout(debounceTimerRef.current!);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const context = {
          shell: 'bash',
          cwd: cwdRef.current || '/',
        };
        const suggestion = await engine.getSuggestionAsync(currentInput, context, 0);
        
        // Only render if input hasn't changed
        if (suggestion && currentInput === engine.getCurrentInput()) {
          engine.clearRender(terminal);
          engine.render(terminal, suggestion);
        }
      } catch (error) {
        console.error('[LLM inline] Query failed:', error);
      }
    }, debounceMs);
  }
}

// Refs for LLM mode state (module-level to persist across renders)
let debounceTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
let cwdRef: { current: string } = { current: '/' };
