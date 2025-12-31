# SSH Session Panel - Integration Guide

## Overview

The SSH Session Panel feature has been implemented with:
- ✅ TypeScript types for SSH profiles and connection health
- ✅ Rust backend for parsing `~/.ssh/config` and storing profiles
- ✅ React context for profile management
- ✅ Sidebar panel component with groups and status indicators
- ✅ Profile editor modal with SSH config integration

## Quick Start

### 1. Wrap your app with SSHProfilesProvider

```tsx
// In your main App.tsx or similar
import { SSHProfilesProvider } from './context/SSHProfilesContext';

function App() {
  return (
    <SSHProfilesProvider>
      {/* Your app components */}
    </SSHProfilesProvider>
  );
}
```

### 2. Add SSH Session Panel to your layout

```tsx
import { SSHSessionPanel } from './components/SSHSessionPanel';
import { SSHProfileEditor } from './components/SSHProfileEditor';
import { useSSHProfiles } from './context/SSHProfilesContext';
import { SSHProfile } from './types/ssh';
import { useState } from 'react';

function MyLayout() {
  const { addProfile, updateProfile } = useSSHProfiles();
  const [showEditor, setShowEditor] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SSHProfile | undefined>();

  const handleConnect = (profile: SSHProfile) => {
    // TODO: Generate SSH command and open in new tab
    console.log('Connect to:', profile);
    
    // Build SSH command
    let sshCommand = 'ssh ';
    
    if (profile.connectionType === 'ssh-config') {
      // Use SSH config host
      sshCommand += profile.sshConfigHost;
    } else if (profile.manualConfig) {
      // Build manual SSH command
      const { hostname, username, port, identityFile, proxyJump } = profile.manualConfig;
      
      if (identityFile) {
        sshCommand += `-i ${identityFile} `;
      }
      if (proxyJump) {
        sshCommand += `-J ${proxyJump} `;
      }
      if (port && port !== 22) {
        sshCommand += `-p ${port} `;
      }
      
      sshCommand += `${username}@${hostname}`;
    }
    
    // TODO: Send to PTY in new tab
    // After connection, run startup commands:
    if (profile.startupCommands && profile.startupCommands.length > 0) {
      // Send each command after connection is established
      profile.startupCommands.forEach(cmd => {
        console.log('Startup command:', cmd);
        // TODO: Write to PTY: writeToTab(newTabId, cmd + '\n');
      });
    }
    
    // Update connection stats
    updateProfile(profile.id, {
      lastConnectedAt: new Date().toISOString(),
      connectionCount: (profile.connectionCount || 0) + 1,
    });
  };

  const handleNewProfile = () => {
    setEditingProfile(undefined);
    setShowEditor(true);
  };

  const handleEditProfile = (profile: SSHProfile) => {
    setEditingProfile(profile);
    setShowEditor(true);
  };

  const handleSaveProfile = async (profile: SSHProfile) => {
    if (editingProfile) {
      await updateProfile(profile.id, profile);
    } else {
      await addProfile(profile);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* SSH Panel Sidebar */}
      <div style={{ width: '300px', borderRight: '1px solid #333' }}>
        <SSHSessionPanel
          onConnect={handleConnect}
          onEditProfile={handleEditProfile}
          onNewProfile={handleNewProfile}
        />
      </div>

      {/* Main content */}
      <div style={{ flex: 1 }}>
        {/* Your terminal tabs here */}
      </div>

      {/* Profile Editor Modal */}
      <SSHProfileEditor
        profile={editingProfile}
        isOpen={showEditor}
        onClose={() => setShowEditor(false)}
        onSave={handleSaveProfile}
      />
    </div>
  );
}
```

## API Reference

### Types

```typescript
interface SSHProfile {
  id: string;
  name: string;
  icon?: string;
  group?: string;
  tabColor?: string;
  connectionType: 'ssh-config' | 'manual';
  sshConfigHost?: string;
  manualConfig?: {
    hostname: string;
    username: string;
    port?: number;
    identityFile?: string;
    proxyJump?: string;
  };
  startupCommands?: string[];
  envVars?: Record<string, string>;
  autoConnect?: boolean;
  healthCheckInterval?: number;
  alertOnDisconnect?: boolean;
  createdAt?: string;
  lastConnectedAt?: string;
  connectionCount?: number;
}
```

### Context Hooks

```typescript
const {
  profiles,           // SSHProfile[] - All saved profiles
  loadProfiles,       // () => Promise<void> - Reload from disk
  saveProfiles,       // (profiles) => Promise<void> - Save all
  addProfile,         // (profile) => Promise<void> - Add new
  updateProfile,      // (id, updates) => Promise<void> - Update
  deleteProfile,      // (id) => Promise<void> - Delete
  sshConfigHosts,     // SSHConfigHost[] - From ~/.ssh/config
  loadSSHConfig,      // () => Promise<void> - Reload SSH config
  connections,        // Map<string, ConnectionHealth> - Active connections
  updateConnection,   // (profileId, health) => void - Update status
  isLoading,          // boolean
  error,              // string | null
} = useSSHProfiles();
```

### Tauri Commands

```rust
// Get all hosts from ~/.ssh/config
invoke<SSHConfigHost[]>('get_ssh_config_hosts')

// Save profiles to ~/.config/aiterminal/ssh_profiles.json
invoke('save_ssh_profiles', { profiles: SSHProfile[] })

// Load saved profiles
invoke<SSHProfile[]>('load_ssh_profiles')
```

## TODO: Integration with Terminal

### 1. Connect Profile → New Tab

In your terminal management code:

```typescript
// When user clicks "Connect" on a profile
function connectProfile(profile: SSHProfile) {
  // Create new tab
  const tabId = createNewTab();
  
  // Build SSH command
  const sshCommand = buildSSHCommand(profile);
  
  // Write command to PTY
  await invoke('write_to_pty', { id: tabId, data: sshCommand + '\n' });
  
  // After SSH connects (detect prompt change), run startup commands
  if (profile.startupCommands) {
    for (const cmd of profile.startupCommands) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for prompt
      await invoke('write_to_pty', { id: tabId, data: cmd + '\n' });
    }
  }
  
  // Track connection in context
  updateConnection(profile.id, {
    profileId: profile.id,
    tabId: String(tabId),
    status: 'connected',
    connectedAt: new Date(),
  });
}
```

### 2. Track SSH Sessions → Update Connection Health

In your existing SSH detection code:

```typescript
// When you detect an SSH session in a tab
function onSSHDetected(tabId: string, hostname: string) {
  // Find matching profile
  const profile = profiles.find(p => 
    p.sshConfigHost === hostname || 
    p.manualConfig?.hostname === hostname
  );
  
  if (profile) {
    updateConnection(profile.id, {
      profileId: profile.id,
      tabId: tabId,
      status: 'connected',
      connectedAt: new Date(),
    });
  }
}

// When SSH connection drops
function onSSHDisconnected(tabId: string) {
  // Find profile by tabId
  for (const [profileId, conn] of connections.entries()) {
    if (conn.tabId === tabId) {
      updateConnection(profileId, {
        ...conn,
        status: 'disconnected',
      });
      break;
    }
  }
}
```

### 3. Latency Monitoring

```typescript
// Periodically measure latency for active SSH sessions
async function measureSSHLatency(tabId: number) {
  const latency = await invoke<number>('measure_pty_latency', { id: tabId });
  
  // Update connection health
  for (const [profileId, conn] of connections.entries()) {
    if (conn.tabId === String(tabId)) {
      updateConnection(profileId, {
        ...conn,
        latency,
        lastActivity: new Date(),
      });
      break;
    }
  }
}
```

## File Locations

```
src/
├── types/
│   └── ssh.ts                      # TypeScript types
├── context/
│   └── SSHProfilesContext.tsx      # React context & hooks
├── components/
│   ├── SSHSessionPanel.tsx         # Sidebar panel
│   ├── SSHSessionPanel.css
│   ├── SSHProfileEditor.tsx        # Editor modal
│   └── SSHProfileEditor.css

src-tauri/src/
├── ssh.rs                          # Rust SSH config parser
└── lib.rs                          # Tauri commands registered
```

## Storage

Profiles are saved to:
```
~/.config/aiterminal/ssh_profiles.json
```

SSH config is read from:
```
~/.ssh/config
```

## Next Steps

1. ✅ Basic infrastructure complete
2. ⏳ Wire up "Connect" button to terminal tabs
3. ⏳ Implement connection tracking & health monitoring
4. ⏳ Add "Go to Tab" functionality
5. ⏳ Implement auto-connect on startup
6. ⏳ Add keyboard shortcuts (Cmd+Shift+O for quick switcher)
