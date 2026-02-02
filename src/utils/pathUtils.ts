/**
 * Path Utilities
 * 
 * Functions for formatting and truncating file paths for display.
 */

/**
 * Smarter truncation that tries to show as much context as possible
 * by progressively removing middle segments.
 */
export function truncatePathSmart(
  path: string,
  maxLength: number = 40,
  homeDir?: string
): string {
  if (!path) return '';
  
  let displayPath = path;
  
  // Replace home directory with ~
  if (homeDir && path.startsWith(homeDir)) {
    displayPath = '~' + path.slice(homeDir.length);
  }
  
  // If it fits, return as-is
  if (displayPath.length <= maxLength) {
    return displayPath;
  }
  
  const segments = displayPath.split('/');
  const isAbsolute = segments[0] === '';
  const isHome = segments[0] === '~';
  
  // Filter out empty segments but remember structure
  const parts = segments.filter(Boolean);
  
  if (parts.length <= 1) {
    // Single segment, just truncate it
    return displayPath.slice(0, maxLength - 3) + '...';
  }
  
  // Always keep first and last
  const first = parts[0];
  const last = parts[parts.length - 1];
  const prefix = isHome ? '~/' : (isAbsolute ? '/' : '');
  
  // Try progressively shorter versions
  // Version 1: Keep first, "...", second-to-last, last
  if (parts.length >= 3) {
    const secondLast = parts[parts.length - 2];
    const v1 = `${prefix}${first}/.../.../${secondLast}/${last}`;
    if (v1.length <= maxLength) {
      return `${prefix}${first}/.../.../${secondLast}/${last}`;
    }
    
    const v1b = `${prefix}${first}/.../.../${last}`;
    if (v1b.length <= maxLength) {
      return `${prefix}${first}/.../.../${last}`;
    }
  }
  
  // Version 2: Keep first, "...", last
  const v2 = `${prefix}${first}/.../.../${last}`;
  if (v2.length <= maxLength) {
    return `${prefix}${first}/.../.../${last}`;
  }
  
  // Version 3: Just "...", last
  const v3 = `.../${last}`;
  if (v3.length <= maxLength) {
    return v3;
  }
  
  // Version 4: Truncate last segment too
  const available = maxLength - 4; // ".../"
  if (available > 3) {
    return `.../${last.slice(-(available - 3))}...`;
  }
  
  // Fallback
  return displayPath.slice(0, maxLength - 3) + '...';
}
