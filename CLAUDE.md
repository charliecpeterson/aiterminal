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
    - `chatSend-vercel.ts`: Streaming chat with tool execution (max 15 steps)
    - `prompts.ts`: System prompts with tool capabilities
    - `conversationHistory.ts`: Sliding window + auto-summarization
    - `streamingBuffer.ts`: Batches chunks to reduce re-renders by 70-90%
    - `contextRanker.ts`: Relevance scoring for context items
    - `smartContext.ts`: Embedding-based context retrieval
  - **`src/terminal/`**: Terminal logic
    - `core/executeInPty.ts`: **PTY command execution with markers**
    - `ui/markers.ts`: Command block visualization & menu system
    - `hooks/`: Terminal-related React hooks
  - **`src/context/`**: React context providers
  - **`src/utils/`**: Shared utilities
  - **`src/hooks/`**: Reusable React hooks

### Backend (Rust + Tauri)
- **`src-tauri/`**: Rust backend
  - **`src/tools/commands.rs`**: AI tool implementations (file ops, git, system)
  - **`src/pty/`**: PTY management (spawn, read, write)
  - **`src/ssh/`**: SSH profile management
  - **`src/settings.rs`**: App settings persistence
  - **`src/lib.rs`**: Main library, Tauri handlers
  - **`shell-integration/`**: Shell init scripts for bash/zsh

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

## AI Tools Implementation Guide

### Architecture: TypeScript → Rust → PTY

AI tools follow this flow:
1. **AI decides** to use a tool (via Vercel AI SDK)
2. **TypeScript execute()** function runs in `tools-vercel.ts`
3. **Two execution paths**:
   - **Path A (PTY)**: Call `executeCommand()` → `executeInPty()` → Runs in user's terminal
   - **Path B (Tauri)**: Call `invoke('tool_name_tool')` → Rust backend (local only!)

### ⚠️ Path Selection Guide

**Use PTY (Path A) when:**
- Command needs to run in user's environment (SSH, containers, etc.)
- Reading shell history, checking processes, running shell commands
- Anything that should respect the user's current session

**Use Tauri invoke (Path B) when:**
- Reading/writing files (uses Rust file API, respects `working_directory`)
- Operations that work both locally and remotely via working directory
- Git operations, system info, error analysis

### Adding New Tools (Step-by-Step)

#### 1. Rust Backend (`src-tauri/src/tools/commands.rs`)

```rust
/// Description of what this tool does
#[tauri::command]
pub async fn your_tool_name_tool(
    param: String,
    working_directory: Option<String>,
) -> Result<String, String> {
    // For file paths: validate security
    let safe_path = validate_path(Path::new(&param))?;
    
    // Determine working directory
    let work_dir = working_directory.unwrap_or_else(|| {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .to_string_lossy()
            .to_string()
    });
    
    // Implement tool logic
    // Return human-readable string, not JSON
    
    Ok(format!("Result: {}", result))
}
```

#### 2. Register in Tauri (`src-tauri/src/lib.rs`)

```rust
// Add to imports at top
use tools::{ 
    /* existing tools */,
    your_tool_name_tool,
};

// Add to invoke_handler
.invoke_handler(tauri::generate_handler![
    /* existing handlers */,
    your_tool_name_tool,
])
```

#### 3. TypeScript Tool Definition (`src/ai/tools-vercel.ts`)

```typescript
your_tool_name: tool({
  description: `Clear description of what this tool does.
Include examples and use cases.

Examples:
- Use case 1: example input
- Use case 2: example input`,
  
  inputSchema: z.object({
    param: z.string().describe('Parameter description'),
    optional_param: z.number().optional().describe('Optional parameter'),
  }),
  
  execute: async ({ param, optional_param }) => {
    const terminalId = await getActiveTerminalId();
    
    try {
      // Get working directory for remote execution support
      const cwd = await getTerminalCwd(terminalId);
      
      // Call Rust backend
      const result = await invoke<string>('your_tool_name_tool', {
        param,
        optionalParam: optional_param,
        workingDirectory: cwd,  // ← CRITICAL for SSH support
      });
      
      return result;
    } catch (error) {
      return `Error: ${error}`;
    }
  },
}),
```

#### 4. Update System Prompt (`src/ai/prompts.ts`)

Add tool to capabilities list and update workflow examples if needed.

### Tool Best Practices

✅ **DO:**
- Use `validate_path()` for all file paths in Rust
- Pass `workingDirectory` from TypeScript for SSH support
- Return human-readable strings, not JSON
- Include examples in tool descriptions
- Implement size limits (e.g., max 20 files in batch operations)
- Handle errors gracefully with descriptive messages
- Use `executeCommand()` for shell commands that need PTY

❌ **DON'T:**
- Use Rust file I/O without `working_directory` (breaks SSH)
- Call Rust `invoke()` for commands that need PTY (like shell history)
- Return raw JSON (AI parses text better)
- Panic or unwrap in Rust tools (return Result)
- Read large files without truncation

### Current Tool Categories (22 tools)

1. **Terminal Commands** (1): `execute_command` - Run shell commands in PTY
2. **File Operations** (11): read, write, append, replace, read_sections, file_info, list_files, read_multiple, tail_file, find_errors_in_file, create_directory
3. **Search** (2): search_files, grep_in_files  
4. **Error Analysis** (1): analyze_error (extracts files, line numbers, stack traces)
5. **Git** (2): git_status, git_diff
6. **System** (5): find_process, check_port, system_info, get_env_var, get_shell_history
7. **Utilities** (2): calculate, web_search

### Recent Tool Changes

- ✅ **Menu trigger changed**: Now uses **Shift+Click** (not single click)
- ✅ **Cursor styling fixed**: Text cursor by default, pointer only on links/markers
- ✅ **Shell history tool**: Uses `executeCommand()` (PTY path) for SSH support

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
