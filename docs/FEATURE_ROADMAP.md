# AI Terminal Feature Roadmap

## Current Latency Implementation Analysis

### What It Measures Now
- **Frontend ↔ Rust IPC round-trip**: `invoke('ping')` → Rust returns "ok" → measures time
- **Typical values**: 1-5ms for local terminal (basically instant)
- **Problem**: Doesn't measure actual shell/PTY responsiveness or SSH network latency

### What It Should Measure
- **PTY echo latency**: Send invisible control sequence to shell, measure time until echo received
- **Useful for**:
  - Detecting slow SSH connections
  - Identifying network issues
  - Monitoring remote server responsiveness
  - Warning users about high latency before commands fail

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

### 8. **Improved Latency Monitoring** ⭐
**Priority**: Nice-to-have, especially for remote work
**Why**: Current implementation only measures IPC, not actual PTY latency
**Implementation**:
```rust
// Send invisible OSC sequence to shell
// Measure time until we receive the echo back
async fn measure_pty_latency(pty_id: u32) -> Result<u32, String> {
    let seq_id = uuid::Uuid::new_v4();
    let osc_probe = format!("\x1b]51;probe;{}\x07", seq_id);
    
    // Write probe to PTY
    write_to_pty(pty_id, osc_probe)?;
    
    // Listen for echo with timeout
    // Return elapsed time in milliseconds
}
```
- Send control sequence that shell ignores but echoes
- Measure round-trip time
- Update UI with real latency
- Useful thresholds: <50ms (good), 50-150ms (okay), >150ms (slow)

**Benefit**: Actual network latency visibility for SSH

## Quick Wins (Easy to Implement)

1. **Tab Reordering**: Drag-and-drop tabs to reorder
2. **Custom Tab Colors**: Color-code production/staging/dev environments
3. **Quick SSH Profiles**: Save frequently used SSH connections
4. **Clipboard History**: Access last 10 copied items
5. **URL Detection**: Cmd+Click to open URLs in browser
6. **Working Directory Breadcrumbs**: Show full path in status bar with folder navigation
7. **Reconnect to SSH**: Auto-retry on connection drops
8. **Tab Zoom**: Cmd+Scroll to adjust font size per tab
9. **Search History**: Cmd+R for reverse search across all tabs
10. **Export Session**: Save current tab as script with all commands

## Implementation Priority

**Phase 1 (Core Productivity)**: 
- Session Persistence
- Split Panes
- Command Palette

**Phase 2 (Power User)**:
- Broadcast Mode
- Visual Bell
- Session Logging

**Phase 3 (Polish)**:
- Port Forwarding Manager
- Improved Latency
- Quick Wins

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

## Competitive Analysis

**What other terminals have that we should match**:
- iTerm2: Split panes, session restore, broadcast input, color presets
- Warp: AI command search, workflow blocks, team sharing
- Hyper: Plugin ecosystem, customization
- Alacritty: Performance, minimal overhead

**Our advantages**:
- ✅ Built-in AI chat with context capture
- ✅ Command markers with output separation
- ✅ Intelligent context extraction
- ✅ Modern React UI with extensibility
- ⚠️ Need: Session persistence, splits, broadcast

**Differentiation strategy**: 
- Focus on AI-powered workflows
- Smart context for sysadmin tasks
- Make complex operations simple (SSH, monitoring, deployments)
