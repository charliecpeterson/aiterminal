# LLM-Powered Autocomplete Dropdown Design

## Overview
Add intelligent command completion using a local LLM (Qwen3-0.6B GGUF) triggered by Ctrl+Space.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ User types: git co█                             │
│ Presses: Ctrl+Space                             │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Frontend (TypeScript)                           │
│ ├─ Capture context (CWD, history, partial cmd) │
│ ├─ Show loading spinner in menu                │
│ └─ Call Tauri command: get_llm_completions()   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Backend (Rust + llama.cpp)                      │
│ ├─ Build prompt with context                   │
│ ├─ Query llama-server HTTP API                 │
│ ├─ Parse/filter suggestions                    │
│ └─ Return array of completions                 │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Dropdown Menu UI                                │
│ ┌─────────────────────────────────────────┐   │
│ │ > git checkout main            [LLM]    │   │
│ │   git commit -m "..."          [LLM]    │   │
│ │   git status                   [hist]   │   │
│ └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## UX Flow

### Trigger
- **Ctrl+Space**: Open menu at cursor position
- **Auto-trigger**: Optional - after typing 3+ chars (configurable)

### Menu States
1. **Loading**: Show spinner, display history matches immediately
2. **LLM Results**: Merge with history, show source badge [LLM] / [hist]
3. **Empty**: "No suggestions" message
4. **Error**: Fallback to history-only, show subtle warning

### Navigation
- **Up/Down**: Select suggestion
- **Enter/Tab**: Accept selected
- **Esc**: Close menu
- **→**: Accept + close (same as current inline)
- **Continue typing**: Filter results in real-time

### Menu Position
- Below cursor (like VSCode)
- Max height: 10 items
- Scroll if more
- Position above if not enough space below

## Backend Design

### Model Setup

**1. Model Selection**
- Use Qwen3-0.6B Q4_K_M GGUF (~350MB)
- Download from: `rippertnt/Qwen3-0.6B-Q4_K_M-GGUF`
- Store in: `~/.config/aiterminal/models/qwen3-0.6b.gguf`

**2. Runtime: llama.cpp Server**
```bash
# Start server at app launch
llama-server \
  --model ~/.config/aiterminal/models/qwen3-0.6b.gguf \
  --port 8765 \
  --threads 4 \
  --ctx-size 2048 \
  --n-predict 20 \
  --temp 0.3 \
  --top-k 40 \
  --top-p 0.9
```

**3. Rust Integration**

```rust
// src-tauri/src/llm.rs

use reqwest;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct CompletionRequest {
    prompt: String,
    max_tokens: u32,
    temperature: f32,
    stop: Vec<String>,
}

#[derive(Deserialize)]
struct CompletionResponse {
    content: String,
    tokens_evaluated: u32,
}

pub struct LLMEngine {
    client: reqwest::Client,
    server_url: String,
    enabled: bool,
}

impl LLMEngine {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
            server_url: "http://localhost:8765".to_string(),
            enabled: false,
        }
    }
    
    pub async fn start_server(&mut self, model_path: String) -> Result<(), String> {
        // Spawn llama-server as child process
        // Store PID for cleanup
        // Wait for health check
        Ok(())
    }
    
    pub async fn complete(&self, context: CompletionContext) -> Result<Vec<String>, String> {
        let prompt = self.build_prompt(context);
        
        let request = CompletionRequest {
            prompt,
            max_tokens: 50,
            temperature: 0.3,
            stop: vec!["\n".to_string(), "###".to_string()],
        };
        
        let response = self.client
            .post(format!("{}/completion", self.server_url))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("LLM request failed: {}", e))?;
            
        let result: CompletionResponse = response.json().await
            .map_err(|e| format!("Parse failed: {}", e))?;
            
        // Parse result into multiple suggestions
        self.parse_suggestions(result.content)
    }
    
    fn build_prompt(&self, context: CompletionContext) -> String {
        format!(
            "### Terminal Command Completion\n\
             Shell: {}\n\
             Directory: {}\n\
             Last command: {}\n\
             User is typing: {}\n\n\
             ### Suggest 3 command completions:\n",
            context.shell,
            context.cwd,
            context.last_command,
            context.partial_input
        )
    }
    
    fn parse_suggestions(&self, text: String) -> Result<Vec<String>, String> {
        // Parse LLM output
        // Each line is a suggestion
        // Remove numbering (1., 2., etc)
        // Filter invalid commands
        Ok(text.lines()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.trim_start_matches(|c: char| c.is_numeric() || c == '.' || c == ' '))
            .take(5)
            .map(String::from)
            .collect())
    }
}

#[derive(Serialize, Deserialize)]
pub struct CompletionContext {
    pub shell: String,
    pub cwd: String,
    pub last_command: String,
    pub partial_input: String,
    pub shell_history: Vec<String>,
}

#[tauri::command]
pub async fn get_llm_completions(
    context: CompletionContext,
    state: tauri::State<'_, LLMEngine>
) -> Result<Vec<String>, String> {
    if !state.enabled {
        return Err("LLM not enabled".to_string());
    }
    
    state.complete(context).await
}

#[tauri::command]
pub async fn init_llm(
    model_path: String,
    state: tauri::State<'_, LLMEngine>
) -> Result<(), String> {
    state.start_server(model_path).await
}
```

### Tauri Setup

```rust
// src-tauri/src/lib.rs

mod llm;

use llm::LLMEngine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LLMEngine::new())
        .invoke_handler(tauri::generate_handler![
            // ... existing handlers
            llm::init_llm,
            llm::get_llm_completions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Frontend Design

### New Files

**1. LLM Autocomplete Engine**
```typescript
// src/terminal/autocomplete/llm.ts

import { invoke } from '@tauri-apps/api/core';

export interface CompletionContext {
  shell: string;
  cwd: string;
  lastCommand: string;
  partialInput: string;
  shellHistory: string[];
}

export interface Suggestion {
  text: string;
  source: 'llm' | 'history';
  confidence?: number;
}

export class LLMAutocomplete {
  private enabled: boolean = false;
  
  async initialize(modelPath: string): Promise<void> {
    try {
      await invoke('init_llm', { modelPath });
      this.enabled = true;
    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      this.enabled = false;
    }
  }
  
  async getSuggestions(context: CompletionContext): Promise<Suggestion[]> {
    if (!this.enabled) {
      return [];
    }
    
    try {
      const completions = await invoke<string[]>('get_llm_completions', { context });
      return completions.map(text => ({
        text,
        source: 'llm',
      }));
    } catch (error) {
      console.error('LLM completion failed:', error);
      return [];
    }
  }
}
```

**2. Hybrid Autocomplete Engine**
```typescript
// src/terminal/autocomplete/hybrid.ts

import { SimpleAutocomplete } from './simple';
import { LLMAutocomplete, type Suggestion } from './llm';

export class HybridAutocomplete {
  private history: SimpleAutocomplete;
  private llm: LLMAutocomplete;
  
  constructor() {
    this.history = new SimpleAutocomplete();
    this.llm = new LLMAutocomplete();
  }
  
  async initLLM(modelPath: string): Promise<void> {
    await this.llm.initialize(modelPath);
  }
  
  async getMenuSuggestions(
    currentInput: string,
    context: {
      shell: string;
      cwd: string;
      lastCommand: string;
      history: string[];
    }
  ): Promise<Suggestion[]> {
    // Get history suggestions (instant)
    const historyMatches = this.history.getMatches(currentInput, 5);
    const historySuggestions: Suggestion[] = historyMatches.map(text => ({
      text,
      source: 'history',
    }));
    
    // Get LLM suggestions (parallel, with timeout)
    let llmSuggestions: Suggestion[] = [];
    try {
      const llmPromise = this.llm.getSuggestions({
        shell: context.shell,
        cwd: context.cwd,
        lastCommand: context.lastCommand,
        partialInput: currentInput,
        shellHistory: context.history.slice(-10), // Last 10 commands
      });
      
      // Timeout after 500ms
      const timeoutPromise = new Promise<Suggestion[]>((resolve) => {
        setTimeout(() => resolve([]), 500);
      });
      
      llmSuggestions = await Promise.race([llmPromise, timeoutPromise]);
    } catch (error) {
      console.warn('LLM suggestions failed:', error);
    }
    
    // Merge and deduplicate
    return this.mergeSuggestions(historySuggestions, llmSuggestions);
  }
  
  private mergeSuggestions(
    history: Suggestion[],
    llm: Suggestion[]
  ): Suggestion[] {
    const seen = new Set<string>();
    const merged: Suggestion[] = [];
    
    // Add LLM first (higher quality)
    for (const suggestion of llm) {
      if (!seen.has(suggestion.text)) {
        seen.add(suggestion.text);
        merged.push(suggestion);
      }
    }
    
    // Add history (fallback)
    for (const suggestion of history) {
      if (!seen.has(suggestion.text) && merged.length < 10) {
        seen.add(suggestion.text);
        merged.push(suggestion);
      }
    }
    
    return merged;
  }
}
```

**3. Dropdown Menu Component**
```typescript
// src/components/AutocompleteMenu.tsx

import { useEffect, useState, useRef } from 'react';
import type { Suggestion } from '../terminal/autocomplete/llm';
import './AutocompleteMenu.css';

interface Props {
  suggestions: Suggestion[];
  selectedIndex: number;
  position: { x: number; y: number };
  onSelect: (suggestion: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export function AutocompleteMenu({
  suggestions,
  selectedIndex,
  position,
  onSelect,
  onClose,
  loading = false,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Keyboard navigation
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);
  
  return (
    <div
      ref={menuRef}
      className="autocomplete-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {loading && (
        <div className="menu-item loading">
          <span className="spinner">⟳</span> Loading suggestions...
        </div>
      )}
      
      {!loading && suggestions.length === 0 && (
        <div className="menu-item empty">No suggestions</div>
      )}
      
      {suggestions.map((suggestion, index) => (
        <div
          key={index}
          className={`menu-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(suggestion.text)}
        >
          <span className="command">{suggestion.text}</span>
          <span className={`badge badge-${suggestion.source}`}>
            {suggestion.source === 'llm' ? '✨ AI' : '📚'}
          </span>
        </div>
      ))}
    </div>
  );
}
```

**4. Menu Styles**
```css
/* src/components/AutocompleteMenu.css */

.autocomplete-menu {
  position: fixed;
  background: var(--background-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  min-width: 300px;
  max-width: 500px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
  font-family: var(--font-mono);
  font-size: 13px;
}

.menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.menu-item:hover,
.menu-item.selected {
  background: var(--selection-background);
}

.menu-item .command {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-item .badge {
  margin-left: 12px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

.badge-llm {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.badge-history {
  background: var(--background-tertiary);
  color: var(--text-secondary);
}

.menu-item.loading,
.menu-item.empty {
  color: var(--text-secondary);
  font-style: italic;
  justify-content: center;
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

### Integration Hook

```typescript
// src/terminal/useAutocompleteMenu.ts

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { HybridAutocomplete } from './autocomplete/hybrid';
import type { Suggestion } from './autocomplete/llm';

export function useAutocompleteMenu(
  terminalRef: React.RefObject<XTermTerminal | null>,
  enabled: boolean,
  ptyId: number,
) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  
  const engineRef = useRef<HybridAutocomplete | null>(null);
  
  // Initialize
  useEffect(() => {
    if (enabled && !engineRef.current) {
      engineRef.current = new HybridAutocomplete();
      // TODO: Get model path from settings
      // engineRef.current.initLLM(modelPath);
    }
  }, [enabled]);
  
  const showMenu = useCallback(async (currentInput: string) => {
    const terminal = terminalRef.current;
    const engine = engineRef.current;
    if (!terminal || !engine) return;
    
    // Calculate menu position
    const cursorX = terminal.buffer.active.cursorX;
    const cursorY = terminal.buffer.active.cursorY;
    // TODO: Convert terminal coordinates to screen pixels
    
    setMenuVisible(true);
    setLoading(true);
    setSuggestions([]);
    setSelectedIndex(0);
    
    // Get suggestions
    const results = await engine.getMenuSuggestions(currentInput, {
      shell: 'bash', // TODO: Get from PTY info
      cwd: '/path', // TODO: Get from PTY
      lastCommand: '', // TODO: Track last command
      history: [], // TODO: Pass history
    });
    
    setSuggestions(results);
    setLoading(false);
  }, [terminalRef]);
  
  const acceptSuggestion = useCallback((text: string) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    
    // Send to PTY
    invoke('write_to_pty', { id: ptyId, data: text }).catch(console.error);
    
    setMenuVisible(false);
  }, [terminalRef, ptyId]);
  
  // Keyboard handler
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!enabled || !terminal) return;
    
    const disposer = terminal.onKey((event) => {
      // Ctrl+Space: Open menu
      if (event.domEvent.key === ' ' && event.domEvent.ctrlKey) {
        event.domEvent.preventDefault();
        // TODO: Get current input
        showMenu('current input here');
        return;
      }
      
      // Handle menu navigation when visible
      if (menuVisible) {
        if (event.domEvent.key === 'ArrowDown') {
          event.domEvent.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
        } else if (event.domEvent.key === 'ArrowUp') {
          event.domEvent.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (event.domEvent.key === 'Enter') {
          event.domEvent.preventDefault();
          if (suggestions[selectedIndex]) {
            acceptSuggestion(suggestions[selectedIndex].text);
          }
        } else if (event.domEvent.key === 'Escape') {
          event.domEvent.preventDefault();
          setMenuVisible(false);
        }
      }
    });
    
    return () => disposer.dispose();
  }, [enabled, menuVisible, suggestions, selectedIndex, terminalRef, showMenu, acceptSuggestion]);
  
  return {
    menuVisible,
    suggestions,
    selectedIndex,
    loading,
    menuPosition,
    acceptSuggestion,
    closeMenu: () => setMenuVisible(false),
  };
}
```

## Settings Integration

```typescript
// src/context/SettingsContext.tsx - Add to settings type

interface Settings {
  // ... existing
  autocomplete: {
    enable_inline: boolean;
    enable_llm: boolean;
    llm_model_path: string;
    llm_temperature: number;
    llm_max_suggestions: number;
  };
}
```

## Implementation Phases

### Phase 1: Backend Setup (Week 1)
- [ ] Download/bundle llama.cpp binary
- [ ] Add llm.rs module
- [ ] Implement llama-server process management
- [ ] Test basic completion requests
- [ ] Add health check endpoint

### Phase 2: Frontend Menu (Week 1-2)
- [ ] Create AutocompleteMenu component
- [ ] Add CSS styling with animations
- [ ] Implement keyboard navigation
- [ ] Test menu positioning logic
- [ ] Add loading states

### Phase 3: LLM Integration (Week 2)
- [ ] Create LLM autocomplete engine
- [ ] Build hybrid engine (history + LLM)
- [ ] Implement deduplication logic
- [ ] Add timeout/fallback handling
- [ ] Context gathering from PTY

### Phase 4: Settings & Model (Week 3)
- [ ] Add LLM settings to UI
- [ ] Model download/management UI
- [ ] Model path configuration
- [ ] Enable/disable toggle
- [ ] Performance tuning (threads, temp, etc)

### Phase 5: Polish (Week 3-4)
- [ ] Error handling and fallbacks
- [ ] Prompt engineering improvements
- [ ] Cache suggestions
- [ ] Metrics/analytics
- [ ] Documentation

## Testing Strategy

### Unit Tests
- Prompt building logic
- Suggestion parsing/filtering
- Deduplication algorithm

### Integration Tests
- llama-server lifecycle
- Timeout handling
- Fallback to history

### Performance Tests
- Latency measurements
- Memory usage
- Model loading time
- Concurrent requests

## Deployment Considerations

### Model Distribution
**Option 1**: Download on first launch
- Pros: Smaller binary
- Cons: Requires internet

**Option 2**: Bundle with app
- Pros: Works offline
- Cons: +350MB binary size

**Recommendation**: Download on first launch, cache in user config directory

### Binary Distribution
- Include llama-server binary per platform (macOS/Linux/Windows)
- Platform-specific compilation in CI
- Fallback to history-only if binary missing

## Performance Targets

| Metric | Target | Fallback |
|--------|--------|----------|
| First token latency | < 200ms | < 500ms |
| Full completion | < 300ms | < 800ms |
| Memory overhead | < 600MB | N/A |
| Model load time | < 2s | N/A |

## Future Enhancements

- Multi-line command suggestions
- Context from recent terminal output
- Learn from accepted vs rejected suggestions
- Project-specific fine-tuning
- Multiple model support (code-specific, DevOps-specific)

---

## Open Questions

1. Should we bundle llama.cpp or require user installation?
2. Model download flow - automatic or manual?
3. Prompt template - hardcoded or user-customizable?
4. Telemetry - track suggestion acceptance rates?
5. Multi-model support from day 1?
