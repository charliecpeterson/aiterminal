/**
 * SSH Session Profile Types
 * 
 * These types define SSH connection profiles that can reference
 * existing ~/.ssh/config entries or define manual connections.
 */

export interface SSHProfile {
  /** Unique identifier for this profile */
  id: string;
  
  /** Display name (e.g., "Prod Cluster", "Dev Server") */
  name: string;
  
  /** Optional emoji icon for visual identification */
  icon?: string;
  
  /** Visual group/category (e.g., "Production", "Development", "HPC") */
  group?: string;
  
  /** Color for tab identification (hex color) */
  tabColor?: string;
  
  // Connection Configuration
  
  /** 
   * Connection type:
   * - 'ssh-config': Reference to Host entry in ~/.ssh/config
   * - 'manual': Direct connection parameters
   */
  connectionType: 'ssh-config' | 'manual';
  
  /**
   * For ssh-config type: The Host name from ~/.ssh/config
   * For manual type: unused
   */
  sshConfigHost?: string;
  
  /**
   * For manual connections only
   */
  manualConfig?: {
    hostname: string;
    username: string;
    port?: number;
    identityFile?: string;
    proxyJump?: string;
  };
  
  // Post-Connection Setup
  
  /**
   * Commands to run after SSH connection is established
   * Example: ["module load gcc/11", "cd /scratch/project"]
   */
  startupCommands?: string[];
  
  /**
   * Environment variables to set in the session
   * Example: { "TERM": "xterm-256color", "EDITOR": "vim" }
   */
  envVars?: Record<string, string>;
  
  /**
   * Port forwards to establish when connecting
   * Example: [{ type: 'local', localPort: 8080, remoteHost: 'localhost', remotePort: 3000 }]
   */
  portForwards?: PortForward[];
  
  /**
   * Custom SSH options/flags to add to the SSH command
   * Example: ["-v", "-oHostKeyAlgorithms=+ssh-rsa", "-oStrictHostKeyChecking=no"]
   */
  sshOptions?: string[];
  
  // Behavior Options
  
  /** Automatically connect when app starts */
  autoConnect?: boolean;
  
  /** Health check interval in seconds (0 = disabled) */
  healthCheckInterval?: number;
  
  /** Show alert when connection drops */
  alertOnDisconnect?: boolean;
  
  // Metadata
  
  /** Timestamp of profile creation */
  createdAt?: string;
  
  /** Timestamp of last connection */
  lastConnectedAt?: string;
  
  /** Number of times this profile has been used */
  connectionCount?: number;
}

/**
 * Connection health status for active SSH sessions
 */
export interface ConnectionHealth {
  /** Profile ID this connection belongs to */
  profileId: string;
  
  /** Tab/pane ID where this connection is active */
  tabId: string;
  
  /** Display name of the tab */
  tabName?: string;
  
  /** Current connection status */
  status: 'connected' | 'disconnected' | 'connecting' | 'timeout' | 'error';
  
  /** Round-trip latency in milliseconds */
  latency?: number;
  
  /** When the connection was established */
  connectedAt?: Date;
  
  /** Last activity timestamp */
  lastActivity?: Date;
  
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * SSH Config Host Entry (parsed from ~/.ssh/config)
 */
export interface SSHConfigHost {
  /** Host alias from config */
  host: string;
  
  /** Actual hostname or IP */
  hostname?: string;
  
  /** Username for connection */
  user?: string;
  
  /** SSH port */
  port?: number;
  
  /** Path to identity file (private key) */
  identityFile?: string;
  
  /** Proxy jump host */
  proxyJump?: string;
  
  /** Other SSH options */
  options?: Record<string, string>;
}

/**
 * Port forwarding configuration
 */
export interface PortForward {
  /** Unique identifier for this forward */
  id: string;
  
  /**
   * Forward type:
   * - 'local': Forward local port to remote (ssh -L)
   * - 'remote': Forward remote port to local (ssh -R)
   * - 'dynamic': SOCKS proxy on local port (ssh -D)
   */
  type: 'local' | 'remote' | 'dynamic';
  
  /** Local port number */
  localPort: number;
  
  /** Remote host (for local/remote forwards, e.g., 'localhost' or 'example.com') */
  remoteHost?: string;
  
  /** Remote port (for local/remote forwards) */
  remotePort?: number;
  
  /** Optional description (e.g., "Dev server", "MySQL") */
  description?: string;
}

/**
 * Port forward health status
 */
export interface PortForwardHealth {
  /** Port forward ID */
  forwardId: string;
  
  /** Whether the port is actively listening */
  isActive: boolean;
  
  /** Last check timestamp */
  lastChecked: Date;
  
  /** Error message if check failed */
  error?: string;
}

/**
 * Profile groups for organization
 */
export interface ProfileGroup {
  name: string;
  profiles: SSHProfile[];
  collapsed?: boolean;
}
