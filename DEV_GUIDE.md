# AIterminal Developer Guide

Welcome to the AIterminal development guide! This document will help you get started contributing to the project.

## Table of Contents

- [Quick Start](#quick-start)
- [Project Architecture](#project-architecture)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Key Concepts](#key-concepts)
- [Adding New Features](#adding-new-features)
- [Testing Guidelines](#testing-guidelines)
- [Code Style & Conventions](#code-style--conventions)
- [Debugging Tips](#debugging-tips)
- [Common Development Tasks](#common-development-tasks)
- [Pull Request Process](#pull-request-process)

---

## Quick Start

### Prerequisites

- **Node.js**: Version 20.19+ or 22.12+ (see `.nvmrc`)
- **Rust & Cargo**: Latest stable version
- **npm**: Comes with Node.js

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/AIterminal.git
cd AIterminal

# Install dependencies (use 'npm ci' for reproducible builds)
npm ci

# Run the development build
npm run tauri dev
```

### Development Commands

| Command | Purpose |
|---------|---------|
| `npm run tauri dev` | Start full Tauri app in development mode |
| `npm run dev` | Start Vite frontend dev server only |
| `npm run build` | Build production frontend |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run tests once (CI-friendly) |
| `npm run preview` | Serve production build locally |

---

## Project Architecture

AIterminal is built with a **modular, hook-based architecture** that separates concerns for better maintainability and testability.

### High-Level Stack

- **Frontend**: React + TypeScript + xterm.js
- **Backend**: Rust + Tauri + portable-pty
- **AI System**: Vercel AI SDK with 22 automated tools
- **State Management**: React hooks + Context API

### Recent Refactoring (2026)

The project underwent a major refactoring that reduced `App.tsx` from 1,002 lines to 207 lines (79% reduction):

- **9 custom React hooks** for state management
- **4 focused components** for UI composition
- **2 utility modules** for window and detection logic
- **Removed 57 unnecessary style helper functions**

This makes the codebase:
- ✅ Easier to understand and navigate
- ✅ Simpler to test individual features
- ✅ More reliable with clear separation of concerns
- ✅ Faster to extend with new functionality

### Component Hierarchy

```
App (Root)
├── ErrorBoundary
├── SettingsProvider
├── AIProvider
├── SSHProfilesProvider
└── AppContent
    ├── WindowRouter (routes to appropriate window type)
    │   ├── AIPanel (AI window)
    │   ├── SSHSessionWindow (SSH window)
    │   ├── QuickActionsWindow (Quick Actions window)
    │   ├── PreviewWindow (File preview window)
    │   └── OutputViewer (Output viewer window)
    └── Main Window
        ├── TabBar
        ├── AppToolbar
        └── TerminalGrid
            └── Terminal (multiple instances)
```

### Custom Hooks Overview

| Hook | Purpose | Key Responsibilities |
|------|---------|---------------------|
| `useTabManagement` | Tab & pane lifecycle | Create/close tabs, split panes, manage focus |
| `useSessionPersistence` | Session restoration | Auto-save sessions, load on startup |
| `useSSHConnection` | SSH connections | Connect profiles, monitor health, track latency |
| `useCrossWindowEvents` | Multi-window sync | Sync state between main/AI/SSH/Quick Actions windows |
| `useSessionRestoration` | Startup restoration | Restore tabs and SSH connections on app launch |
| `useQuickActionsExecutor` | Quick Actions | Execute command sequences in active terminal |
| `useKeyboardShortcuts` | Keyboard handling | Global shortcuts (Cmd+T, Cmd+W, etc.) |
| `useCommandTracking` | Running commands | Track command execution time, navigate to tabs |
| `useWindowCloseHandler` | Shutdown cleanup | Save session on window close |

See [notes/HOOKS_REFERENCE.md](notes/HOOKS_REFERENCE.md) for detailed API documentation.

---

## Development Workflow

### 1. Make Changes

Edit files in `src/` (TypeScript/React) or `src-tauri/` (Rust).

### 2. Test Locally

```bash
# Run the app in dev mode with hot reload
npm run tauri dev

# Run unit tests
npm run test

# Run tests once (for CI)
npm run test:run
```

### 3. Verify Changes

- **Terminal functionality**: Create tabs, run commands, check markers
- **AI Panel**: Test tool execution, context management
- **SSH connections**: Connect to profiles, monitor latency
- **Quick Actions**: Create and execute command sequences

### 4. Commit Changes

Use clear, imperative commit messages:

```bash
git add .
git commit -m "Add feature X to improve Y"
```

### 5. Open Pull Request

See [Pull Request Process](#pull-request-process) below.

---

## Project Structure

```
AIterminal/
├── src/                      # React + TypeScript frontend
│   ├── ai/                   # AI assistant implementation
│   │   ├── tools-vercel.ts   # 22 tool definitions
│   │   ├── chatSend-vercel.ts # Streaming chat with tool execution
│   │   ├── prompts.ts        # System prompts
│   │   ├── conversationHistory.ts # Sliding window history
│   │   ├── streamingBuffer.ts # Batch text updates
│   │   └── contextRanker.ts  # Context relevance ranking
│   ├── app/                  # Application wiring
│   ├── components/           # React components
│   │   ├── TabBar.tsx        # Tab bar with drag/drop
│   │   ├── AppToolbar.tsx    # Top toolbar buttons
│   │   ├── TerminalGrid.tsx  # Terminal pane grid
│   │   ├── WindowRouter.tsx  # Window type routing
│   │   └── ...               # Other UI components
│   ├── hooks/                # Custom React hooks
│   │   ├── useTabManagement.ts
│   │   ├── useSessionPersistence.ts
│   │   ├── useSSHConnection.ts
│   │   └── ...               # Other hooks
│   ├── context/              # React Context providers
│   ├── utils/                # Shared utilities
│   ├── types/                # TypeScript type definitions
│   └── App.tsx               # Root component (207 lines)
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── lib.rs            # Main Tauri entry point
│   │   ├── pty.rs            # PTY management
│   │   ├── tools/            # AI tool implementations
│   │   │   └── commands.rs   # All tool commands
│   │   └── ...
│   ├── shell-integration/    # Shell integration scripts
│   │   ├── bash_init.sh      # Bash/Zsh markers
│   │   └── ssh_helper.sh     # SSH integration
│   └── tauri.conf.json       # Tauri configuration
├── tests/                    # Vitest test files
├── docs/                     # User documentation
├── notes/                    # Internal developer notes (git-ignored)
├── public/                   # Static assets
└── package.json              # npm dependencies
```

---

## Key Concepts

### Tab & Pane System

- **Tab**: A workspace that can contain 1-2 panes
- **Pane**: A single terminal instance (PTY)
- **Split Panes**: Vertical or horizontal splits within a tab
- **Focused Pane**: The currently active pane in a tab

```typescript
interface Tab {
  id: number;                // Tab ID (same as first pane PTY ID)
  title: string;             // Display title
  customName?: string;       // User-defined name
  panes: Pane[];             // Array of panes (1-2)
  focusedPaneId: number | null; // Currently focused pane
  splitLayout: 'single' | 'vertical' | 'horizontal';
  splitRatio: number;        // Split ratio (10-90)
  profileId?: string;        // SSH profile ID if applicable
}
```

### Session Persistence

Sessions are automatically saved every 5 seconds and restored on app launch:

- **Saved data**: Tab structure, working directories, SSH connections
- **Restoration**: Recreates local tabs with correct CWD, reconnects SSH profiles
- **Skip logic**: Panes without valid CWD are skipped (likely dead PTYs)

### Window Management

AIterminal supports multiple window types:

1. **Main Window**: Primary terminal interface
2. **AI Panel Window**: Detached AI assistant
3. **SSH Panel Window**: SSH profile manager
4. **Quick Actions Window**: Command sequence manager
5. **Output Viewer Window**: Large output viewer
6. **Preview Window**: File preview (Markdown, HTML, etc.)

Windows communicate via Tauri's event system (`emitTo`, `listen`).

### Shell Integration

- **Command markers**: OSC 133 sequences for command boundaries
- **SSH integration**: Automatic marker injection via `aiterm_ssh` wrapper
- **REPL support**: Python and R interactive sessions
- **Remote markers**: Base64-encoded script injection for SSH sessions

---

## Adding New Features

### Adding a New Hook

1. Create file in `src/hooks/use[YourFeature].ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '../utils/logger';

const log = createLogger('YourFeature');

interface UseYourFeatureProps {
  // Props interface
}

interface UseYourFeatureReturn {
  // Return interface
}

export function useYourFeature(props: UseYourFeatureProps): UseYourFeatureReturn {
  // Hook implementation
  
  return {
    // Return values
  };
}
```

2. Import and use in `App.tsx`:

```typescript
import { useYourFeature } from './hooks/useYourFeature';

function AppContent() {
  const { value, handler } = useYourFeature({ /* props */ });
  // Use hook values
}
```

### Adding a New Component

1. Create file in `src/components/YourComponent.tsx`:

```typescript
import './YourComponent.css'; // Optional styles

interface YourComponentProps {
  // Props interface
}

export function YourComponent(props: YourComponentProps) {
  const { prop1, prop2 } = props;
  
  return (
    <div className="your-component">
      {/* JSX */}
    </div>
  );
}
```

2. Use in parent component:

```tsx
import { YourComponent } from './components/YourComponent';

<YourComponent prop1={value1} prop2={value2} />
```

### Adding an AI Tool

See [AGENTS.md](AGENTS.md) for comprehensive AI tool implementation guide.

**Quick overview:**

1. **Rust backend** (`src-tauri/src/tools/commands.rs`):
   ```rust
   #[tauri::command]
   pub async fn your_tool_name_tool(param: String, working_directory: Option<String>) -> Result<String, String> {
       // Implementation
   }
   ```

2. **Register in Tauri** (`src-tauri/src/lib.rs`):
   ```rust
   .invoke_handler(tauri::generate_handler![your_tool_name_tool])
   ```

3. **TypeScript definition** (`src/ai/tools-vercel.ts`):
   ```typescript
   your_tool: tool({
     description: `Clear description with examples`,
     inputSchema: z.object({ param: z.string() }),
     execute: async ({ param }) => {
       const result = await invoke<string>('your_tool_name_tool', { param });
       return result;
     },
   }),
   ```

4. **Update prompts** (`src/ai/prompts.ts`):
   - Add tool to capabilities list
   - Update workflow if needed

---

## Testing Guidelines

### Unit Tests

Located in `tests/` directory, using Vitest.

**Run tests:**

```bash
# Watch mode (auto-rerun on changes)
npm run test

# Run once (CI-friendly)
npm run test:run
```

**Writing tests:**

```typescript
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../src/utils/yourModule';

describe('yourFunction', () => {
  it('should do X when Y', () => {
    const result = yourFunction(input);
    expect(result).toBe(expected);
  });
});
```

### Manual Testing Checklist

Before opening a PR, verify these core flows:

- [ ] Terminal renders and accepts input
- [ ] Tab creation/closing works
- [ ] Command markers appear (grey → green/red)
- [ ] Click marker → context menu appears
- [ ] "View in Window" opens output viewer
- [ ] AI Panel opens and responds to queries
- [ ] AI tools execute correctly
- [ ] Quick Actions execute in active terminal
- [ ] SSH connection works with latency display
- [ ] Session restores after app restart
- [ ] Keyboard shortcuts work (Cmd+T, Cmd+W, etc.)

---

## Code Style & Conventions

### TypeScript/React

- **Indentation**: 2 spaces
- **Quotes**: Double quotes (`"`)
- **Naming**:
  - Components: `PascalCase.tsx` (e.g., `TabBar.tsx`)
  - Hooks: `use*.ts` (e.g., `useTabManagement.ts`)
  - Utilities: `camelCase.ts` (e.g., `windowManagement.ts`)
  - Types: `PascalCase` interfaces (e.g., `Tab`, `Pane`)
- **Imports**: Group by type (React → Tauri → Local)

```typescript
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../utils/logger';
import type { Tab } from './useTabManagement';
```

### Rust

- **Indentation**: 4 spaces (rustfmt default)
- **Naming**:
  - Functions: `snake_case`
  - Commands: `*_tool` suffix for AI tools
  - Structs: `PascalCase`
- **Format**: Run `cargo fmt` before committing

### CSS

- **Files**: Colocated with components (e.g., `TabBar.css`)
- **Classes**: `kebab-case` (e.g., `.tab-bar`, `.active-tab`)
- **Organization**: Group related rules together

---

## Debugging Tips

### Frontend Debugging

**Open DevTools:**
- macOS: `Cmd + Option + I`
- Windows/Linux: `Ctrl + Shift + I`

**Console logging:**

```typescript
import { createLogger } from '../utils/logger';

const log = createLogger('ComponentName');
log.debug('Debug message', { data });
log.info('Info message');
log.warn('Warning message');
log.error('Error message', error);
```

**React DevTools:**
- Install React DevTools extension
- Inspect component tree and props

### Backend Debugging

**Rust console output:**

```rust
println!("Debug: {:?}", value);
eprintln!("Error: {}", error);
```

**Tauri console:**
- Backend logs appear in the terminal where you ran `npm run tauri dev`

### Common Issues

**Issue**: "Failed to spawn PTY"
- **Cause**: Rust backend error
- **Fix**: Check terminal running `tauri dev` for Rust errors

**Issue**: Hooks not updating state
- **Cause**: Stale closure or missing dependency
- **Fix**: Check `useEffect`/`useCallback` dependency arrays

**Issue**: TypeScript errors
- **Cause**: Type mismatches or missing types
- **Fix**: Run `npm run build` to see all errors

---

## Common Development Tasks

### Add a New Keyboard Shortcut

Edit `src/hooks/useKeyboardShortcuts.ts`:

```typescript
if (e.key === "n" && e.shiftKey) {
  e.preventDefault();
  yourHandler();
}
```

### Add a New Context Provider

1. Create `src/context/YourContext.tsx`:

```typescript
import { createContext, useContext, useState } from 'react';

interface YourContextType {
  value: string;
  setValue: (value: string) => void;
}

const YourContext = createContext<YourContextType | null>(null);

export function YourProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState('');
  
  return (
    <YourContext.Provider value={{ value, setValue }}>
      {children}
    </YourContext.Provider>
  );
}

export function useYour() {
  const context = useContext(YourContext);
  if (!context) throw new Error('useYour must be used within YourProvider');
  return context;
}
```

2. Wrap in `App.tsx`:

```tsx
<YourProvider>
  <AppContent />
</YourProvider>
```

### Add a New Window Type

1. Update `src/utils/windowDetection.ts`:

```typescript
export interface WindowType {
  isYourWindow: boolean;
  // ...
}

export function detectWindowType(): WindowType {
  const label = getCurrentWindow().label;
  return {
    isYourWindow: label === 'your-window',
    // ...
  };
}
```

2. Update `WindowRouter.tsx`:

```tsx
if (isYourWindow) {
  return <YourWindow />;
}
```

3. Create window opening utility in `src/utils/windowManagement.ts`:

```typescript
export async function openYourWindow() {
  const existing = await WebviewWindow.getByLabel('your-window');
  if (existing) {
    await existing.setFocus();
    return;
  }
  
  new WebviewWindow('your-window', {
    url: '/',
    title: 'Your Window',
    width: 800,
    height: 600,
  });
}
```

---

## Pull Request Process

### 1. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Write code
- Add tests (if applicable)
- Update documentation

### 3. Test Thoroughly

```bash
# Run automated tests
npm run test:run

# Manual testing checklist (see above)
```

### 4. Commit Changes

```bash
git add .
git commit -m "Add feature: brief description"
```

Use clear, imperative messages:
- ✅ "Add SSH connection monitoring"
- ✅ "Fix tab closing race condition"
- ✅ "Update user guide with new shortcuts"
- ❌ "Updated stuff"
- ❌ "WIP"

### 5. Push and Open PR

```bash
git push origin feature/your-feature-name
```

Open PR on GitHub with:
- **Title**: Clear, descriptive summary
- **Description**: 
  - What problem does this solve?
  - How does it work?
  - Testing performed
  - Screenshots (for UI changes)

### PR Review Checklist

- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Manual testing completed
- [ ] Documentation updated (if needed)
- [ ] Code follows style conventions
- [ ] No unnecessary dependencies added
- [ ] Commit messages are clear

---

## Additional Resources

- **User Guide**: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- **Repository Guidelines**: [AGENTS.md](AGENTS.md)
- **Architecture Deep Dive**: [notes/ARCHITECTURE.md](notes/ARCHITECTURE.md)
- **Hooks Reference**: [notes/HOOKS_REFERENCE.md](notes/HOOKS_REFERENCE.md)
- **Components Reference**: [notes/COMPONENTS_REFERENCE.md](notes/COMPONENTS_REFERENCE.md)
- **Refactoring Summary**: [notes/REFACTORING_SUMMARY.md](notes/REFACTORING_SUMMARY.md)

---

## Getting Help

- **Issues**: Check existing GitHub issues or create a new one
- **Discussions**: Start a GitHub discussion for questions
- **Code Review**: Request review from maintainers in your PR

---

**Happy coding! 🚀**
