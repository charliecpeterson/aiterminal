/**
 * Router: Fish-style autocomplete with multiple sources
 * Supports: history-only, LLM-only, or hybrid
 */

import { useEffect, useRef } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { invoke } from '@tauri-apps/api/core';
import { SimpleAutocomplete } from '../autocomplete/simple';
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


  console.log('🎯 Autocomplete inline source:', source);

  // Initialize engines based on source
  useEffect(() => {
    if (!enabled) return;

    // Init history engine (for history or hybrid)
    if ((source === 'history' || source === 'hybrid') && !historyEngineRef.current) {
      historyEngineRef.current = new SimpleAutocomplete();
      console.log('📚 History engine initialized');
    }

    // Init LLM engine (for llm or hybrid)
    if ((source === 'llm' || source === 'hybrid') && !llmEngineRef.current) {
      llmEngineRef.current = new LLMInlineAutocomplete();
      const modelPath = '~/.config/aiterminal/models/qwen3-1.7b-q4_k_m.gguf';
      llmEngineRef.current.initialize(modelPath).catch(console.error);
      console.log('🤖 LLM inline engine initializing...');
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
    
    console.log(`[useEffect keyboard] enabled=${enabled} terminal=${!!terminal} terminalReady=${terminalReady} source=${source}`);
    
    if (!enabled || !terminal || !terminalReady) {
      console.log('[useEffect keyboard] Skipping - not ready');
      onKeyDisposerRef.current?.dispose();
      onKeyDisposerRef.current = null;
      return;
    }

    console.log('[useEffect keyboard] Attaching keyboard handler');

    // Dispose previous listener
    onKeyDisposerRef.current?.dispose();

    const disposer = terminal.onKey((event) => {
      const key = event.domEvent.key;
      const historyEngine = historyEngineRef.current;
      const llmEngine = llmEngineRef.current;

      console.log(`[Router] key="${key}" source="${source}" llmEngine=${!!llmEngine} historyEngine=${!!historyEngine}`);

      // Route to appropriate handler based on source
      if (source === 'history' && historyEngine) {
        handleHistoryKey(event, key, terminal, historyEngine, ptyId);
      } else if (source === 'llm' && llmEngine) {
        console.log('[Router] Routing to LLM handler');
        handleLLMKey(event, key, terminal, llmEngine, ptyId, debounceMs);
      } else if (source === 'hybrid') {
        // TODO: Hybrid mode (history instant + LLM upgrade)
        if (historyEngine) {
          handleHistoryKey(event, key, terminal, historyEngine, ptyId);
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
  ptyId: number
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
    engine.render(terminal);
    return;
  }

  // Regular character
  if (key.length === 1 && !event.domEvent.ctrlKey && !event.domEvent.altKey) {
    engine.clearRender(terminal);
    engine.onChar(key);
    engine.render(terminal);
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
    
    // Show cached suggestion immediately if available
    const cached = engine.getCachedSuggestion(currentInput);
    if (cached) {
      engine.render(terminal, cached);
    }
    
    // Debounced LLM query for new/updated suggestion
    clearTimeout(debounceTimerRef.current!);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const context = {
          shell: 'bash',
          cwd: cwdRef.current || '/',
        };
        const startTime = performance.now();
        const suggestion = await engine.getSuggestionAsync(currentInput, context, 0);
        const elapsed = performance.now() - startTime;
        
        console.log(`[LLM inline] Latency: ${elapsed.toFixed(0)}ms for "${currentInput}" → "${suggestion}"`);
        
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
