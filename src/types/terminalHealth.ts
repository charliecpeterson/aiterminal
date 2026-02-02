/**
 * Terminal Health Types and Utilities
 * 
 * Centralized type definitions and helper functions for terminal health monitoring.
 * Single source of truth for health status across the application.
 */

// ============================================================================
// TYPES
// ============================================================================

/** Health status levels for terminal connections */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Terminal health information including latency and status.
 */
export interface TerminalHealth {
  /** Current health status */
  status: HealthStatus;
  /** Round-trip latency in milliseconds (null if unavailable) */
  latencyMs: number | null;
  /** Timestamp of last successful health check */
  lastCheck: Date | null;
  /** Number of consecutive failed health checks */
  failureCount: number;
}

/**
 * SSH connection health status for broadcasting.
 */
export interface SSHHealthStatus {
  ptyId: number;
  profileId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  latencyMs?: number;
  tabName?: string;
  lastActivity?: Date;
  tabId?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Latency thresholds in milliseconds for health status determination */
export const LATENCY_THRESHOLDS = {
  /** Below this is healthy */
  healthy: 100,
  /** Below this is degraded, above is unhealthy */
  degraded: 500,
} as const;

/** Default polling interval for health checks (ms) */
export const HEALTH_CHECK_INTERVAL = 5000;

/** Maximum consecutive failures before marking as unhealthy */
export const MAX_FAILURE_COUNT = 3;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine health status based on latency.
 * 
 * @param latencyMs - Round-trip latency in milliseconds
 * @returns Health status level
 */
export function getHealthFromLatency(latencyMs: number | null): HealthStatus {
  if (latencyMs === null) return 'unknown';
  if (latencyMs < 0) return 'unhealthy';
  if (latencyMs <= LATENCY_THRESHOLDS.healthy) return 'healthy';
  if (latencyMs <= LATENCY_THRESHOLDS.degraded) return 'degraded';
  return 'unhealthy';
}

/**
 * Get a human-readable description of the health status.
 * 
 * @param health - Terminal health information
 * @returns Description string
 */
export function getHealthDescription(health: TerminalHealth): string {
  const { status, latencyMs, failureCount } = health;

  switch (status) {
    case 'healthy':
      return latencyMs !== null 
        ? `Healthy (${latencyMs}ms)` 
        : 'Healthy';
    case 'degraded':
      return latencyMs !== null 
        ? `Degraded - High latency (${latencyMs}ms)` 
        : 'Degraded';
    case 'unhealthy':
      if (failureCount > 0) {
        return `Unhealthy - ${failureCount} failed check${failureCount > 1 ? 's' : ''}`;
      }
      return latencyMs !== null 
        ? `Unhealthy - Very high latency (${latencyMs}ms)` 
        : 'Unhealthy';
    case 'unknown':
    default:
      return 'Status unknown';
  }
}

/**
 * Get an emoji/icon indicator for the health status.
 * 
 * @param status - Health status level
 * @returns Emoji indicator
 */
export function getHealthIndicator(status: HealthStatus): string {
  switch (status) {
    case 'healthy':
      return '🟢';
    case 'degraded':
      return '🟡';
    case 'unhealthy':
      return '🔴';
    case 'unknown':
    default:
      return '⚪';
  }
}

/**
 * Get CSS color for health status.
 * 
 * @param status - Health status level
 * @returns CSS color string
 */
export function getHealthColor(status: HealthStatus): string {
  switch (status) {
    case 'healthy':
      return '#22c55e'; // green-500
    case 'degraded':
      return '#eab308'; // yellow-500
    case 'unhealthy':
      return '#ef4444'; // red-500
    case 'unknown':
    default:
      return '#6b7280'; // gray-500
  }
}

/**
 * Create a default/initial health state.
 * 
 * @returns Initial terminal health object
 */
export function createInitialHealth(): TerminalHealth {
  return {
    status: 'unknown',
    latencyMs: null,
    lastCheck: null,
    failureCount: 0,
  };
}

/**
 * Update health state based on a latency measurement.
 * 
 * @param current - Current health state
 * @param latencyMs - New latency measurement (null or negative means failure)
 * @returns Updated health state
 */
export function updateHealthWithLatency(
  current: TerminalHealth,
  latencyMs: number | null
): TerminalHealth {
  const isFailure = latencyMs === null || latencyMs < 0;
  
  if (isFailure) {
    const newFailureCount = current.failureCount + 1;
    return {
      status: newFailureCount >= MAX_FAILURE_COUNT ? 'unhealthy' : current.status,
      latencyMs: null,
      lastCheck: new Date(),
      failureCount: newFailureCount,
    };
  }

  return {
    status: getHealthFromLatency(latencyMs),
    latencyMs,
    lastCheck: new Date(),
    failureCount: 0,
  };
}
