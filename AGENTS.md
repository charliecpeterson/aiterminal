# AI Terminal - Repository Guidelines for AI Agents

## Critical Execution Requirements

### 🚨 ALWAYS Use Conda Environment
**ALL npm, cargo, and python commands MUST be run with:**
```bash
conda run -n aiterminal <command>
```

Examples:
- ✅ `conda run -n aiterminal npm run build`
- ✅ `conda run -n aiterminal cargo check`
- ✅ `conda run -n aiterminal npm run tauri dev`
- ❌ `npm run build` (will fail - conda env not activated)

### 🔥 AI Tools Execute in PTY Terminal
**CRITICAL UNDERSTANDING**: AI tools run commands in the user's **active PTY terminal session**, NOT in isolated processes.

This means:
- ✅ **Same environment**: Commands see the user's current shell environment (SSH, docker, srun, etc.)
- ✅ **Remote execution**: If user is SSH'd into a server, AI commands run on that server
- ✅ **Interactive sessions**: Works in tmux, screen, HPC job sessions, containers
- ❌ **NO local-only operations**: Avoid Rust `invoke()` calls that only work locally (e.g., `get_shell_history_tool`)
- ✅ **Use executeInPty()**: Commands are wrapped with markers and executed via PTY

**Example**: If user is in `ssh user@remote`, then AI's `ls` command runs on remote server, not locally.

**Implementation**: 
- TypeScript: `executeInPty()` in `src/terminal/core/executeInPty.ts`
- Sends commands with `__AITERM_START_` and `__AITERM_END_` markers
- Captures output via `pty-data` events

## Project Structure & Module Organization

### Frontend (TypeScript + React)
- **`src/`**: React + TypeScript frontend
  - **`src/components/`**: UI components (PascalCase.tsx)
    - `Terminal.tsx`: Main terminal component
    - `AIPanel.tsx`: AI chat interface  
    - `SSHSessionPanel.tsx`: SSH connection manager
  - **`src/ai/`**: AI assistant implementation
    - `tools-vercel.ts`: 22 tool definitions (Vercel AI SDK + Zod)
    - **`pty/securedPtyTools.ts`**: **Centralized PTY execution primitives with security**
    - **`security/pathValidator.ts`**: **Path traversal & sensitive file protection**
    - `chatSend-vercel.ts`: Streaming chat with tool execution (max 15 steps)
    - `prompts.ts`: System prompts with tool capabilities
    - `conversationHistory.ts`: Sliding window + auto-summarization
    - `streamingBuffer.ts`: Batches chunks to reduce re-renders by 70-90%
    - `contextRanker.ts`: Relevance scoring for context items
    - `smartContext.ts`: Embedding-based context retrieval
    - `commandSafety.ts`: Destructive command detection (default-deny)
  - **`src/terminal/`**: Terminal logic
    - `core/executeInPty.ts`: **PTY command execution with markers**
    - `ui/markers.ts`: Command block visualization & menu system
    - `hooks/`: Terminal-related React hooks
  - **`src/context/`**: React context providers
  - **`src/utils/`**: Shared utilities
  - **`src/hooks/`**: Reusable React hooks

### Backend (Rust + Tauri)
- **`src-tauri/`**: Rust backend
  - **`src/tools/commands.rs`**: Minimal Rust tools (analyze_error, calculate, web_search) - 176 lines
  - **`src/chat/commands.rs`**: AI provider connection testing (test_ai_connection) - 43 lines
  - **`src/pty/`**: PTY management (spawn, read, write)
  - **`src/ssh/`**: SSH profile management
  - **`src/security/`**: Path validation helpers (Rust-side)
  - **`src/settings.rs`**: App settings persistence
  - **`src/lib.rs`**: Main library, Tauri handlers
  - **`shell-integration/`**: Shell init scripts for bash/zsh

**Note**: Most AI tools now run via TypeScript PTY primitives, not Rust. Only 3 Rust tools remain for special cases (error analysis, math eval, web search).

### Configuration & Data
- **`~/.config/aiterminal/`**: User configuration directory
  - `settings.json`: AI model settings, API keys
  - `bash_init.sh`, `zsh_init.sh`: Shell integration
  - `ssh_profiles.json`: Saved SSH connections
  - `last-session.json`: Session state persistence

## Build, Test, and Development Commands

**Remember: Always use `conda run -n aiterminal`!**

```bash
# Install dependencies
conda run -n aiterminal npm ci

# Development
conda run -n aiterminal npm run dev          # Vite dev server (frontend only)
conda run -n aiterminal npm run tauri dev    # Full app with Rust backend

# Build
conda run -n aiterminal npm run build        # TypeScript + Vite build
conda run -n aiterminal cargo build          # Rust build (in src-tauri/)

# Testing
conda run -n aiterminal npm run test         # Vitest watch mode
conda run -n aiterminal npm run test:run     # Vitest single run
conda run -n aiterminal cargo test           # Rust tests

# Linting
conda run -n aiterminal cargo check          # Rust type checking
conda run -n aiterminal cargo clippy         # Rust linting
```

## Coding Style & Naming Conventions

### TypeScript/React
- **Indentation**: 2 spaces
- **Quotes**: Double quotes
- **Components**: PascalCase.tsx (e.g., `Terminal.tsx`)
- **Hooks**: use*.ts (e.g., `useFloatingMenu.ts`)
- **Types**: Defined in same file or `*.types.ts`
- **Styles**: Plain CSS files, colocated with components

### Rust
- **Indentation**: 4 spaces (rustfmt default)
- **Naming**: snake_case for functions/variables, PascalCase for types
- **Error Handling**: Return `Result<T, String>` from Tauri commands
- **Async**: Use `async fn` for I/O operations
- **Security**: Always `validate_path()` for file operations

## AI Tools Architecture (PTY-First Approach)

### Overview

**All 22 AI tools now use PTY-based execution** for terminal awareness. This means tools work correctly in SSH sessions, containers, HPC jobs, and any nested terminal environment.

**Key principle**: Commands execute in the user's **active terminal**, not in isolated local processes.

### Architecture: TypeScript PTY Primitives

```
AI Decision (Vercel SDK)
    ↓
Tool Definition (tools-vercel.ts)
    ↓
PTY Primitive (securedPtyTools.ts) ← Security validation (pathValidator.ts)
    ↓
executeSecured() ← Approval flow
    ↓
executeInPty() ← Marker-based capture
    ↓
User's Active Terminal (local/SSH/container/HPC)
```

### Security Layer

**All file operations protected by:**
1. **Path Validation** (`src/ai/security/pathValidator.ts`):
   - Path traversal detection (`../` sequences)
   - Sensitive file blocking (`.ssh/`, `.aws/`, `.env*`, `/etc/passwd`, etc.)
   - Environment variable protection (blocks `*API_KEY`, `*SECRET`, `*TOKEN`, etc.)

2. **Command Safety** (`src/ai/commandSafety.ts`):
   - Destructive operation detection (rm, dd, redirects, script execution)
   - Default-deny for unknown commands
   - Whitelist of safe read-only operations

3. **Approval Flow**:
   - Write operations require user approval
   - Destructive commands flagged automatically
   - User can approve/reject before execution

### PTY Primitives (securedPtyTools.ts)

**Available primitives** (all with security validation):
- **File operations**: `readFile()`, `writeFile()`, `tailFile()`, `readFileLines()`, `replaceInFile()`, `getFileInfo()`, `diffFiles()`
- **Search**: `listDirectory()`, `findFiles()`, `grep()`
- **Git**: `gitStatus()`, `gitDiff()`
- **System**: `findProcess()`, `checkPort()`, `getSystemInfo()`, `getShellHistory()`, `getEnvVar()`

**Features**:
- 60-second file read cache (covers multi-step agent turns)
- Automatic path validation
- Shell escaping for all arguments
- Remote-aware execution (checks if in SSH session)
- Timeout handling (quick/default/long)

### Current Tool Categories (22 tools)

1. **Terminal Commands** (1): `execute_command` - General shell execution
2. **File Operations** (10): read_file, write_file, append_to_file, replace_in_file, file_sections, get_file_info, tail_file, read_multiple_files, list_directory, make_directory
3. **Search** (3): search_files, grep_in_files, rg_search  
4. **Error Analysis** (2): analyze_error (Rust), find_errors_in_file
5. **Git** (2): git_status, get_git_diff
6. **System** (4): find_process, check_port, get_system_info, get_shell_history
7. **Utilities** (2): calculate (Rust), web_search (Rust)
8. **Files** (1): diff_files

**Note**: Only 3 tools still use Rust backend:
- `analyze_error` - Complex regex-based error parsing
- `calculate` - Math expression evaluation (meval crate)
- `web_search` - Web search URL generation

### Adding New PTY Tools

#### 1. Add primitive to securedPtyTools.ts (if needed)

```typescript
async myNewOperation(arg: string): Promise<string> {
  const ctx = await getPtyContext();
  
  // Build command safely (no string interpolation!)
  const command = `my_command ${shellEscape(arg)}`;
  
  const result = await executeSecured({
    ctx,
    command,
    timeoutMs: COMMAND_TIMEOUT_DEFAULT_MS,
  });
  
  return result;
}
```

#### 2. Define tool in tools-vercel.ts

```typescript
my_new_tool: tool({
  description: `What this tool does.
  
Examples:
- Use case 1: arg="value1"
- Use case 2: arg="value2"`,
  
  inputSchema: z.object({
    arg: z.string().describe('Argument description'),
  }),
  
  execute: async ({ arg }) => {
    try {
      return await ptyTools.myNewOperation(arg);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : error}`;
    }
  },
}),
```

### Old Architecture (Deprecated)

**Previous approach**: Rust tools using local file APIs
- ❌ Broke in SSH sessions (read user's local files, not remote)
- ❌ Couldn't access container filesystems
- ❌ Didn't work in HPC job sessions
- ✅ Had good security validation

**Migration**: All file/search/git/system tools moved to PTY
- Rust security logic ported to TypeScript (pathValidator.ts)
- ~2,300 lines of Rust code removed
- Single source of truth for tool implementations

## Terminal UI/UX

### Command Menu System
- **Show menu**: Shift+Click on completed command block
- **Hide menu**: Single click anywhere
- **Actions**: Copy command/output, add to AI context, explain/fix/analyze
- **Visual**: Colored left gutter markers (green=success, red=error, blue=Python)

### Cursor Behavior
- **Default**: Text cursor (I-beam) - normal terminal interaction
- **Links**: Pointer cursor on clickable URLs
- **Markers**: Pointer cursor on left gutter markers

## Testing Guidelines

### Vitest (Frontend)
- Tests in `tests/*.test.ts`
- Run: `conda run -n aiterminal npm run test:run`
- Keep tests focused and fixtures inline

### Rust Tests
- Tests in `src-tauri/src/tests/` or inline with `#[cfg(test)]`
- Run: `conda run -n aiterminal cargo test`
- Use `#[tokio::test]` for async tests

## Configuration & Tooling

### Environment Setup
- **Node.js**: 20.19+ or 22.12+ (see `.nvmrc`)
- **Conda Environment**: `aiterminal` (contains Node.js, Rust toolchain)
- **Tauri**: v2.x
- **React**: v18.x
- **TypeScript**: v5.x

### Key Config Files
- `tauri.conf.json`: Tauri app configuration
- `vite.config.ts`: Vite bundler configuration
- `tsconfig.json`: TypeScript configuration
- `Cargo.toml`: Rust dependencies

### User Settings (`~/.config/aiterminal/settings.json`)
```json
{
  "ai": {
    "model": "claude-3-5-sonnet-20241022",
    "provider": "anthropic",
    "mode": "agent",
    "apiKey": "sk-...",
    "embedding_model": "text-embedding-3-small"
  },
  "autocomplete": {
    "enable_menu": true
  }
}
```

## Performance Optimizations

### Frontend
- **Conversation History**: Sliding window (8 messages) + auto-summarization → 60-80% token reduction
- **Streaming Buffer**: Batches text chunks → 70-90% fewer re-renders
- **Context Ranking**: Keyword-based relevance scoring
- **Smart Context**: Embedding-based retrieval for large contexts
- **Tool Progress**: Unique `toolCallId` prevents duplicate executions

### Backend
- **PTY Reader**: Async event-driven output capture
- **File Operations**: Streaming for large files
- **Caching**: File read cache within agent turns


## Debugging Tips

### Frontend Debugging
- Use browser DevTools (cmd+opt+I in Tauri window)
- Check console for React errors
- Use React DevTools extension
- Logger: `src/utils/logger.ts` with categories

### Backend Debugging
- Rust logs printed to terminal running `tauri dev`
- Use `eprintln!()` for debug output
- Check `~/.config/aiterminal/` for persisted data

### PTY Debugging
- Look for `__AITERM_START_` and `__AITERM_END_` markers in terminal
- Check `pty-data:${terminalId}` events in browser console
