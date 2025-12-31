# Output Folding Design

## Quick Answer: Streaming Behavior

**Q: What happens as a very long command is running?**
- ✅ Output displays normally - **no folding during streaming**
- ✅ User can watch output in real-time
- ✅ Folding only happens **after** command completes (OSC 133;D)

**Q: Will the window update when opened during streaming?**
- ✅ **Yes!** If you open "View in Window" while output is streaming:
  - Shows current output immediately
  - Updates every 500ms with new lines
  - Auto-scrolls to bottom (can disable)
  - Shows "● LIVE" indicator
  - Marks "✓ Complete" when command finishes

---

## Problem Statement

When commands produce large outputs (hundreds or thousands of lines), the terminal becomes difficult to navigate:
- Excessive scrolling to reach previous commands
- Terminal buffer fills quickly
- Difficult to maintain context
- Can't easily see command history

## Goals

1. Automatically collapse/fold large command outputs
2. Provide clear visual indicators for folded content
3. Allow easy expansion when needed
4. Handle streaming output gracefully
5. Optionally view large output in separate window
6. Maintain performance even with large outputs

## Architecture Overview

### Leveraging Existing Infrastructure

We already have:
- **Shell Integration (OSC 133)**: Tracks command start (A), output start (C), and command end (D)
- **Marker System**: Visual decorations at command boundaries with metadata
- **Command/Output Range Detection**: Can identify exact line ranges for commands and their outputs

### Proposed Solution

Use **CSS-based visual folding** with xterm.js decorations rather than actually removing lines from the terminal buffer.

## Design Options Comparison

### Option 1: CSS-Based Visual Folding (RECOMMENDED)

**How it works:**
- After command completes (OSC 133;D), count output lines
- If lines > threshold, add a "fold decoration" overlay
- Use CSS to visually hide the output lines
- Show a collapsible indicator with summary info

**Pros:**
- No buffer manipulation - content stays intact
- Can copy/search through folded content
- Simple to implement
- Reversible without data loss
- Works with existing marker system

**Cons:**
- Lines still consume buffer space
- Need careful CSS to avoid visual glitches

### Option 2: Buffer Truncation with Cache

**How it works:**
- Store large outputs in memory/IndexedDB
- Remove lines from terminal buffer
- Insert placeholder line
- Restore lines when expanded

**Pros:**
- Reduces buffer usage
- Better scrollback performance

**Cons:**
- Complex state management
- Can't search through folded content
- Risk of data loss
- Harder to maintain buffer consistency
- Links and selections break

### Option 3: Separate Output Pane (Supplemental)

**How it works:**
- Detect large output
- Show notification: "Large output detected (1234 lines)"
- Offer button to open in separate window
- Window shows formatted output with search/export

**Pros:**
- Best for reviewing large outputs
- Can add extra features (syntax highlighting, export, search)
- Doesn't clutter terminal

**Cons:**
- Requires extra UI work
- Not automatic
- User has to interact

## Recommended Implementation: Hybrid Approach

Combine Option 1 (CSS folding) with Option 3 (separate window):

1. **Auto-fold large outputs** (>50 lines by default)
2. **Show fold indicator** with expand/collapse
3. **Offer "View in Window"** button for very large outputs (>500 lines)

## Detailed Design

### 1. Fold Detection

When OSC 133;D (command finished) is received:

```typescript
interface FoldState {
  marker: IDecoration;
  startLine: number;
  endLine: number;
  lineCount: number;
  folded: boolean;
  previewLines: string[]; // First few lines
}

// In markers.ts OSC 133;D handler:
if (type === 'D') {
  // ... existing code ...
  
  const outputLineCount = endLine - safeOutputStart + 1;
  
  if (outputLineCount > foldThreshold) {
    createFoldDecoration({
      marker: currentMarker,
      startLine: safeOutputStart,
      endLine,
      lineCount: outputLineCount,
    });
  }
}
```

### 2. Fold Decoration

Create a decoration that overlays the output area:

```typescript
interface FoldDecorationOptions {
  marker: IDecoration;
  startLine: number;
  endLine: number;
  lineCount: number;
}

function createFoldDecoration(opts: FoldDecorationOptions) {
  const foldMarker = term.registerMarker(opts.startLine - term.buffer.active.baseY);
  
  if (!foldMarker) return;
  
  const decoration = term.registerDecoration({
    marker: foldMarker,
    x: 0,
    width: term.cols,
    height: opts.lineCount,
    layer: 'top', // Render above text
  });
  
  if (decoration) {
    decoration.onRender((element) => {
      element.className = 'fold-overlay';
      element.innerHTML = `
        <div class="fold-summary">
          <button class="fold-toggle">▶</button>
          <span class="fold-info">
            ${opts.lineCount} lines hidden
          </span>
          <button class="fold-view-window">View in Window</button>
        </div>
      `;
      
      // Add click handlers
      element.querySelector('.fold-toggle')?.addEventListener('click', () => {
        toggleFold(decoration, opts);
      });
      
      element.querySelector('.fold-view-window')?.addEventListener('click', () => {
        openOutputWindow(opts);
      });
    });
  }
  
  return decoration;
}
```

### 3. CSS Styling

```css
.fold-overlay {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  backdrop-filter: blur(2px);
  pointer-events: auto;
}

.fold-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-family: -apple-system, system-ui;
  font-size: 12px;
  color: #888;
}

.fold-toggle {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  transition: transform 0.2s;
}

.fold-toggle.expanded {
  transform: rotate(90deg);
}

.fold-view-window {
  margin-left: auto;
  padding: 4px 8px;
  background: rgba(91, 141, 232, 0.2);
  border: 1px solid rgba(91, 141, 232, 0.4);
  border-radius: 3px;
  color: #7aa3f0;
  cursor: pointer;
  font-size: 11px;
}

.fold-view-window:hover {
  background: rgba(91, 141, 232, 0.3);
}
```

### 4. Toggle Fold

```typescript
function toggleFold(decoration: IDecoration, opts: FoldDecorationOptions) {
  const element = decoration.element;
  if (!element) return;
  
  const toggle = element.querySelector('.fold-toggle');
  const isExpanded = toggle?.classList.contains('expanded');
  
  if (isExpanded) {
    // Collapse
    toggle?.classList.remove('expanded');
    element.style.height = 'auto';
    // Could hide actual terminal lines with CSS
  } else {
    // Expand
    toggle?.classList.add('expanded');
    element.style.height = '0'; // Let terminal content show through
  }
}
```

### 5. Separate Output Window

```typescript
interface OutputWindowOptions {
  startLine: number;
  endLine: number;
  lineCount: number;
  content: string;
}

async function openOutputWindow(opts: FoldDecorationOptions) {
  const content = getRangeText([opts.startLine, opts.endLine]);
  
  const outputWindow = new WebviewWindow(`output-${Date.now()}`, {
    title: `Output (${opts.lineCount} lines)`,
    width: 800,
    height: 600,
    resizable: true,
    url: `/#/output-viewer`,
  });
  
  outputWindow.once('tauri://created', () => {
    // Send content to window
    emitTo(outputWindow.label, 'output-content', {
      content,
      lineCount: opts.lineCount,
    });
  });
}
```

## Handling Streaming Output

Challenge: Output is still being written when we need to decide about folding.

### Behavior During Streaming

**While Command Is Running (Before OSC 133;D):**
- ✅ **Output displays normally** - no folding happens
- ✅ **User can watch output** in real-time
- ✅ **User can scroll** and interact normally
- ✅ **Line counter tracks** current output length (for post-completion folding)

**Why Not Fold During Streaming?**
1. Don't know final line count yet
2. User might be actively watching output (e.g., build process, download)
3. Folding mid-stream would be jarring and disorienting
4. Shell integration signals completion with OSC 133;D - that's our cue

### Solution: Delayed Folding

1. **Don't fold until command completes** (OSC 133;D received)
2. **Track line count during streaming** to prepare for folding
3. **Apply fold decoration** only after command finishes

```typescript
// In OSC 133;C (output start) handler:
if (type === 'C') {
  // Mark output start
  const meta = markerMeta.get(currentMarker) || {};
  meta.outputStartMarker = term.registerMarker(0);
  meta.streamingOutput = true; // Flag that output is streaming
  markerMeta.set(currentMarker, meta);
}

// In OSC 133;D (command end) handler:
if (type === 'D') {
  const meta = markerMeta.get(currentMarker);
  if (meta?.streamingOutput) {
    meta.streamingOutput = false;
    
    // Now we can safely measure and fold
    const outputLineCount = endLine - outputStartLine + 1;
    if (outputLineCount > foldThreshold) {
      // Small delay to ensure rendering is complete
      setTimeout(() => {
        createFoldDecoration({...});
      }, 100);
    }
  }
}
```

### Visual Timeline: Streaming Command Behavior

```
Time: 0s ─────────────────────────────────────────────────────
$ npm install                    ← Command starts (OSC 133;A)
                                 ← Output starts (OSC 133;C)
                                   ✓ Marker created
                                   ✓ Streaming flag = true
                                   ✗ NO folding yet

Time: 1s ─────────────────────────────────────────────────────
$ npm install
added package-1@1.0.0            ← Output streaming...
added package-2@2.0.0            ← Still streaming...
added package-3@3.0.0            ← 50+ lines...
[... many more lines ...]        ← 100+ lines...
                                   ✓ User can watch in real-time
                                   ✓ Can open "View in Window" → opens LIVE window
                                   ✗ Still NO folding

Time: 45s ────────────────────────────────────────────────────
$ npm install
[... 1,234 lines of output ...]
                                 ← Command completes (OSC 133;D)
                                   ✓ Streaming flag = false
                                   ✓ Count: 1,234 lines
                                   ✓ > threshold (50)
                                   ✓ Apply fold decoration (100ms delay)

Time: 45.1s ──────────────────────────────────────────────────
$ npm install
▶ 1,234 lines hidden [View]      ← FOLDED (auto-collapsed)
$ next-command                   
                                   ✓ Can click to expand inline
                                   ✓ Can click "View" → opens static window
```

### Live Updating Output Window

**If User Opens "View in Window" While Command Is Still Running:**

The separate output window should continue updating in real-time:

```typescript
interface LiveOutputWindow {
  ptyId: number;
  startLine: number;
  endMarker: IMarker; // Tracks the end of output
  updateInterval: NodeJS.Timer;
}

async function openOutputWindow(opts: FoldDecorationOptions, isLive: boolean = false) {
  const content = getRangeText([opts.startLine, opts.endLine]);
  
  const outputWindow = new WebviewWindow(`output-${Date.now()}`, {
    title: `Output${isLive ? ' (Live)' : ''} (${opts.lineCount} lines)`,
    width: 800,
    height: 600,
    resizable: true,
    url: `/#/output-viewer`,
  });
  
  outputWindow.once('tauri://created', () => {
    // Send initial content
    emitTo(outputWindow.label, 'output-content', {
      content,
      lineCount: opts.lineCount,
      isLive,
    });
    
    // If streaming, set up live updates
    if (isLive) {
      const updateInterval = setInterval(() => {
        const currentEndLine = term.buffer.active.length - 1;
        const newContent = getRangeText([opts.startLine, currentEndLine]);
        const newLineCount = currentEndLine - opts.startLine + 1;
        
        emitTo(outputWindow.label, 'output-update', {
          content: newContent,
          lineCount: newLineCount,
        });
      }, 500); // Update every 500ms
      
      // Clean up when command completes
      const checkCompletion = setInterval(() => {
        const meta = markerMeta.get(opts.marker);
        if (!meta?.streamingOutput) {
          clearInterval(updateInterval);
          clearInterval(checkCompletion);
          
          // Send final update
          const finalContent = getRangeText([opts.startLine, opts.endLine]);
          emitTo(outputWindow.label, 'output-complete', {
            content: finalContent,
            lineCount: opts.lineCount,
          });
        }
      }, 1000);
    }
  });
  
  // Clean up on window close
  outputWindow.onCloseRequested(() => {
    // Cleanup intervals if any
  });
}
```

**Output Viewer Component:**

```typescript
// src/components/OutputViewer.tsx
const OutputViewer: React.FC = () => {
  const [content, setContent] = useState('');
  const [lineCount, setLineCount] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const contentRef = useRef<HTMLPreElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    // Listen for initial content
    const unlistenContent = listen<{content: string, lineCount: number, isLive: boolean}>(
      'output-content', 
      (event) => {
        setContent(event.payload.content);
        setLineCount(event.payload.lineCount);
        setIsLive(event.payload.isLive || false);
      }
    );
    
    // Listen for live updates
    const unlistenUpdate = listen<{content: string, lineCount: number}>(
      'output-update',
      (event) => {
        setContent(event.payload.content);
        setLineCount(event.payload.lineCount);
        
        // Auto-scroll to bottom if enabled
        if (autoScroll && contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      }
    );
    
    // Listen for completion
    const unlistenComplete = listen<{content: string, lineCount: number}>(
      'output-complete',
      (event) => {
        setContent(event.payload.content);
        setLineCount(event.payload.lineCount);
        setIsLive(false);
        setIsComplete(true);
      }
    );
    
    return () => {
      unlistenContent.then(fn => fn());
      unlistenUpdate.then(fn => fn());
      unlistenComplete.then(fn => fn());
    };
  }, [autoScroll]);

  return (
    <div className="output-viewer">
      <div className="output-header">
        <span>{lineCount} lines</span>
        {isLive && <span className="live-indicator">● LIVE</span>}
        {isComplete && <span className="complete-indicator">✓ Complete</span>}
        {isLive && (
          <label>
            <input 
              type="checkbox" 
              checked={autoScroll} 
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
        )}
        <button onClick={() => navigator.clipboard.writeText(content)}>
          Copy All
        </button>
      </div>
      <pre ref={contentRef} className="output-content">
        {content}
      </pre>
    </div>
  );
};
```

## User Settings

Add to settings.json:

```typescript
interface FoldSettings {
  enabled: boolean;
  threshold: number; // Lines before folding (default: 50)
  autoOpenWindow: boolean; // Auto-open window for very large outputs
  largeThreshold: number; // Lines to suggest window (default: 500)
  showPreviewLines: number; // Lines to show in preview (default: 3)
}
```

## Implementation Phases

### Phase 1: Basic Folding (MVP)
- [ ] Detect large outputs after command completion
- [ ] Add fold decoration with line count
- [ ] Implement expand/collapse toggle
- [ ] Basic CSS styling
- [ ] Settings for threshold

### Phase 2: Enhanced UI
- [ ] Show preview lines (first N lines visible)
- [ ] Add "View in Window" button
- [ ] Better visual design
- [ ] Animation for expand/collapse

### Phase 3: Output Window
- [ ] Create output viewer component
- [ ] Implement separate window
- [ ] Add search functionality
- [ ] Add export options (copy, save to file)
- [ ] Syntax highlighting for common formats (JSON, logs, etc.)

### Phase 4: Advanced Features
- [ ] Smart folding (detect stack traces, logs, etc.)
- [ ] Persist fold states across sessions
- [ ] Regex-based auto-fold rules
- [ ] Integration with AI context (summarize large outputs)

## Edge Cases

1. **Multiple commands with large outputs**: Each gets its own fold
2. **Nested/split panes**: Each pane handles folding independently
3. **Buffer scrollback**: Folded decorations scroll with content
4. **Terminal resize**: Recalculate decoration positions
5. **Copy/paste**: Should include folded content
6. **Search**: Should search through folded content
7. **Commands that clear screen**: Fold decorations cleared too

## Performance Considerations

- **Threshold tuning**: Start conservative (50+ lines) to avoid over-folding
- **Decoration overhead**: Each fold is one decoration (lightweight)
- **Window creation**: Only create when user requests
- **Memory**: Keep fold metadata in WeakMap (auto-cleaned)

## Alternative Ideas

### Pattern-Based Folding
Automatically fold based on content patterns:
- Stack traces
- npm install output
- Long JSON/XML
- Log files

### Smart Summaries
Use AI to summarize folded output:
- "Error: 3 failed tests, 2 warnings"
- "Installed 234 packages in 45s"
- "Git diff: 15 files changed, 234 additions, 67 deletions"

### History-Based Folding
Remember which commands typically produce large output and auto-fold them next time.

## Open Questions

1. Should we fold stderr differently than stdout?
2. Should "important" output (errors) never fold?
3. Should we have different thresholds per command type?
4. Should folded content be searchable?
5. Should AI context include folded content or summaries?

## Recommendation

Start with **Phase 1** (basic CSS-based folding with toggle). This gives immediate value with minimal complexity. The architecture is extensible for future enhancements.

Key benefits:
- Non-destructive
- Works with existing marker system
- Easy to disable/configure
- Foundation for advanced features

Then add **Phase 3** (output window) for power users who need to analyze large outputs.
