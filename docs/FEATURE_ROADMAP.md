# AI Terminal Feature Roadmap



## High-Priority Features for Everyday Use

### 1. **Session Persistence & Restore** ⭐⭐⭐
**Priority**: Critical for productivity
**Why**: Losing all tabs/history on restart is painful for sysadmins
**Implementation**:
- Save state: working directories, command history (last 1000 commands), tab layout
- Restore on launch: reopen tabs in same directories
- Optional: restore command history per tab
- Store in: `~/.config/aiterminal/session.json`

**Benefit**: Resume work instantly after restart/crash

### 2. **Split Panes** ⭐⭐⭐
**Priority**: Essential for power users
**Why**: Monitor logs while running commands, compare outputs side-by-side
**Implementation**:
- Vertical/horizontal splits within tabs
- Keybindings: `Cmd+D` (vertical), `Cmd+Shift+D` (horizontal)
- Navigate: `Cmd+[` / `Cmd+]` or `Cmd+Arrow`
- Each pane has own PTY, independent scrollback

**Benefit**: No more juggling multiple windows

### 3. **Command Palette** ⭐⭐
**Priority**: High for discoverability
**Why**: Makes all features accessible, reduces learning curve
**Implementation**:
- Fuzzy search all commands: "split", "new tab", "AI chat", "settings"
- Show keybindings next to each command
- Recently used commands at top
- Trigger: `Cmd+Shift+P` or `Cmd+K`

**Benefit**: Discover and access features without memorizing shortcuts

## Advanced Features for Sysadmins

### 4. **Session Broadcast Mode** ⭐⭐⭐
**Priority**: Critical for managing fleets
**Why**: Update configuration on 10+ servers simultaneously
**Implementation**:
- Checkbox in UI: "Broadcast input to all tabs"
- Optional: Select specific tabs to broadcast to
- Visual indicator when active (red border?)
- Safety: Confirm before broadcasting destructive commands

**Use cases**:
- Update packages on multiple servers
- Check status across cluster
- Deploy configuration changes

### 5. **Automatic Session Logging** ⭐⭐
**Priority**: Important for compliance/debugging
**Why**: Audit trails, troubleshooting, compliance requirements
**Implementation**:
- Optional per-tab or global logging
- Save to: `~/.config/aiterminal/logs/{date}/{tab-name}.log`
- Include: all output, timestamps, exit codes
- Format: Plain text or structured JSON
- Settings: retention policy (30 days default)

**Benefit**: Never lose important output, create audit trails

### 6. **Visual Bell for Background Tabs** ⭐⭐
**Priority**: Important for monitoring
**Why**: Know when long-running command completes or errors
**Implementation**:
- Detect: BEL character, specific regex patterns, exit codes
- Visual: Tab title color change, icon badge with count
- Optional: System notifications
- Configurable: which events trigger notifications

**Use cases**:
- Monitor build/deployment in background tab
- Watch for errors in log tails
- Get notified when SSH connection drops

### 7. **Port Forwarding Manager** ⭐
**Priority**: Nice-to-have for SSH users
**Why**: Managing SSH tunnels via CLI is tedious
**Implementation**:
- GUI panel showing active forwards
- Add new: Local port → Remote host:port
- Types: Local (-L), Remote (-R), Dynamic (-D)
- Auto-establish when connecting to saved SSH hosts
- Show status: connected/failed/listening

**Benefit**: Simplify accessing remote services


## HPC-Specific Features

### 8. **HPC Job Integration (Slurm/PBS)** ⭐⭐⭐
**Priority**: Critical for HPC sysadmins
**Why**: Constant context-switching between terminal and job management
**Implementation**:
- Quick Actions for common commands:
  - "Show My Jobs" → `squeue -u $USER`
  - "Node Status" → `sinfo`
  - "Job Details" → Parse job ID from context
- AI-aware job IDs: Click job in output → "Show logs", "Cancel", "Hold"
- Job status notifications: Badge on tab when job starts/completes/fails
- Smart sbatch editor: Templates with AI-suggested resources
- Job output streaming: Auto-tail job output files

**Use cases**:
- Monitor multiple jobs across tabs
- Quick cancel/hold from any context
- AI helps debug job failures

### 9. **SSH Connection Health & Recovery** ⭐⭐⭐
**Priority**: Critical for remote work reliability
**Why**: Lost SSH connections = lost work context
**Implementation**:
- Visual indicators in tab title:
  - Hostname/cluster name
  - Connection latency (updated every 30s)
  - Connection age/uptime
- Auto-reconnect on drops:
  - Exponential backoff (1s, 2s, 4s, 8s...)
  - Preserve working directory
  - Show reconnection attempts
- Session warnings:
  - "Connection idle 30min - may time out"
  - "High latency detected (>500ms)"
- Jump host manager:
  - Save SSH configs with ProxyJump
  - One-click complex SSH chains

**Benefit**: Never lose connection context, immediate visibility of session health

### 10. **Command Blocks with Edit & Re-run** ⭐⭐⭐
**Priority**: Critical for iterative work
**Why**: Warp's killer feature - edit commands without retyping
**Implementation**:
- Click any command marker → Opens edit box
- Multi-line support for scripts
- Press Enter → Runs modified command
- History per marker: See all variations you tried
- Quick edits: Change parameters inline
- For HPC: Edit sbatch scripts, tweak resource requests
- Copy variations to other tabs

**Use cases**:
- Tweak long commands iteratively
- Fix typos without retyping
- Adjust resource requests quickly

**Benefit**: 10x faster iteration on complex commands

### 11. **Saved Commands / Snippets Library** ⭐⭐⭐
**Priority**: High for repetitive workflows
**Why**: Sysadmins run same commands constantly
**Implementation**:
- Command library with tagging:
  - Tags: `#ssh`, `#slurm`, `#debug`, `#monitoring`
  - Search by tag or fuzzy text
- Templates with variables:
  - `ssh ${USER}@${HOST}`
  - `sbatch --partition=${PARTITION} --time=${TIME} job.sh`
  - Fill variables on use
- Share snippets:
  - Export/import JSON for team
  - Built-in library of common HPC commands
- AI-suggested snippets:
  - "You've run this 10 times, save it?"
  - AI generates description and tags
- Keyboard shortcut: `Cmd+Shift+S` to save current command

**Use cases**:
- Save complex SSH jump commands
- Template sbatch configurations
- Share team runbooks

### 12. **Environment Modules Integration** ⭐⭐
**Priority**: Important for HPC users
**Why**: Module systems (lmod/environment-modules) are ubiquitous in HPC
**Implementation**:
- Visual indicator: Show loaded modules in tab status
- Quick action: "Load Common Environment"
  - Predefined module sets per project
  - One-click: `module load gcc/11 openmpi/4.1 python/3.9`
- Save module sets:
  - "ML Workflow" → gcc, cuda, python, pytorch
  - "Simulation" → gcc, openmpi, hdf5
- AI context: Include loaded modules in prompts
  - Better command suggestions based on available tools
- Auto-load: Load module set when connecting to specific hosts

**Benefit**: Manage complex module dependencies easily

### 13. **Output Folding for Large Results** ⭐⭐
**Priority**: Important for HPC workloads
**Why**: HPC commands produce massive outputs (1000s of lines)
**Implementation**:
- Auto-collapse outputs >1000 lines
- Show: "First 50 lines / Last 50 lines / [Expand 2847 hidden lines]"
- Fold by sections:
  - Separate stdout/stderr
  - Fold by pattern (stack traces, repeated lines)
- Jump to errors/warnings:
  - Scan for "Error:", "Warning:", "FATAL"
  - Quick-jump buttons
- Configurable threshold in settings

**Use cases**:
- Tame verbose build outputs
- Review slurm logs efficiently
- Find errors in massive outputs

### 14. **Session Bookmarks & Profiles** ⭐⭐
**Priority**: High for managing multiple environments
**Why**: HPC users juggle dev/staging/prod/compute nodes
**Implementation**:
- Save SSH sessions with metadata:
  - Name: "prod-db", "dev-cluster", "compute-node-42"
  - Connection string
  - Environment: module loads, env vars
  - Startup commands: cd to project, activate venv
- One-click reconnect
- Session groups: "ML Project" opens 3 connections
- Visual organization:
  - Color-code by environment type
  - Icons for different clusters
- Quick switcher: `Cmd+O` → fuzzy search bookmarks

**Benefit**: Instant context switching between environments


## Warp-Inspired Productivity Features

### 15. **Workflows (Command Sequences)** ⭐⭐
**Priority**: High for repetitive tasks
**Why**: Many tasks are multi-step sequences
**Implementation**:
- Define workflows as named command sequences:
  ```
  Workflow: "Deploy to Prod"
  1. ssh prod-server
  2. cd /opt/app
  3. git pull
  4. systemctl restart app
  5. Check status
  ```
- Run entire workflow with one click
- Pause between steps for review
- Handle errors: continue/abort on failure
- Variables in workflows: `Deploy to ${ENV}`
- AI generates workflows:
  - Analyze command history
  - "You run these 4 commands together often, make a workflow?"

**Use cases**:
- Deployment procedures
- Debugging runbooks
- System health checks

### 16. **Notebook Mode** ⭐
**Priority**: Nice-to-have for documentation
**Why**: Turn investigations into shareable docs
**Implementation**:
- Mix markdown notes with executable commands
- Save as `.terminal` file format
- Sections: Markdown cells + Command cells
- Click command → Runs and captures output
- Share with team: "Here's how I debugged the crash"
- AI fills in explanations:
  - Describe what each command does
  - Explain output
  - Add troubleshooting notes

**Benefit**: Executable documentation, knowledge sharing

### 17. **Smart Search & History** ⭐⭐
**Priority**: High for finding past work
**Why**: "What was that command I ran last week?"
**Implementation**:
- Search across all tabs and sessions
- Filters:
  - By host: "Commands on prod-server"
  - By exit code: "Failed commands"
  - By date range: "Last 7 days"
  - By output pattern: "Contains 'ERROR'"
- Saved searches: "My failed deploys this month"
- Timeline view: Visual history across sessions
- `Cmd+R`: Enhanced reverse search with filters

**Use cases**:
- "When did I last restart nginx?"
- "Find all DB migrations I ran"
- "Show failed commands this week"

### 18. **File Transfer Hints & Quick Actions** ⭐
**Priority**: Nice-to-have for SSH workflows
**Why**: Moving files between local/remote is tedious
**Implementation**:
- Detect file operations: `cat file.log`, `less config.yaml`
- Show button: "Download this file"
- Background scp/sftp transfer
- "Edit locally" mode:
  - Download file
  - Open in default editor
  - Watch for changes
  - Auto-upload on save
- Drag-drop files onto terminal:
  - Generates `scp` command
  - Shows upload progress

**Benefit**: Seamless local/remote file workflow


## Quick Wins (Easy to Implement)

1. **Tab Renaming**: Right-click tab → rename (better than "Terminal 1")
2. **Working Directory in Tab Title**: Show `~/projects/ai-terminal`
3. **Exit Code Visual Indicator**: Red/green dot on command marker
4. **Copy with Full Context**: Include command + output + timestamp in clipboard
5. **Command Execution Timing**: Show duration next to each marker
6. **Tab Icons/Emojis**: Customize tab with emoji for quick visual identification
7. **Custom Tab Colors**: Color-code production/staging/dev environments
8. **Clipboard History**: Access last 10 copied items
9. **Tab Zoom**: Cmd+Scroll to adjust font size per tab
10. **LLM-Powered Command Line Autocomplete**: AI suggestions for command completion (Ctrl+Space or Tab)
   - Send partial command + context to LLM
   - Display as ghost text
   - Fast inference (<200ms) using existing AI providers or local Ollama
11. **Quick SSH Profiles**: Save frequently used SSH connections
12. **URL Detection**: Cmd+Click to open URLs in browser (already implemented?)
13. **Working Directory Breadcrumbs**: Show full path in status bar with folder navigation
14. **Reconnect to SSH**: Auto-retry on connection drops
15. **Search History**: Cmd+R for reverse search across all tabs
16. **Export Session**: Save current tab as script with all commands


## Implementation Priority (Recommended Order)

### Phase 1: Foundation (Weeks 1-2)
1. **Saved Commands/Snippets Library** - Immediate productivity boost, builds on existing UI
2. **Command Blocks with Edit & Re-run** - Killer feature, leverage existing markers
3. **Tab Renaming & Working Directory Display** - Quick wins, better UX

### Phase 2: HPC Core (Weeks 3-4)
4. **HPC Job Integration** - Slurm/PBS quick actions
5. **SSH Connection Health Indicators** - Visual feedback, auto-reconnect
6. **Session Bookmarks & Profiles** - Save common SSH setups

### Phase 3: Power Features (Weeks 5-6)
7. **Broadcast Mode** - Fleet management
8. **Output Folding** - Handle large HPC outputs
9. **Environment Modules Integration** - HPC workflow essential

### Phase 4: Polish (Weeks 7-8)
10. **Workflows** - Multi-command sequences
11. **Smart Search & History** - Enhanced Cmd+R
12. **File Transfer Hints** - SSH file operations
13. **Session Persistence** - Save and restore all tabs

### Phase 5: Advanced (Future)
14. **Notebook Mode** - Executable documentation
15. **Command Palette** - Unified command access
16. **Automatic Session Logging** - Audit trails

2. **LLM-Powered Command Line Autocomplete**: AI suggestions for command completion (Ctrl+Space or Tab)
   - Send partial command + context to LLM
   - Display as ghost text
   - Fast inference (<200ms) using existing AI providers or local Ollama
3. **Custom Tab Colors**: Color-code production/staging/dev environments
4. **Quick SSH Profiles**: Save frequently used SSH connections
5. **Clipboard History**: Access last 10 copied items
6. **URL Detection**: Cmd+Click to open URLs in browser
7. **Working Directory Breadcrumbs**: Show full path in status bar with folder navigation
8. **Reconnect to SSH**: Auto-retry on connection drops
9. **Tab Zoom**: Cmd+Scroll to adjust font size per tab
10. **Search History**: Cmd+R for reverse search across all tabs
11. **Export Session**: Save current tab as script with all commands


## Technical Considerations

### Session Persistence
- Use SQLite or JSON for state storage
- Store: tab positions, working dirs, last 1000 commands per tab
- Encryption: Optional password protection for saved API keys
- Migration: Version schema for future updates

### Split Panes
- Use CSS Grid for layout management
- Each pane = separate `Terminal` component instance
- Shared: Settings, AI context
- Independent: PTY, scrollback, search

### Broadcast Mode
- Fan-out input events to multiple PTYs
- Implement pause/resume per tab
- Safety: Confirmation dialog for `rm`, `shutdown`, destructive commands
- Visual: Highlight which tabs are receiving broadcast

### Port Forwarding
- Integrate with SSH configuration
- Store forwards in settings: `~/.config/aiterminal/forwards.json`
- Monitor port status using netstat/lsof
- Auto-cleanup on disconnect

### HPC Job Integration
- Use Tauri commands to execute squeue/sinfo
- Parse job output (JSON format if available: `squeue --json`)
- Store job tracking state per tab
- Background polling for job status updates (configurable interval)

### Command Blocks Edit & Re-run
- Leverage existing marker system
- Add contentEditable div or textarea overlay on click
- Store edit history per marker (last 5 variations)
- Preserve command context (cwd, env) when re-running

### Session Bookmarks
- Extend settings.json schema:
  ```json
  {
    "bookmarks": [
      {
        "name": "Prod DB",
        "type": "ssh",
        "command": "ssh user@prod-db.example.com",
        "env": {"TERM": "xterm-256color"},
        "modules": ["gcc/11", "python/3.9"],
        "startup_commands": ["cd /opt/app", "source venv/bin/activate"],
        "color": "#ff6b6b"
      }
    ]
  }
  ```
- UI: Bookmark manager modal or sidebar
- Quick launcher: Fuzzy search bookmarks

### SSH Connection Health
- Backend: Periodic TCP keepalive or dummy command
- Latency probe: `echo` command every 30s, measure RTT
- Store metrics per PTY session
- Frontend: Display in tab title or status bar
- Reconnect: Detect broken pipe, retry with stored connection string
