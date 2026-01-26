/**
 * Terminal dimension limits
 * 
 * These constants define the minimum and maximum allowed dimensions
 * for terminal rows and columns to prevent invalid PTY sizes.
 */
export const MIN_TERMINAL_ROWS = 1;
export const MIN_TERMINAL_COLS = 1;
export const MAX_TERMINAL_ROWS = 1000;
export const MAX_TERMINAL_COLS = 1000;

/**
 * Terminal timing constants
 * 
 * These constants control various timing-related behaviors in the terminal.
 */

/** Delay to wait for DOM layout to stabilize before measuring terminal dimensions */
export const LAYOUT_STABILIZATION_DELAY_MS = 10;

/** Debounce delay for window resize events to avoid excessive PTY resize calls */
export const RESIZE_DEBOUNCE_MS = 100;

/** Initial delay before performing the first terminal resize after creation */
export const INITIAL_RESIZE_DELAY_MS = 50;

/** Delay before focusing the terminal after creation */
export const TERMINAL_FOCUS_DELAY_MS = 50;

/** Debounce delay for ResizeObserver events */
export const RESIZE_OBSERVER_DEBOUNCE_MS = 50;
