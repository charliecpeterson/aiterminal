# AI Terminal User Guide

Welcome to AI Terminal! This guide documents the features and shortcuts available in the application.

## Features

### 1. Shell Integration & Markers
The terminal detects when commands start and finish (bash and zsh supported).
- **Markers**: When shell integration is active, a visual indicator appears in the gutter (left side) for every command.
  - **Grey**: Command is running.
  - **Green**: Command finished successfully (Exit Code 0).
  - **Red**: Command failed (Non-zero Exit Code).
- **Command Timing**: Automatic timing tracking for all commands
  - **Duration Display**: Click any marker to see execution time (e.g., "⏱️ 1.23s")
  - **Smart Formatting**: Shows seconds for quick commands, minutes for longer ones
  - **Color Coding**: Green for successful commands, red for errors
  - **Always Available**: Works automatically with shell integration, no configuration needed
- **Remote sessions**: AI Terminal automatically wraps `ssh` with `aiterm_ssh` using an exported bash function. This enables markers on remote hosts automatically. The integration works for:
  - Interactive typing: `ssh user@host`
  - Scripts: Any script that calls `ssh` (functions are exported with `export -f`)
  - Remote shells: Supports both bash and zsh on remote hosts
- **How it works**: `aiterm_ssh` injects shell integration (bash_init.sh) into the remote session via base64 encoding. The remote shell:
  1. Decodes and validates the integration script
  2. Sources user's existing `.bashrc` or `.zshrc` (preserves customizations)
  3. Sets up OSC 133 command markers and OSC 1337 SSH detection
  4. Falls back to normal ssh if integration fails
- **SSH detection**: When connected via SSH, the terminal label changes from "Local" to "🔒 user@host" using OSC 1337;RemoteHost sequences.
- **Privilege changes (`su`)**: `su` is **not** overridden by default. `su` implementations vary (util-linux, busybox, BSD), and wrapper-based bootstrapping can silently fail. If you need markers after `su`, the sustainable approach is to install the integration in that target account (see “Remote install” below).
- **Containers**: In AI Terminal, interactive `docker` / `podman` and `apptainer` shells attempt to bootstrap integration so markers keep working inside long container sessions.
- **Remote bootstrap safety**: The SSH helper is sent as a base64 payload; if it fails to decode or validate, the session falls back to a normal login shell without markers.
- **Bypassing the wrapper**: To use plain ssh without integration, run `command ssh user@host` or `\ssh user@host`.
- **Debugging hooks**: Set `AITERM_HOOK_DEBUG=1` before launching a shell to print which hook path is used (bash `PROMPT_COMMAND` array vs string, zsh hook install).

#### Technical Details: SSH Integration
The SSH integration uses exported bash functions to intercept ssh calls:

1. **Function export**: Both `aiterm_ssh` and `ssh` functions are exported with `export -f`, making them available in:
   - Interactive shells (when you type commands)
   - Non-interactive scripts (when scripts call ssh)
   - Subshells and child processes
   
2. **Shell detection**: On remote hosts, the integration detects whether the remote shell is bash or zsh:
   - **Bash**: Uses `--rcfile` to load integration directly
   - **Zsh**: Uses `zsh -c` to source user's `.zshrc` first, then the integration script
   
3. **OSC sequences**: The integration sends terminal control sequences:
   - **OSC 133**: Command markers (A=prompt start, C=output start, D=command done with exit code)
   - **OSC 1337;RemoteHost**: SSH session info (user@host:ip format)
   - **OSC 633;H**: Hostname label for display
   
4. **Environment detection**: Checks `SSH_CONNECTION`, `SSH_CLIENT`, and `SSH_TTY` environment variables to determine if the session is remote

This architecture ensures SSH integration works reliably across different shells, execution contexts, and remote configurations without requiring system-level modifications or permanent files on remote hosts.

#### Remote install (recommended for HPC reliability)
If you frequently SSH into the same accounts, install the integration script on the remote side once. This avoids relying on SSH bootstrapping tricks and is more resilient across long sessions.

- Run: `aiterm_install_remote user@host`
- What it does:
  - Copies `~/.config/aiterminal/bash_init.sh` to `user@host:~/.config/aiterminal/bash_init.sh`
  - Appends a single `source ~/.config/aiterminal/bash_init.sh` line to the remote `~/.bashrc` and `~/.zshrc` (idempotent)

Notes:
- Requires `ssh` and `scp` availability.
- Targets bash/zsh initialization (`~/.bashrc`, `~/.zshrc`). Other shells may require manual setup.

If markers are missing in a particular environment, you can still manually select output text or use the copy tools for the nearest marker.

### 2. Command Block Interaction & Output Management
AI Terminal provides powerful ways to interact with command output, inspired by modern IDEs.

#### Click-to-Highlight (Cursor IDE Style)
- **Click anywhere in a command's output**: The entire command block (prompt → command → output) gets highlighted with a subtle background.
- **Floating Action Button**: A "View in Window" button appears in the top-right corner of highlighted blocks.
- **Quick Dismissal**: Click elsewhere in the terminal to remove the highlight.

#### Large Output Viewer
For commands that generate lots of output, use the Output Viewer window:
- **Trigger**: Click "View in Window" button on any highlighted command block.
- **Features**:
  - **Separate Window**: Opens output in a dedicated popup window
  - **Search**: Built-in search bar to find text in large outputs
  - **Line Numbers**: Optional line numbering for reference
  - **Export**: Save output to a file with native file dialog
  - **Syntax**: Displays output in a clean, readable format
- **Use Cases**: Log file dumps, large JSON responses, build outputs, test results

#### Smart Copy (Marker Menu)
Clicking a command marker opens a context menu with options:
- **Copy Command Only**: Copies just the command text (e.g., `ls -la`)
- **Copy Output Only**: Copies just the output generated by that command
- **Add to AI Context**: Add command/output to the AI Panel context
- **Command Timing**: Shows execution duration (e.g., "⏱️ 1.23s • Exit: 0")
  - Displayed for all completed commands
  - Color-coded: green for success (exit 0), red for errors
  - Formats as seconds (e.g., "1.23s") or minutes (e.g., "2m 15s") for longer commands

### 3. AI Panel
The AI Panel provides context-aware assistance alongside the terminal with powerful automated tool execution.

#### Interface
- **Toggle**: Use the AI Panel button in the top bar or press `Cmd + B` (macOS) / `Ctrl + B` (Windows/Linux).
- **Detach**: Pop the panel into its own window and reattach when needed.
- **Chat Tab**: Send prompts and see responses stream in with markdown formatting.
- **Context Tab**: Staged context items can be previewed, removed, or cleared.

#### AI Capabilities & Tools
The AI assistant has access to 16 powerful tools that execute automatically to help you:

**File Operations**
1. **execute_command** - Run any shell command in your current terminal directory
   - Examples: Check versions, run git commands, install packages, view logs
   - Dangerous commands (rm, sudo, etc.) require approval when enabled in settings

2. **read_file** - Read and analyze file contents
   - Examples: Check package.json, read configuration files, examine logs
   - Supports text files up to 50KB by default

3. **write_file** - Create new files or overwrite existing ones
   - Examples: Create config files, generate scripts, fix code files
   - Overwrites require approval when enabled

4. **append_to_file** - Add content to the end of a file
   - Examples: Add to logs, update lists, append notes
   - Creates file if it doesn't exist

5. **list_directory** - Browse directory contents
   - Shows files and subdirectories
   - Works with absolute paths

6. **tail_file** - Read the last N lines of a file
   - More efficient than reading entire large log files
   - Default: 50 lines, configurable

7. **make_directory** - Create directories (and parents if needed)
   - Examples: Set up project structure, create nested folders

**Search & Discovery**
8. **search_files** - Find files by name pattern or content
   - Glob patterns for filenames (e.g., `*.ts`, `**/*.json`)
   - Content search across files

**Git Operations**
9. **git_status** - Get current branch, staged files, uncommitted changes
   - Helps AI understand your git repository state

10. **get_git_diff** - Show uncommitted changes
    - See what's been modified before committing

**System & Process**
11. **find_process** - Search for running processes by name
    - Examples: Find node processes, check for running servers
    - Useful for debugging "port already in use" errors

12. **check_port** - Check if a network port is in use
    - Shows which process is using the port
    - Common for debugging port conflicts

13. **get_system_info** - Get OS, architecture, and disk space
    - Useful for environment debugging

14. **get_environment_variable** - Check environment variables
    - Examples: PATH, HOME, custom variables

**Utilities**
15. **calculate** - Evaluate mathematical expressions
    - Examples: Unit conversions, sizing calculations
    - Supports arithmetic and math functions

16. **web_search** - Generate search URLs for documentation
    - Suggests Google searches when external info is needed
    - Cannot actually browse but provides helpful links

#### Command Approval System
Dangerous commands are protected by an interactive approval system:

- **Settings**: Enable/disable in Settings → AI → "Require approval before executing commands"
- **Safe by Default**: Enabled by default for security
- **Automatic Detection**: Commands like `rm`, `sudo`, `dd`, `chmod`, `kill`, etc. are flagged
- **Approval UI**: When a dangerous command is detected:
  1. Execution pauses immediately
  2. Approval card appears showing command, reason, and working directory
  3. Click **✓ Run** to execute or **✗ Cancel** to deny
  4. AI receives result or denial and continues accordingly
- **Safe Commands**: Read-only commands (pwd, ls, cat, grep, etc.) run automatically
- **Transparency**: All tool executions are logged in the console for debugging

#### Multi-Step Tool Execution
The AI can automatically chain multiple tools together to accomplish complex tasks:
- **Example**: "What files are in my current directory?"
  1. AI calls `execute_command("pwd")` to get your location
  2. AI calls `list_directory("/your/path")` with the result
  3. AI generates a formatted response with the file list

- **Example**: "Find the main TypeScript file and show me the first 20 lines"
  1. AI searches for `*.ts` files
  2. AI identifies the main file
  3. AI reads and displays the relevant portion

The AI can perform up to 5 sequential tool calls per request, allowing it to solve complex tasks autonomously.

#### Features
- **Streaming Responses**: Text appears in real-time as the AI generates it
- **Markdown Rendering**: Responses include formatted text, links, tables, code blocks, and emphasis
- **Code Block Copy**: Each code block includes a copy button for easy use
- **Automatic Tool Execution**: Tools run automatically with full transparency
- **Command Approval**: Dangerous commands pause for user approval (configurable)
- **Cancel Requests**: Stop AI requests mid-stream with the Cancel button
- **Export Chat**: Download conversation history as markdown file with native save dialog
- **Terminal Context Aware**: AI knows your current terminal directory for accurate file operations
- **Context Management**: Add commands, outputs, files, or selections to provide context for AI queries
- **Tool Execution Status**: See pending approvals with command preview and working directory

#### Adding Context
- **Capture Last N**: Capture the last N completed commands/outputs from your terminal
- **Add File Path**: Capture file contents using a path and size cap (works over SSH)
- **Selection Capture**: Select text in the terminal and use "Add Selection to Context"
- **Marker Context**: Click any command marker and choose "Add to AI Context"

#### Example Prompts
Try these to see the AI's capabilities:

**File Operations**
- "What files are in my current directory?"
- "Read the package.json and tell me what scripts are available"
- "Create a new config.json file with default settings"
- "Add a TODO item to my notes.txt file"
- "Show me the last 100 lines of the error log"
- "Create a new src/components folder"

**Git Operations**
- "What's my current git branch and status?"
- "Show me what changes I haven't committed yet"
- "Check if I have any uncommitted changes"

**System & Debugging**
- "Check if Node.js is installed and what version"
- "Is port 8080 in use? What's using it?"
- "Find all node processes running"
- "What's my system architecture and OS version?"

**Search & Discovery**
- "Find all TypeScript files in src/"
- "Search for TODO comments in this project"
- "Show me what's in the README file"
- "List all Python files in the current directory"

**Code & Scripts**
- "Write a simple hello world script in Python"
- "Fix the syntax error in app.js"
- "Create a .gitignore file for a Node.js project"

**Calculations & Utilities**
- "How many kilobytes is 1048576 bytes?"
- "Calculate 15% of 250"
- "What's the square root of 144?"

### 4. Font Zooming
Adjust the text size to your preference. The terminal window automatically reflows text when zooming.

### 5. Search
Find text within your terminal buffer.
- Press `Cmd + F` to open the search bar.
- Type to highlight matches.
- Press `Enter` for next match, `Shift + Enter` for previous.

### 6. Scrolling & Scrollbar
- Mouse wheel/trackpad scrolling is supported. A visible right-hand scrollbar overlay appears; you can click or drag it to move through the buffer.
- If system scrollbars are hidden (e.g., macOS auto-hide), the overlay ensures you still see position and can drag to scroll.

### 7. Clickable Links
URLs in the terminal are automatically detected.
- **Hover**: The link will be underlined.
- **Click**: Opens the link in your default browser.

### 8. Tabs
Manage multiple terminal sessions in a single window.
- **New Tab**: Press `Cmd + T` to open a new tab.
- **Close Tab**: Press `Cmd + W` or click the `×` icon on the tab.
- **Exit**: Typing `exit` in the shell will close the current tab.
- **Close App**: Closing the last tab will close the application.
- **Running Command Indicators**: Tabs with active commands show a "⏳" icon with elapsed time
  - **Real-Time Updates**: Elapsed time updates every second (e.g., "⏳ 2:15")
  - **Visual Feedback**: Indicator pulses with a subtle animation
  - **Multi-Tab Monitoring**: Easily see which background tabs have running commands
  - **Long-Running Tasks**: Especially useful when running builds, tests, or servers in background tabs

### 9. Quick Actions
Save and execute sequences of commands with a single click. Perfect for repetitive tasks, deployment workflows, or testing routines.

#### Features
- **Sequential Execution**: Commands run one after another in your active terminal
- **Popup Window**: Dedicated Quick Actions manager (accessible via toolbar button)
- **CRUD Operations**: Add, edit, delete, and execute command sequences
- **Persistent Storage**: Actions saved to `~/.config/aiterminal/quick-actions.json`
- **Collapsible Lists**: Actions with more than 5 commands show first 5, expandable on click
- **Active Terminal Detection**: Automatically runs in whichever terminal tab/pane is focused

#### Using Quick Actions
1. **Open**: Click "⚡ Quick Actions" button in the top toolbar
2. **Create**: Click "+ Add Action", enter:
   - **Name**: Descriptive label (e.g., "Build & Test")
   - **Commands**: One command per line
3. **Execute**: Click "▶ Execute" on any action to run all commands sequentially
4. **Edit/Delete**: Use the Edit or Delete buttons to manage actions

#### Example Use Cases
**Development Workflow**
```
git pull
npm install
npm run build
npm test
```

**Deployment**
```
npm run build
scp -r dist/ user@server:/var/www/
ssh user@server 'sudo systemctl restart nginx'
```

**System Maintenance**
```
brew update
brew upgrade
brew cleanup
```

**Multi-Service Startup**
```
docker-compose up -d
npm run dev
open http://localhost:3000
```

#### Notes
- Commands execute regardless of individual failures (no stop-on-error currently)
- Each command waits for the previous to complete before starting
- All output appears in the active terminal in real-time
- Quick Actions window can remain open while commands execute

### 10. Command History Navigator
Quickly jump to any previous command in your terminal history with a searchable, keyboard-driven overlay.

#### Features
- **Fast Access**: Press `Cmd + R` or click "📜 History" button in top toolbar
- **Fuzzy Search**: Type to filter commands instantly
- **Keyboard Navigation**: Arrow keys to select, Enter to jump
- **Command Details**: 
  - Exit code indicator (✓ for success, ✗ for errors)
  - Relative timestamps (e.g., "2m ago", "1h ago")
  - Output availability indicator
- **Multiple Actions**:
  - **Jump**: Navigate to command in terminal buffer (Enter or click)
  - **Copy**: Copy command + output to clipboard (`Cmd + C` or "Copy" button)
  - **Add to AI**: Send command + output to AI Panel context (`Cmd + A` or "+ AI" button)

#### Using Command History
1. **Open**: Press `Cmd + R` or click "📜 History" in top toolbar
2. **Search**: Type to filter commands (e.g., "git", "npm", "ls")
3. **Navigate**: Use ↑/↓ arrow keys to select different commands
4. **Actions**:
   - Press **Enter** to jump to that command in the terminal
   - Press **Cmd + C** to copy command + output to clipboard
   - Press **Cmd + A** to add command + output to AI context
   - Press **Escape** to close the menu
   - Click any action button for quick access

#### Example Workflows
**Debug Failed Command**
1. Press `Cmd + R`
2. Type part of the failed command (e.g., "npm build")
3. See the error exit code (✗ 1)
4. Press `Cmd + A` to add to AI context
5. Ask AI: "Why did this build fail?"

**Re-run Past Command**
1. Press `Cmd + R`
2. Search for command (e.g., "docker")
3. Jump to it with Enter
4. Copy the command text and modify as needed

**Share Command Output**
1. Press `Cmd + R`
2. Find the command with the output you need
3. Press `Cmd + C` to copy command + full output
4. Paste in documentation, tickets, or chat

#### Notes
- Shows last 50 commands from current terminal session
- Uses existing marker system (requires shell integration)
- Works per-terminal (each tab/pane has its own history)
- Exit codes and timestamps come from OSC 133 sequences
- Overlay appears centered and dismisses on click outside

### 11. File Preview
View and monitor files directly from the terminal with live rendering in a separate window. Perfect for viewing documentation, logs, HTML previews, or any text-based files.

#### Features
- **Command-Line Preview**: Use `aiterm_render <file>` to open any file in a dedicated preview window
- **Multiple Formats**: Supports Markdown, R Markdown, Quarto, HTML, PDFs, Jupyter notebooks, Word documents, JSON, YAML, LaTeX, reStructuredText, AsciiDoc, images, and plain text files
- **Remote File Support**: Works seamlessly over SSH - file content is transferred automatically
- **Clean Rendering**:
  - **Markdown**: Full GitHub-flavored markdown with syntax highlighting for code blocks
  - **R Markdown (.rmd)**: Rendered as markdown with R code chunks displayed as code blocks
  - **Quarto (.qmd)**: Rendered as markdown with multi-language code chunks
  - **HTML**: Sandboxed iframe rendering with proper styling
  - **PDFs**: Native browser PDF viewer with zoom, search, and navigation
  - **Jupyter Notebooks**: Full notebook rendering with markdown cells, code cells, and outputs (including plots)
  - **Word Documents (.docx)**: Converted to HTML with formatting, tables, images, and styles preserved
  - **JSON**: Interactive tree view with collapsible nodes, syntax highlighting, and object size indicators
  - **YAML**: Parsed and displayed as interactive tree view with collapsible nodes
  - **LaTeX (.tex)**: Source view with monospace formatting for reviewing LaTeX documents
  - **reStructuredText (.rst)**: Source view for Sphinx and Python documentation
  - **AsciiDoc (.adoc, .asciidoc)**: Full HTML rendering with proper formatting
  - **Images**: PNG, JPG, GIF, SVG, WebP, BMP, ICO with proper scaling and transparency
  - **Text**: Monospace display for logs, configs, and other plain text
- **Auto-Detection**: File type detected automatically from extension
- **Separate Window**: Preview opens in its own window, keeping your terminal clean

#### Using File Preview
```bash
# Preview markdown files
aiterm_render README.md
aiterm_render docs/guide.md

# Preview R Markdown files
aiterm_render analysis.rmd
aiterm_render report.rmd

# Preview Quarto documents
aiterm_render presentation.qmd
aiterm_render manuscript.qmd

# Preview LaTeX documents
aiterm_render paper.tex
aiterm_render thesis.latex

# Preview reStructuredText
aiterm_render documentation.rst
aiterm_render index.rst

# Preview AsciiDoc
aiterm_render manual.adoc
aiterm_render guide.asciidoc

# Preview HTML files
aiterm_render index.html
aiterm_render report.html

# Preview PDFs
aiterm_render document.pdf
aiterm_render report.pdf

# Preview Word documents
aiterm_render report.docx
aiterm_render proposal.docx

# Preview Jupyter notebooks
aiterm_render analysis.ipynb
aiterm_render experiment.ipynb

# Preview images
aiterm_render screenshot.png
aiterm_render logo.svg
aiterm_render diagram.jpg

# Preview JSON/YAML with collapsible tree view
aiterm_render config.json
aiterm_render docker-compose.yml
aiterm_render settings.yaml

# Preview text/log files
aiterm_render server.log
aiterm_render config.txt
```

#### Remote Files (SSH)
The preview feature works transparently across SSH connections:
```bash
ssh user@server
cd /var/log
aiterm_render nginx/access.log
```

The file content is automatically:
1. Read on the remote machine (wherever you're currently SSH'd)
2. Base64 encoded and transferred through the terminal
3. Decoded and rendered in a local preview window

No temporary files needed - everything happens through the terminal connection!

#### Supported File Types
- **Markdown**: `.md`, `.markdown`, `.rmd` (R Markdown), `.qmd` (Quarto)
- **HTML**: `.html`, `.htm`
- **PDF**: `.pdf`
- **Word Documents**: `.docx`
- **Jupyter Notebook**: `.ipynb`
- **LaTeX**: `.tex`, `.latex`
- **reStructuredText**: `.rst`
- **AsciiDoc**: `.adoc`, `.asciidoc`, `.asc`
- **JSON**: `.json` (with collapsible tree view and syntax highlighting)
- **YAML**: `.yaml`, `.yml` (with collapsible tree view and syntax highlighting)
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.bmp`, `.ico`
- **Text**: Any other extension (`.txt`, `.log`, `.conf`, `.json`, etc.)

#### Notes
- Preview windows are independent - you can open multiple files simultaneously
- File path can be relative or absolute
- The `aiterm_render` command is available automatically with shell integration
- Hot reload is not currently supported (close and re-open to see file changes)
- For remote files, the file must be readable by your SSH user

#### Example Workflows

**Debugging Configuration Files**:
```bash
# View JSON config with collapsible tree
aiterm_render package.json
aiterm_render tsconfig.json

# View YAML configs
aiterm_render .github/workflows/ci.yml
aiterm_render docker-compose.yml
```
**Documentation Review**
```bash
# Clone a repo and preview the README
git clone https://github.com/user/repo
cd repo
aiterm_render README.md
```

**Log Monitoring**
```bash
# Check application logs
ssh prod-server
aiterm_render /var/log/app/error.log
```

**HTML Preview**
```bash
# Build and preview static site
npm run build
aiterm_render dist/index.html
```

**Configuration Review**
```bash
# Review remote server config
ssh admin@server
aiterm_render /etc/nginx/nginx.conf
```

**Image Review**
```bash
# View generated charts or diagrams
python generate_chart.py
aiterm_render output/chart.png

# Check screenshots from remote server
ssh user@server
aiterm_render ~/screenshots/error-state.png
```

**PDF Documents**
```bash
# Review generated reports
aiterm_render quarterly-report.pdf

# View documentation
ssh docs-server
aiterm_render /var/docs/manual.pdf
```

**Jupyter Notebooks**
```bash
# Review data analysis notebooks
aiterm_render data-exploration.ipynb

# Check notebook outputs from remote server
ssh jupyter-server
aiterm_render ~/notebooks/experiment-results.ipynb
```

**R Markdown & Quarto**
```bash
# Preview R Markdown reports (source view)
aiterm_render statistical-analysis.rmd

# Preview Quarto documents
aiterm_render research-paper.qmd
aiterm_render presentation.qmd

# Review documents from remote R server
ssh rstudio-server
aiterm_render ~/projects/report.rmd
```

**LaTeX & Technical Documentation**
```bash
# Review LaTeX source before compilation
aiterm_render paper.tex
aiterm_render chapter1.tex

# Preview reStructuredText documentation
aiterm_render index.rst
aiterm_render api_reference.rst

# Review AsciiDoc technical docs
aiterm_render user-guide.adoc

# Check documentation on remote server
ssh docs-server
aiterm_render ~/sphinx-docs/index.rst
```

## Keyboard Shortcuts

| Action | Shortcut (macOS) | Shortcut (Windows/Linux) |
|--------|------------------|--------------------------|
| **New Tab** | `Cmd` + `T` | `Ctrl` + `T` |
| **Close Tab** | `Cmd` + `W` | `Ctrl` + `W` |
| **Zoom In** | `Cmd` + `+` (or `=`) | `Ctrl` + `+` (or `=`) |
| **Zoom Out** | `Cmd` + `-` | `Ctrl` + `-` |
| **Reset Zoom** | `Cmd` + `0` | `Ctrl` + `0` |
| **Find** | `Cmd` + `F` | `Ctrl` + `F` |
| **Toggle AI Panel** | `Cmd` + `B` | `Ctrl` + `B` |
| **Command History** | `Cmd` + `R` | `Ctrl` + `R` |
| **Open Settings** | `Cmd` + `,` | `Ctrl` + `,` |
| **Copy** | `Cmd` + `C` | `Ctrl` + `C` |
| **Paste** | `Cmd` + `V` | `Ctrl` + `V` |

## Configuration
The terminal creates a configuration directory at `~/.config/aiterminal/`.
- **`bash_init.sh`**: Shell integration script automatically generated and loaded by the terminal. Provides command markers, OSC sequences, and SSH integration features.
- **`ssh_helper.sh`**: Contains the `aiterm_ssh` function that handles remote shell integration bootstrap.
- **`.zshrc`**: Zsh initialization script that sources bash_init.sh for local zsh sessions.
- **`settings.json`**: Application settings including appearance, fonts, and AI configuration.
- **`quick-actions.json`**: Saved Quick Actions with command sequences.

The integration files are embedded in the application binary and written to disk on first launch or when updated.

## AI Settings
Open Settings → AI to configure providers and models.
- **Providers**: OpenAI (recommended), Anthropic, Gemini, Ollama
- **Models**: Any model that supports function calling/tool use
  - OpenAI: gpt-4, gpt-4o, gpt-4-turbo, gpt-3.5-turbo
  - Requires tool calling support for automatic command execution
- **API Key**: Required for cloud providers (OpenAI, Anthropic, Gemini)
- **Custom URL**: Override base API endpoints (useful for Ollama or proxies)
- **Test Connection**: Validates credentials and populates model dropdowns
- **Command Approval**: Enable/disable approval requirement for dangerous commands
  - When enabled: Commands like `rm`, `sudo`, `chmod` require user approval
  - When disabled: All commands execute automatically (use with caution)
  - Safe commands (ls, pwd, cat, grep) always run automatically

### Technical Implementation
The AI system is built on:
- **Vercel AI SDK v5** for robust streaming and tool execution
- **Automatic Tool Calling**: 16 tools execute seamlessly to accomplish tasks
- **Multi-Step Execution**: Up to 5 sequential tool calls per request using `stopWhen`
- **Approval System**: Promise-based blocking for dangerous command approval
- **Terminal Integration**: Uses `get_pty_cwd` to determine your actual working directory
- **Type-Safe**: Tool schemas validated with Zod for reliable execution
- **Cancellation**: AbortController-based request cancellation
- **Export**: Native file system integration for saving conversations

## Troubleshooting

### Terminal Markers
- **Markers not showing (local)?** Open a fresh tab so the helper re-sources; bash and zsh are supported.
- **Markers not showing (remote)?** Use `aiterm_ssh <user@host>` (or plain `ssh` is already aliased to it inside AI Terminal). If the remote blocks sourcing, bypass with `\ssh` to avoid the alias.
- **Markers missing after `su`/restricted shells?** Install integration into that account with `aiterm_install_remote` (or manually add `source ~/.config/aiterminal/bash_init.sh` in that account's `~/.bashrc`/`~/.zshrc`). Some environments intentionally scrub environment variables; in those cases, exact command markers may not be available.

### AI Panel
- **Blank AI responses?** Ensure your AI settings are configured with a valid API key and model that supports tool calling.
- **AI not using tools?** Check that you're using a model with function calling support (e.g., gpt-4, gpt-4o, gpt-4-turbo, not base models).
- **Wrong directory for commands?** The AI automatically detects your terminal's working directory. If issues persist, try `cd` to refresh.
- **Tool execution errors?** Check console logs (View → Developer → Developer Tools) for detailed error messages.
- **Connection errors?** Verify your API key and internet connection. Test with the "Test Connection" button in Settings.
- **Command not executing after approval?** Check console for errors. The approval system waits for your decision before proceeding.
- **Dangerous commands running without approval?** Verify "Require approval for commands" is enabled in Settings → AI.
- **Export not working?** Ensure the fs and dialog plugins are properly initialized (check console for errors).
- **Can't cancel request?** The Cancel button appears while sending. If it's unresponsive, check for network issues or refresh the app.

### General
- **Copy not working?** The app uses the system clipboard. Ensure you have granted permission if prompted.
- **Scrollbar missing?** The app renders its own overlay. If you still don't see it, ensure you're in the terminal area and the buffer is longer than the viewport; try scrolling once to reveal it.
- **Performance issues?** Try closing unused tabs or clearing the terminal buffer (`Cmd + K`).

### Quick Actions
- **Actions not executing?** Ensure you have an active terminal tab/pane focused.
- **Commands running in wrong terminal?** Click the terminal where you want commands to run before executing the action.
- **Quick Actions window not opening?** Check if the window is hidden behind other windows or off-screen.
- **Actions not persisted?** Check that `~/.config/aiterminal/quick-actions.json` is writable.

### Command History
- **No history showing?** Command history requires shell integration (markers) to be active. Open a fresh terminal tab if markers aren't appearing.
- **History incomplete?** Only commands with markers appear. Some bootstrap/login commands may not be captured.
- **Can't copy output?** Ensure the command has output (look for "has output" indicator in the history item).
- **Search not working?** Try exact phrases or command keywords rather than output content.

### File Preview
- **`aiterm_render` command not found?** Shell integration must be active. Open a fresh terminal tab or restart your terminal session.
- **Preview window not opening?** Check console logs (View → Developer → Developer Tools) for errors. Ensure the file exists and is readable.
- **File content not displaying?** Verify the file has content and isn't binary. Only text-based files are supported (markdown, HTML, text).
- **Remote file preview fails?** Ensure `base64` or `openssl` is available on the remote system for encoding. Check that the file path is correct and readable.
- **Garbled content?** File may be binary or use incompatible encoding. Preview is designed for UTF-8 text files.
- **Multiple preview windows?** Each `aiterm_render` call opens a new window. Close unused windows manually.
