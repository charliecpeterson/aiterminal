import { invoke } from '@tauri-apps/api/core';
import { SSHProfile } from '../types/ssh';

// SSH connection timing constants
const SSH_CONNECTION_DELAY_MS = 2000;
const STARTUP_COMMAND_DELAY_MS = 300;

// Pattern for valid SSH identifiers (hostnames, usernames, SSH config hosts)
// Allows alphanumeric, dots, hyphens, underscores, and @ for user@host patterns
const VALID_SSH_IDENTIFIER = /^[a-zA-Z0-9._@-]+$/;

// Pattern for valid port forward hosts (more permissive for localhost, IPs, etc.)
const VALID_HOST_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * Validate that a string is safe to use as an SSH identifier.
 * Prevents command injection by ensuring only safe characters.
 */
function isValidSSHIdentifier(str: string): boolean {
  return VALID_SSH_IDENTIFIER.test(str);
}

/**
 * Validate a hostname for port forwarding.
 */
function isValidHost(str: string): boolean {
  return VALID_HOST_PATTERN.test(str);
}

/**
 * Validate port number is within valid range.
 */
function isValidPort(port: number | undefined): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes and escapes embedded single quotes.
 */
function shellEscape(str: string): string {
  if (!str) return "''";
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return `'${str.replace(/'/g, "'\\''")}'`;
}

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

  // Add port forwarding flags with validation
  if (profile.portForwards && profile.portForwards.length > 0) {
    for (const forward of profile.portForwards) {
      // Validate port numbers
      if (!isValidPort(forward.localPort)) {
        throw new Error(`Invalid local port: ${forward.localPort}`);
      }
      if (forward.remotePort !== undefined && !isValidPort(forward.remotePort)) {
        throw new Error(`Invalid remote port: ${forward.remotePort}`);
      }
      // Validate remote host if present
      if (forward.remoteHost && !isValidHost(forward.remoteHost)) {
        throw new Error(`Invalid remote host for port forward: ${forward.remoteHost}`);
      }

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
    // Validate SSH config host
    if (!isValidSSHIdentifier(profile.sshConfigHost)) {
      throw new Error(`Invalid SSH config host: ${profile.sshConfigHost}`);
    }
    sshCommand += profile.sshConfigHost;
  } else if (profile.connectionType === 'manual' && profile.manualConfig) {
    const { hostname, username, port, identityFile, proxyJump } = profile.manualConfig;

    // Validate required fields
    if (!hostname || !isValidSSHIdentifier(hostname)) {
      throw new Error(`Invalid hostname: ${hostname}`);
    }
    if (!username || !isValidSSHIdentifier(username)) {
      throw new Error(`Invalid username: ${username}`);
    }

    // Build manual SSH command with options
    if (identityFile) {
      // Use shell escaping for file paths (can contain spaces, special chars)
      sshCommand += `-i ${shellEscape(identityFile)} `;
    }
    if (proxyJump) {
      // Validate proxy jump (can be user@host or just host)
      if (!isValidSSHIdentifier(proxyJump)) {
        throw new Error(`Invalid proxy jump: ${proxyJump}`);
      }
      sshCommand += `-J ${proxyJump} `;
    }
    if (port && port !== 22) {
      if (!isValidPort(port)) {
        throw new Error(`Invalid port: ${port}`);
      }
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
    await new Promise(resolve => setTimeout(resolve, SSH_CONNECTION_DELAY_MS));

    // Send each startup command
    for (const cmd of profile.startupCommands) {
      if (cmd.trim()) {
        await invoke('write_to_pty', { id: ptyId, data: cmd + '\n' });
        // Small delay between commands
        await new Promise(resolve => setTimeout(resolve, STARTUP_COMMAND_DELAY_MS));
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
