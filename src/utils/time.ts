/**
 * Time and Duration Utilities
 * 
 * Shared time-related functions for formatting durations, calculating age,
 * and working with timestamps across the application.
 */

// Time constants in milliseconds
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Format a duration in milliseconds to a human-readable string.
 * 
 * @param ms - Duration in milliseconds
 * @param options - Formatting options
 * @returns Human-readable duration string
 * 
 * @example
 * formatDuration(500)       // "500ms"
 * formatDuration(1500)      // "1.5s"
 * formatDuration(65000)     // "1m 5s"
 * formatDuration(3661000)   // "1h 1m 1s"
 */
export function formatDuration(
  ms: number,
  options: {
    /** Show milliseconds for durations under 1 second (default: true) */
    showMs?: boolean;
    /** Decimal places for seconds (default: 1 for short durations, 0 for long) */
    decimals?: number;
    /** Compact format like "1:05" instead of "1m 5s" (default: false) */
    compact?: boolean;
  } = {}
): string {
  const { showMs = true, compact = false } = options;

  if (ms < MS_PER_SECOND) {
    return showMs ? `${Math.round(ms)}ms` : '< 1s';
  }

  if (ms < MS_PER_MINUTE) {
    const decimals = options.decimals ?? 1;
    return `${(ms / MS_PER_SECOND).toFixed(decimals)}s`;
  }

  const hours = Math.floor(ms / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);

  if (compact) {
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * Format elapsed time for display in UI (compact timer format).
 * Used for showing running command durations in tabs.
 * 
 * @param ms - Elapsed time in milliseconds
 * @returns Compact timer string like "45s" or "1:30"
 */
export function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / MS_PER_SECOND);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  return minutes > 0 
    ? `${minutes}:${secs.toString().padStart(2, '0')}` 
    : `${secs}s`;
}

/**
 * Format execution/tool duration for display.
 * Shows milliseconds for fast operations, seconds for longer ones.
 * 
 * @param ms - Duration in milliseconds  
 * @returns Duration string like "150ms" or "2.3s"
 */
export function formatExecutionTime(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}

/**
 * Calculate age of a timestamp in various units.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param now - Current time (defaults to Date.now())
 * @returns Object with age in different units
 */
export function getAge(timestamp: number, now: number = Date.now()): {
  ms: number;
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
} {
  const ms = now - timestamp;
  return {
    ms,
    seconds: ms / MS_PER_SECOND,
    minutes: ms / MS_PER_MINUTE,
    hours: ms / MS_PER_HOUR,
    days: ms / MS_PER_DAY,
  };
}

/**
 * Check if a timestamp is within a certain age.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param maxAgeMs - Maximum age in milliseconds
 * @param now - Current time (defaults to Date.now())
 * @returns true if timestamp is within maxAgeMs of now
 */
export function isWithinAge(timestamp: number, maxAgeMs: number, now: number = Date.now()): boolean {
  return (now - timestamp) <= maxAgeMs;
}

/**
 * Get a relative time description like "just now", "5 minutes ago", etc.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param now - Current time (defaults to Date.now())
 * @returns Human-readable relative time string
 */
export function getRelativeTime(timestamp: number, now: number = Date.now()): string {
  const age = getAge(timestamp, now);

  if (age.minutes < 1) return 'just now';
  if (age.minutes < 2) return '1 minute ago';
  if (age.minutes < 60) return `${Math.floor(age.minutes)} minutes ago`;
  if (age.hours < 2) return '1 hour ago';
  if (age.hours < 24) return `${Math.floor(age.hours)} hours ago`;
  if (age.days < 2) return 'yesterday';
  return `${Math.floor(age.days)} days ago`;
}

/**
 * Recency scoring for context ranking.
 * Maps timestamp age to a score value for prioritizing recent context.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @param now - Current time (defaults to Date.now())
 * @returns Object with recency score and time decay penalty
 */
export function calculateRecencyScore(
  timestamp: number,
  now: number = Date.now()
): { recency: number; timeDecay: number } {
  const age = getAge(timestamp, now);

  if (age.minutes < 5) {
    return { recency: 25, timeDecay: 0 };
  }
  if (age.minutes < 30) {
    return { recency: 15, timeDecay: -5 };
  }
  if (age.hours < 1) {
    return { recency: 8, timeDecay: -10 };
  }
  if (age.hours < 3) {
    return { recency: 3, timeDecay: -15 };
  }
  return { recency: 0, timeDecay: -25 };
}

/**
 * Calculate usage penalty based on how recently an item was used.
 * More recently used items get higher penalty to avoid repetition.
 * 
 * @param lastUsedTimestamp - When the item was last used (or undefined if never)
 * @param usageCount - How many times the item has been used
 * @param now - Current time (defaults to Date.now())
 * @returns Negative penalty value (0 to -40)
 */
export function calculateUsagePenalty(
  lastUsedTimestamp: number | undefined,
  usageCount: number = 0,
  now: number = Date.now()
): number {
  let penalty = 0;

  if (lastUsedTimestamp) {
    const minutesSinceLastUse = (now - lastUsedTimestamp) / MS_PER_MINUTE;

    if (minutesSinceLastUse < 2) {
      penalty = -30;
    } else if (minutesSinceLastUse < 5) {
      penalty = -20;
    } else if (minutesSinceLastUse < 15) {
      penalty = -10;
    }
  }

  // Additional penalty for heavy usage
  if (usageCount > 3) {
    penalty -= 10;
  }

  return penalty;
}
