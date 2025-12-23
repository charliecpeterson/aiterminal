/**
 * Render inline autocomplete suggestions in xterm.js
 * Shows gray text after cursor (Fish-style)
 */

import type { Terminal as XTermTerminal } from '@xterm/xterm';

let currentSuggestion: string | null = null;
let cursorPosition: number | null = null;

/**
 * Render inline suggestion as gray text after cursor
 */
export function renderInlineSuggestion(term: XTermTerminal, suggestion: string | null) {
  // Clear previous suggestion if it exists
  clearInlineSuggestion(term);

  if (!suggestion) return;

  // Save cursor position
  const cursor = term.buffer.active.cursorX;
  cursorPosition = cursor;
  currentSuggestion = suggestion;

  // Write gray text
  term.write('\x1b[90m' + suggestion + '\x1b[0m');

  // Move cursor back to original position
  term.write('\x1b[' + suggestion.length + 'D');
}

/**
 * Clear inline suggestion
 */
export function clearInlineSuggestion(term: XTermTerminal) {
  if (!currentSuggestion || cursorPosition === null) return;

  // Move to where suggestion was rendered
  const currentCursor = term.buffer.active.cursorX;
  
  // If cursor is still at the same position, clear the gray text
  if (currentCursor === cursorPosition) {
    // Write spaces to overwrite the gray text
    term.write(' '.repeat(currentSuggestion.length));
    
    // Move cursor back
    term.write('\x1b[' + currentSuggestion.length + 'D');
  }

  currentSuggestion = null;
  cursorPosition = null;
}
