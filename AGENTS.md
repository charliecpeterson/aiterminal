# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the React + TypeScript frontend. UI components live in `src/components/`, hooks in `src/hooks/`, app wiring in `src/app/`, and shared helpers in `src/utils/`.
- `src-tauri/` contains the Rust backend, Tauri config, and shell integration scripts (see `src-tauri/shell-integration/`).
- `tests/` contains Vitest specs such as `tests/text.test.ts`.
- `public/` and `src/assets/` hold static assets; user docs live in `docs/`.

### AI System Architecture
- `src/ai/` contains the AI assistant implementation:
  - `tools-vercel.ts`: 22 tool definitions using Vercel AI SDK + Zod schemas
  - `chatSend-vercel.ts`: Streaming chat with automatic tool execution (up to 15 steps)
  - `prompts.ts`: System prompts with tool capabilities and workflows
  - `conversationHistory.ts`: Sliding window with auto-summarization to reduce token costs
  - `streamingBuffer.ts`: Batches text chunks to reduce UI re-renders by 70-90%
  - `contextRanker.ts`: Ranks context items by relevance to user query
  - `smartContext.ts`: Embedding-based context retrieval for large contexts
  
- `src-tauri/src/tools/`: Rust implementations of AI tools
  - `commands.rs`: All tool commands (file ops, error analysis, git, system info)
  - Each tool uses `validate_path()` for security
  - Tools support both local and remote (SSH) execution

## Build, Test, and Development Commands
- `npm ci` installs pinned dependencies (recommended for reproducible builds).
- `npm run dev` starts the Vite frontend dev server.
- `npm run tauri dev` runs the full Tauri desktop app in dev mode.
- `npm run build` type-checks and builds the frontend.
- `npm run preview` serves the production build locally.
- `npm run test` runs Vitest in watch mode; `npm run test:run` runs once.

## Coding Style & Naming Conventions
- TypeScript/React uses 2-space indentation and double quotes (see `src/main.tsx`).
- Rust follows rustfmt defaults (4-space indentation).
- Components are `PascalCase.tsx` (e.g., `src/components/SSHSessionPanel.tsx`).
- Hooks are `use*.ts` (e.g., `src/terminal/hooks/useLatencyProbe.ts`).
- Styles are plain `.css` files colocated with components.

## Testing Guidelines
- Framework: Vitest; tests live in `tests/` and use `*.test.ts` naming.
- Prefer focused unit tests for utilities and AI helpers; keep fixtures small and inline.
- Run `npm run test:run` before opening a PR.

## AI Tools Implementation Guide

### Adding New Tools
When adding a new AI tool, you need to modify 3-4 files:

**1. Rust Backend (`src-tauri/src/tools/commands.rs`)**
```rust
#[tauri::command]
pub async fn your_tool_name_tool(
    param: String,
    working_directory: Option<String>,
) -> Result<YourReturnType, String> {
    // Validate paths for security
    let safe_path = validate_path(Path::new(&param))?;
    
    // Implement tool logic
    // ...
    
    Ok(result)
}
```

**2. Register in Tauri (`src-tauri/src/lib.rs`)**
- Add to `use tools::{ ... }` imports
- Add to `.invoke_handler(tauri::generate_handler![ ... ])`

**3. TypeScript Tool Definition (`src/ai/tools-vercel.ts`)**
```typescript
your_tool: tool({
  description: `Clear description with examples and use cases`,
  inputSchema: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async ({ param }) => {
    const cwd = await getTerminalCwd(terminalId);
    const result = await invoke<ReturnType>('your_tool_name_tool', {
      param,
      workingDirectory: cwd,
    });
    return formatResult(result);
  },
}),
```

**4. Update System Prompt (`src/ai/prompts.ts`)**
- Add tool to capabilities list
- Update workflow section if needed

### Tool Best Practices
- **Security**: Always use `validate_path()` for file paths in Rust
- **Working Directory**: Pass `workingDirectory` from TypeScript to support SSH
- **Error Handling**: Return descriptive errors, never panic
- **Size Limits**: Implement limits for batch operations (e.g., max 20 files)
- **Documentation**: Include examples in tool descriptions
- **Return Format**: Return human-readable strings, not JSON (AI parses text better)

### Current Tool Categories
1. **File Operations** (11): read, write, append, replace, info, multi-read, list, tail, mkdir
2. **Search** (2): search_files, grep_in_files  
3. **Error Analysis** (1): analyze_error (extracts files, line numbers, stack traces)
4. **Git** (2): status, diff
5. **System** (4): find_process, check_port, system_info, env_var
6. **Utilities** (2): calculate, web_search

## Commit & Pull Request Guidelines
- No enforced commit message convention is evident in history; use clear, imperative summaries.
- PRs should include a brief problem/solution summary, test command(s) run, and screenshots for UI changes.
- Keep PRs focused; split large refactors from feature work when possible.

## Configuration & Tooling Notes
- Node.js 20.19+ (or 22.12+) is required; `.nvmrc` is provided.
- Tauri config lives in `src-tauri/tauri.conf.json`; avoid editing without validating a `tauri dev` run.
- AI settings stored in `~/.config/aiterminal/settings.json`
- Shell integration scripts in `~/.config/aiterminal/bash_init.sh`

## Performance Optimizations
- **Conversation History**: Sliding window (8 recent messages) + auto-summarization saves 60-80% tokens
- **Streaming Buffer**: Batches text updates to reduce React re-renders by 70-90%
- **Context Ranking**: Keyword-based relevance scoring prevents sending irrelevant context
- **Smart Context**: Embedding-based retrieval for large contexts (requires embedding model)
- **Tool Progress Tracking**: Unique `toolCallId` prevents duplicate tool executions

