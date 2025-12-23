# Nested SSH & Marker Propagation Solutions

## The Problem

When you SSH into Machine A, then SSH from A to B (nested SSH):
- ✅ First SSH (local → A): Markers work, latency measured
- ❌ Second SSH (A → B): No markers, no latency info

**Why?**
1. Shell integration only bootstraps on first SSH
2. Markers use OSC sequences that might not propagate
3. PTY only communicates directly with first connection
4. Current `aiterm_ssh` only wraps the initial SSH command

## Solution 1: Auto-Detect & Re-Bootstrap (Recommended) ✨

**Concept:** Detect when user SSHs from remote and automatically inject shell integration again.

### Implementation

Update `ssh_helper.sh` to be persistent and work recursively:

```bash
# In bash_init.sh
aiterm_ssh() {
    # Works from ANY depth - local or already-remote
    if [ "$TERM_PROGRAM" != "aiterminal" ]; then 
        command ssh "$@"
        return $?
    fi

    # Re-export integration script for nested sessions
    local helper_path="$HOME/.config/aiterminal/bash_init.sh"
    local inline_script=""
    
    # Use cached version if available (faster for nested)
    if [ -n "$__AITERM_INLINE_CACHE" ]; then
        inline_script="$__AITERM_INLINE_CACHE"
    elif [ -f "$helper_path" ]; then
        inline_script="$(cat "$helper_path")"
        export __AITERM_INLINE_CACHE="$inline_script"
    else
        command ssh "$@"
        return $?
    fi

    # ... rest of aiterm_ssh logic
    # Key: It works at ANY level because TERM_PROGRAM is exported
}
```

**Benefits:**
- ✅ Works infinitely deep (A→B→C→D...)
- ✅ No infrastructure changes needed
- ✅ Markers work at all levels
- ✅ Each level reports its own host correctly

**Limitations:**
- ⚠️ Latency only measured for direct connection (B can't measure latency to A)
- ⚠️ User must use `ssh` (or wrapped version) - direct `ssh` breaks chain

### Enhanced Version: Track SSH Depth

```bash
# In bash_init.sh - track nesting level
__AITERM_SSH_DEPTH="${__AITERM_SSH_DEPTH:-0}"
export __AITERM_SSH_DEPTH=$((${__AITERM_SSH_DEPTH} + 1))

# Emit depth info for UI
__aiterm_emit_remote_host() {
    if [ -n "$SSH_CONNECTION" ]; then
        local current_user="${USER:-$(whoami)}"
        local current_host="$(hostname -f 2>/dev/null || hostname)"
        local remote_ip=$(echo "$SSH_CONNECTION" | awk '{print $3}')
        
        # Include depth in marker
        printf "\033]1337;RemoteHost=%s@%s:%s;Depth=%d\007" \
            "$current_user" "$current_host" "$remote_ip" "$__AITERM_SSH_DEPTH"
    fi
}
```

**UI Updates:**
```typescript
// In Terminal.tsx - parse depth from RemoteHost
interface PtyInfo {
    pty_type: string;
    remote_host: string | null;
    ssh_depth: number;  // NEW
    // ...
}

// Show in UI
{ptyInfo?.ssh_depth > 1 && (
  <div className="ssh-depth-indicator">
    SSH Level {ptyInfo.ssh_depth}
  </div>
)}
```

---

## Solution 2: Multiplexer-Style Control Sequences

**Concept:** Use escape sequences that propagate through nested sessions (like tmux/screen).

### How tmux Does It

```bash
# tmux uses special DCS (Device Control String) sequences
# Format: ESC P <data> ESC \
# These pass through nested sessions

__aiterm_emit_nested() {
    # DCS sequence that propagates
    printf "\033P=1s%s\033\\" "$1"
}
```

**Modify markers.ts to detect DCS:**
```typescript
// In createMarkerManager
term.parser.registerDcsHandler({ 
  intermediates: '=', 
  final: 's' 
}, (data) => {
  // Handle nested marker
  const decoded = parseDcsMarker(data);
  handleMarker(decoded);
  return true;
});
```

**Benefits:**
- ✅ Works through ANY nesting
- ✅ Standardized escape sequence method
- ✅ No SSH wrapper needed

**Limitations:**
- ⚠️ More complex implementation
- ⚠️ Need to handle both OSC and DCS
- ⚠️ Terminal emulator compatibility

---

## Solution 3: SSH Tunnel + Agent Communication

**Concept:** Run a lightweight agent on remote hosts that communicates back through SSH tunnel.

### Architecture

```
Local PTY ←→ SSH Tunnel ←→ Remote Agent
                ↓
              Markers, Events, Commands
```

### Implementation

**1. Tiny agent on remote:**
```bash
# ~/.config/aiterminal/agent.sh (auto-copied on first connect)
#!/bin/bash
AITERM_SOCKET="/tmp/aiterm-$$.sock"
mkfifo "$AITERM_SOCKET" 2>/dev/null

# Send events back through tunnel
aiterm_send() {
    echo "$1" > "$AITERM_SOCKET" &
}

# Report command completion
trap 'aiterm_send "D;$?"' DEBUG
```

**2. Establish tunnel on SSH:**
```bash
aiterm_ssh() {
    # Forward Unix socket through SSH
    command ssh -R "/tmp/aiterm-remote.sock:/tmp/aiterm-local.sock" "$@"
}
```

**3. Listen on local side:**
```rust
// In Tauri backend
async fn listen_ssh_tunnel(terminal_id: usize) {
    let socket = UnixListener::bind("/tmp/aiterm-local.sock")?;
    while let Ok((stream, _)) = socket.accept().await {
        let event = read_event(stream).await?;
        emit_to_terminal(terminal_id, event);
    }
}
```

**Benefits:**
- ✅ Full control over nested sessions
- ✅ Can send commands TO remote
- ✅ Real latency measurement at each hop
- ✅ Works even with `ssh` jumphosts

**Limitations:**
- ⚠️ Requires agent installation
- ⚠️ More complex infrastructure
- ⚠️ Firewall/security considerations

---

## Solution 4: Smart Prompt Parsing (Fallback)

**Concept:** When shell integration fails, parse PS1 to detect SSH changes.

```typescript
// In ptyListeners.ts
function detectNestedSSHFromPrompt(line: string): boolean {
    // Look for common patterns
    const patterns = [
        /^[\w-]+@([\w.-]+):/, // user@host:path
        /^\[([\w.-]+)\]/, // [hostname]
        /\(([\w.-]+)\)/, // (hostname)
    ];
    
    for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match && match[1] !== lastKnownHost) {
            // Host changed - probably nested SSH
            updateHostInfo({
                remote_host: match[1],
                ssh_depth: currentDepth + 1,
                markers_available: false // Can't rely on markers
            });
            return true;
        }
    }
    return false;
}
```

**Benefits:**
- ✅ No changes to shell integration
- ✅ Works with any SSH
- ✅ Better than nothing

**Limitations:**
- ⚠️ No markers (can't smart copy)
- ⚠️ Unreliable (depends on PS1 format)
- ⚠️ Can't measure latency

---

## Recommended Implementation Plan

### Phase 1: Make current SSH wrapper recursive (1-2 hours)
1. Export `__AITERM_INLINE_CACHE` in bash_init.sh
2. Track `__AITERM_SSH_DEPTH`
3. Test: local → remote1 → remote2 → remote3

### Phase 2: Add depth indicator in UI (30 minutes)
1. Parse depth from `RemoteHost` sequence
2. Show breadcrumb: `local → server1 → server2`
3. Indicate which level has markers

### Phase 3: DCS sequences for reliability (2-3 hours)
1. Add DCS parser to markers.ts
2. Emit both OSC and DCS from shell integration
3. Test propagation through nested sessions

### Phase 4: Advanced features (optional)
1. SSH tunnel agent (if really needed)
2. Remote command execution at any depth
3. Latency measurement per hop

---

## Quick Fix for Testing (5 minutes)

**Right now, test if markers already work:**

```bash
# On your machine
cd ~/projects/AIterminal
npm run tauri dev

# In the terminal
ssh ccp228@hoffman2.idre.ucla.edu  # Your first SSH (should work)

# Once connected to hoffman2
ssh some-other-server  # Second level

# Type a command
ls -la

# Check: Do you see the marker icons? 
# If YES → it already works! Just need depth tracking
# If NO → need Solution 1 or 2
```

**Enable debug logging to see what's happening:**
```typescript
// In ptyListeners.ts
console.log('OSC sequence received:', { type, data });
```

---

## My Recommendation

**Start with Solution 1** because:
1. Minimal code changes (~50 lines)
2. Builds on existing SSH wrapper
3. Works for 95% of use cases
4. Easy to test and debug

**Add Solution 4** as fallback:
- When markers don't work, at least show host change
- Better UX than silent failure

**Consider Solution 2 if:**
- You use lots of nested SSH
- Need guaranteed marker propagation
- Have time for more complex implementation

Want me to implement Solution 1 (recursive SSH wrapper + depth tracking) right now?
