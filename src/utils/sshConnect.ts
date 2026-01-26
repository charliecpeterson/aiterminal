import { invoke } from '@tauri-apps/api/core';
import { SSHProfile } from '../types/ssh';

/**
 * Build SSH command string from profile
 */
export function buildSSHCommand(profile: SSHProfile): string {
  let sshCommand = 'ssh ';
  
  // Add options to enable interactive password/keyboard auth
  sshCommand += '-o BatchMode=no -o PreferredAuthentications=publickey,keyboard-interactive,password ';

  // Add custom SSH options/flags
  if (profile.sshOptions && profile.sshOptions.length > 0) {
    for (const option of profile.sshOptions) {
      if (option.trim()) {
        sshCommand += `${option.trim()} `;
      }
    }
  }

  // Add port forwarding flags
  if (profile.portForwards && profile.portForwards.length > 0) {
    for (const forward of profile.portForwards) {
      if (forward.type === 'local' && forward.remoteHost && forward.remotePort) {
        // Local forward: -L localPort:remoteHost:remotePort
        sshCommand += `-L ${forward.localPort}:${forward.remoteHost}:${forward.remotePort} `;
      } else if (forward.type === 'remote' && forward.remoteHost && forward.remotePort) {
        // Remote forward: -R remotePort:remoteHost:localPort
        sshCommand += `-R ${forward.remotePort}:${forward.remoteHost}:${forward.localPort} `;
      } else if (forward.type === 'dynamic') {
        // Dynamic forward (SOCKS proxy): -D localPort
        sshCommand += `-D ${forward.localPort} `;
      }
    }
  }

  if (profile.connectionType === 'ssh-config' && profile.sshConfigHost) {
    // Use SSH config host - simplest case
    sshCommand += profile.sshConfigHost;
  } else if (profile.connectionType === 'manual' && profile.manualConfig) {
    const { hostname, username, port, identityFile, proxyJump } = profile.manualConfig;

    // Build manual SSH command with options
    if (identityFile) {
      sshCommand += `-i "${identityFile}" `;
    }
    if (proxyJump) {
      sshCommand += `-J ${proxyJump} `;
    }
    if (port && port !== 22) {
      sshCommand += `-p ${port} `;
    }

    sshCommand += `${username}@${hostname}`;
  } else {
    throw new Error('Invalid profile configuration');
  }

  return sshCommand;
}

/**
 * Connect to SSH profile by writing commands to PTY
 * Returns a promise that resolves when SSH command is sent
 */
export async function connectSSHProfile(
  ptyId: number,
  profile: SSHProfile
): Promise<void> {
  // Build and send SSH command
  const sshCommand = buildSSHCommand(profile);
  await invoke('write_to_pty', { id: ptyId, data: sshCommand + '\n' });

  // If there are startup commands, send them after a delay
  // (allowing time for SSH connection to establish)
  if (profile.startupCommands && profile.startupCommands.length > 0) {
    // Wait for SSH to connect (simple delay - could be improved with prompt detection)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Send each startup command
    for (const cmd of profile.startupCommands) {
      if (cmd.trim()) {
        await invoke('write_to_pty', { id: ptyId, data: cmd + '\n' });
        // Small delay between commands
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
}

/**
 * Connect SSH profile in a new tab
 * Returns the new PTY ID
 */
export async function connectSSHProfileNewTab(profile: SSHProfile): Promise<number> {
  // Spawn new PTY
  const ptyId = await invoke<number>('spawn_pty');

  // Connect to SSH
  await connectSSHProfile(ptyId, profile);

  return ptyId;
}

/**
 * Get display name for profile (for tab title)
 */
export function getProfileDisplayName(profile: SSHProfile): string {
  if (profile.name) {
    return profile.name;
  }
  
  if (profile.connectionType === 'ssh-config' && profile.sshConfigHost) {
    return profile.sshConfigHost;
  }
  
  if (profile.manualConfig) {
    return `${profile.manualConfig.username}@${profile.manualConfig.hostname}`;
  }
  
  return 'SSH Session';
}
