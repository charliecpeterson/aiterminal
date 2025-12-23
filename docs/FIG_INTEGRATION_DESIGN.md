# Fig Autocomplete Integration Design

## Visual Design Mockup

### Current State (No Autocomplete)
```
┌─────────────────────────────────────────────────────────┐
│ Tab 1                              AI Panel   Settings  │
├─────────────────────────────────────────────────────────┤
│ charlie@Charlies-MacBook-Air ~ $ git co█                │
│                                                         │
│ (Tab = shell completion for files/PATH)                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Option 1: Fish-Style Inline (MINIMAL - RECOMMENDED)
```
┌─────────────────────────────────────────────────────────┐
│ Tab 1                              AI Panel   Settings  │
├─────────────────────────────────────────────────────────┤
│ charlie@Charlies-MacBook-Air ~ $ git commit█ -m ""      │
│                                              └─────────┘ │
│                                              (gray text) │
│ → to accept | ↓ for more | Tab = shell completion      │
└─────────────────────────────────────────────────────────┘
```
**How it works:**
- Top suggestion appears as **gray text** after cursor
- Press **→ (right arrow)** to accept suggestion
- Press **↓ (down arrow)** to see full menu
- **Tab still works normally** for shell completion
- Zero visual clutter until you need it

### Option 2: Ctrl+Space Dropdown
```
┌─────────────────────────────────────────────────────────┐
│ Tab 1                              AI Panel   Settings  │
├─────────────────────────────────────────────────────────┤
│ charlie@Charlies-MacBook-Air ~ $ git co█                │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ commit    Create a new commit                       │ │
│ │ checkout  Switch branches or restore files          │ │
│ │ config    Get and set repository options            │ │
│ └─────────────────────────────────────────────────────┘ │
│ (Press Ctrl+Space to trigger)                           │
└─────────────────────────────────────────────────────────┘
```
**How it works:**
- Press **Ctrl+Space** explicitly to show menu
- **Tab still works normally** for shell completion
- Only appears when requested
- Navigate with ↑↓, accept with Enter

### Option 3: Automatic Panel (Intrusive)
```
┌─────────────────────────────────────────────────────────┐
│ Tab 1                              AI Panel   Settings  │
├─────────────────────────────────────────────────────────┤
│ charlie@Charlies-MacBook-Air ~ $ git commit -█          │
│                                    ┌──────────────────┐ │
│                                    │ -m  <message>    │ │
│                                    │ -a  Stage all    │ │
│                                    │ --amend Modify   │ │
│                                    │ --no-verify Skip │ │
│                                    └──────────────────┘ │
│ (Auto-shows after typing, might be annoying)            │
└─────────────────────────────────────────────────────────┘
```
**How it works:**
- Automatically shows after typing
- Can be distracting during normal work
- Need to press Esc to dismiss
- Not recommended unless user enables it

## Key Binding Options Compared

| Option | Trigger | Keeps Tab? | Minimal? | User Control | Similar To |
|--------|---------|------------|----------|--------------|------------|
| **Fish-style inline** | Auto (on space) | ✅ Yes | ✅ Very | → to accept | Fish, GitHub Copilot |
| **Ctrl+Space menu** | Manual | ✅ Yes | ⚠️ Medium | Ctrl+Space | VSCode, IntelliJ |
| **Auto panel** | Auto (on type) | ✅ Yes | ❌ No | Always visible | Amazon Q |
| **Replace Tab** | Tab key | ❌ No | ⚠️ Medium | Tab accepts | Not recommended |

### Recommendation: Fish-Style Inline + Ctrl+Space

**Best of both worlds:**
1. **Inline gray text** (automatic, minimal, like Fish shell)
   - Shows top suggestion as you type
   - Press → to accept, or keep typing to ignore
   - Tab still works for shell completion
   
2. **Ctrl+Space dropdown** (manual, when you need options)
   - Shows full menu of suggestions
   - Use when you want to see all options
   - Navigate with ↑↓, accept with Enter

**User flow:**
```bash
$ git co█mit -m ""        # Gray suggestion appears automatically
          ↑ (gray)        # Press → to accept, or keep typing

$ git commit █            # Not sure what flag to use?
# Press Ctrl+Space
┌──────────────────────┐
│ -m  <message>        │  # Full menu appears
│ -a  Stage all        │
│ --amend             │
└──────────────────────┘
```

## Technical Implementation

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Your Terminal UI                   │
│                   (xterm.js)                        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│         Autocomplete Engine (TypeScript)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ Input Parser │→ │ Spec Matcher │→ │ Renderer │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│         Fig Autocomplete Specs (JSON/TS)            │
│  git.js | npm.js | docker.js | kubectl.js | ...    │
│              (600+ command specs)                   │
└─────────────────────────────────────────────────────┘
```

### File Structure
```
src/
  terminal/
    autocomplete/
      engine.ts           # Core matching logic
      renderer.tsx        # React component for suggestions
      specLoader.ts       # Load Fig specs dynamically
      parser.ts           # Parse current command line
      cache.ts            # Cache loaded specs
```

### User Experience Flow

1. **User types**: `git co` + spacebar
2. **Parser extracts**: Command="git", Token="co"
3. **Spec loader**: Loads `git.js` spec (if not cached)
4. **Matcher finds**: `commit`, `checkout`, `config` (all start with "co")
5. **Renderer shows**: Dropdown with 3 suggestions
6. **User presses Tab**: "commit" auto-completes
7. **Result**: `git commit █`

### Integration Points in Your App

#### 1. Add Dependency
```bash
npm install @fig/autocomplete-parser  # Parser/matcher utilities
# Fig specs are in node_modules/@withfig/autocomplete/build/
```

#### 2. Hook into xterm.js Key Events
```typescript
// src/terminal/autocomplete/engine.ts

// Fish-style inline: Show on space/typing
term.onData((data) => {
  if (data === ' ') { // Space bar
    const currentLine = getCurrentLine(term);
    const topSuggestion = getTopSuggestion(currentLine);
    
    if (topSuggestion) {
      // Render gray text after cursor
      showInlineSuggestion(topSuggestion);
    }
  }
  
  // Right arrow accepts suggestion
  if (data === '\x1b[C' && hasInlineSuggestion()) {
    acceptInlineSuggestion();
    return; // Don't pass through to shell
  }
  
  // Ctrl+Space shows full menu
  if (data === '\x00') { // Ctrl+Space
    const currentLine = getCurrentLine(term);
    const suggestions = getAllSuggestions(currentLine);
    showSuggestionsMenu(suggestions);
  }
});

// Render gray suggestion text
function showInlineSuggestion(text: string) {
  const cursor = term.buffer.active.cursorX;
  
  // Write with gray color
  term.write('\x1b[90m' + text + '\x1b[0m');
  
  // Move cursor back to original position
  term.write('\x1b[' + text.length + 'D');
}
```

#### 3. Create Suggestions Panel Component
```tsx
// src/components/AutocompleteSuggestions.tsx
interface Suggestion {
  name: string;
  description: string;
  icon?: string;
}

export function AutocompleteSuggestions({ 
  suggestions, 
  position,
  onSelect 
}: Props) {
  return (
    <div className="autocomplete-panel" style={{ 
      position: 'absolute',
      top: position.y,
      left: position.x 
    }}>
      {suggestions.map(s => (
        <div className="suggestion-item" onClick={() => onSelect(s)}>
          {s.icon} {s.name} - {s.description}
        </div>
      ))}
    </div>
  );
}
```

## Recommended Approach: Phased Rollout

### Phase 1: Basic Subcommand Completion ✅
- Load common specs (git, npm, docker)
- Show suggestions on Tab press
- Inline completion (replace current token)
- **Effort**: 2-3 days

### Phase 2: Flag/Argument Suggestions ⚡
- Detect `-` and `--` prefix
- Show available flags with descriptions
- Smart defaults (git branch = current branches)
- **Effort**: 1-2 days

### Phase 3: AI-Enhanced Explanations 🤖
- Press `Ctrl+Space` on any suggestion
- AI explains what the flag/command does
- Example use cases
- **Effort**: 1 day (already have AI infrastructure)

### Phase 4: Visual Polish 💎
- Icons from Fig specs
- Keyboard shortcuts indicator
- Smooth animations
- **Effort**: 1-2 days

## Styling Mockup

```css
.autocomplete-panel {
  background: rgba(20, 21, 28, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  max-height: 300px;
  overflow-y: auto;
}

.suggestion-item {
  padding: 8px 12px;
  display: flex;
  gap: 8px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.suggestion-item:hover {
  background: rgba(91, 141, 232, 0.15);
}

.suggestion-item.selected {
  background: rgba(91, 141, 232, 0.25);
}

.suggestion-name {
  font-weight: 600;
  color: #e8eaed;
  min-width: 100px;
}

.suggestion-description {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}
```

## Example: Git Completion in Action

### Step 1: User types
```
$ git █
```

### Step 2: Press Tab - shows top-level commands
```
$ git █
┌─────────────────────────────────────────┐
│ add        Add file contents to index   │
│ commit     Record changes to repo       │
│ push       Update remote refs            │
│ pull       Fetch and integrate changes  │
│ checkout   Switch branches               │
│ ...                                      │
└─────────────────────────────────────────┘
```

### Step 3: Type "com" - filters
```
$ git com█
┌─────────────────────────────────────────┐
│ commit     Record changes to repo       │
└─────────────────────────────────────────┘
```

### Step 4: Press Tab - completes
```
$ git commit █
```

### Step 5: Type "-" - shows flags
```
$ git commit -█
┌─────────────────────────────────────────┐
│ -m         Commit message                │
│ -a         Stage all modified files      │
│ --amend    Modify the previous commit    │
│ --no-verify Skip pre-commit hooks        │
└─────────────────────────────────────────┘
```

## Key Differences from inshellisense

| Feature | inshellisense | Your Integration |
|---------|---------------|------------------|
| **Architecture** | Wraps shell in Node.js | Native in terminal UI |
| **Performance** | Slight overhead | Direct, no wrapper |
| **Styling** | Fixed UI | Custom to match your theme |
| **AI Integration** | None | Can explain suggestions |
| **Context** | Terminal only | Access to AI panel, history |
| **Setup** | User installs separately | Built-in, zero config |

## Minimal Viable Product (MVP)

Start with this minimal version to test:

```typescript
// src/terminal/autocomplete/index.ts
import gitSpec from '@withfig/autocomplete/build/git.js';

export function getCompletions(commandLine: string): string[] {
  const tokens = commandLine.split(' ');
  const command = tokens[0];
  
  if (command === 'git' && tokens.length === 2) {
    const prefix = tokens[1];
    return gitSpec.subcommands
      .filter(sub => sub.name.startsWith(prefix))
      .map(sub => sub.name);
  }
  
  return [];
}
```

Then render in a simple React component positioned absolutely over the terminal.

## Summary

**Best integration for your app:**
- **Option 2: Floating Panel** (like VSCode IntelliSense)
- Appears on Tab press
- Positioned next to cursor
- Keyboard navigation (↑↓ Tab Esc)
- Styled to match your dark theme
- 600+ commands from Fig specs
- Can add AI explanations later

**Development time: ~1 week** for a polished MVP

Want me to start implementing the basic version?
