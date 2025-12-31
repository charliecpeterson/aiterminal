# SSH Session Panel - Standalone Window Implementation

## Overview
The SSH Session Panel has been converted from a sidebar panel to a standalone window, similar to the AI Panel. This provides a better user experience with more space for managing SSH profiles and connections.

## Architecture

### Components

#### SSHSessionWindow.tsx
- **Purpose**: Main component for the standalone SSH window
- **Location**: Loads at `/#/ssh-panel` route
- **Features**:
  - Profile editor modal
  - SSH session panel with full width
  - Event emission to main window for connections
  
#### Communication Flow
```
SSH Window                    Main Window
-----------                   -----------
User clicks "Connect"
  ↓
emitTo("main", "ssh:connect", {profile})
                                ↓
                         listen("ssh:connect")
                                ↓
                         connectSSHProfile()
                                ↓
                         Spawn PTY & open tab
```

### Window Management

#### Opening the SSH Window
- **Keyboard**: `Cmd/Ctrl + Shift + O`
- **Function**: `openSSHPanelWindow()` in App.tsx
- **Behavior**: 
  - If window already exists, focuses it
  - Otherwise creates new window at `/#/ssh-panel`
  - Default size: 350x600px, resizable

#### Window Lifecycle
- SSH window closes automatically when main window closes
- Uses `WebviewWindow.getByLabel("ssh-panel")` for window management
- Independent state from main window

## Event System

### From SSH Window → Main Window

#### `ssh:connect`
- **Payload**: `{ profile: SSHProfile }`
- **Action**: Connects to SSH profile in a new tab
- **Handler**: Calls `connectSSHProfile(profile)`

#### `ssh:connect-new-tab`
- **Payload**: `{ profile: SSHProfile }`
- **Action**: Same as `ssh:connect` (both create new tabs)
- **Handler**: Calls `connectSSHProfile(profile)`

#### `ssh:goto-tab`
- **Payload**: `{ profileId: string }`
- **Action**: Switches focus to the tab containing the PTY for this profile
- **Handler**: Calls `handleGoToTab(profileId)`

## File Changes

### New Files
- `src/components/SSHSessionWindow.tsx` - Main SSH window component
- `src/components/SSHSessionWindow.css` - Window-specific styles

### Modified Files

#### src/App.tsx
**Added:**
- `isSSHWindow` route detection
- `openSSHPanelWindow()` function
- Event listeners for `ssh:connect`, `ssh:connect-new-tab`, `ssh:goto-tab`
- SSH window close handler in main window cleanup

**Removed:**
- `showSSHPanel` state
- SSH sidebar toggle button
- Inline SSHSessionPanel in sidebar
- SSH-specific handler functions (moved to SSH window)

#### src/components/SSHSessionPanel.tsx
**Added:**
- `standalone` prop for full-window mode
- CSS class `ssh-panel-standalone` when standalone=true

## User Experience Improvements

### Before (Sidebar)
- Limited width (300px)
- Takes space from terminal
- Toggles visibility, losing context
- Harder to manage many profiles

### After (Standalone Window)
- Full window width (350px default, resizable)
- Doesn't block terminal view
- Always-on-top option (OS-level)
- Can move to second monitor
- Better organization for large profile lists

## Usage Example

```typescript
// User presses Cmd/Ctrl+Shift+O
openSSHPanelWindow()

// New window opens at /#/ssh-panel
// SSHSessionWindow renders with SSHProfilesContext

// User clicks "Connect" on a profile
handleConnect(profile) {
  emitTo("main", "ssh:connect", { profile })
}

// Main window receives event
listen("ssh:connect", async (event) => {
  await connectSSHProfile(event.payload.profile)
})

// New tab opens with SSH connection
// ptyToProfileMap links PTY ID → Profile ID
// Connection health tracking begins
```

## Benefits

1. **Better UX**: Separate window doesn't obstruct terminal view
2. **Consistency**: Matches AI Panel pattern (both are detached windows)
3. **Flexibility**: Can resize, move to second monitor, minimize independently
4. **Cleaner Code**: Clear separation between main window and SSH management
5. **Scalability**: More space for growing profile lists

## Testing

```bash
npm run tauri dev

# Test cases:
1. Press Cmd/Ctrl+Shift+O → SSH window opens
2. Press again → SSH window focuses (doesn't duplicate)
3. Create profile → Saves to ~/.config/aiterminal/ssh_profiles.json
4. Click "Connect" → New tab opens in main window
5. Close main window → SSH window closes automatically
6. Click "Go to Tab" → Main window switches to correct tab
```

---

**Migration Note**: Users upgrading from sidebar version will see no functional changes, just a better window-based experience. All profiles and settings remain compatible.
