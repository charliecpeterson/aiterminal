/**
 * Parser for command line input
 * Extracts current command, tokens, and context for autocomplete
 */

import type { ParsedCommand } from './types';

export function parseCommandLine(line: string): ParsedCommand {
  // Trim and split by spaces (simple parsing, doesn't handle quotes yet)
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  
  if (tokens.length === 0) {
    return {
      command: '',
      tokens: [],
      currentToken: '',
      tokenType: 'subcommand',
    };
  }

  const command = tokens[0];
  const currentToken = tokens[tokens.length - 1] || '';
  
  // Determine token type
  let tokenType: 'subcommand' | 'option' | 'argument' = 'subcommand';
  if (currentToken.startsWith('-')) {
    tokenType = 'option';
  } else if (tokens.length > 1) {
    tokenType = 'argument';
  }

  return {
    command,
    tokens,
    currentToken,
    tokenType,
  };
}

/**
 * Extract the current line being typed from terminal buffer
 */
export function getCurrentLine(term: any): string {
  // Get the active buffer
  const buffer = term.buffer.active;
  const cursorY = buffer.cursorY;
  const cursorX = buffer.cursorX;
  
  // Get the line at cursor position
  const line = buffer.getLine(cursorY);
  if (!line) return '';
  
  // Use translateToString to get clean text without ANSI codes
  const fullLine = line.translateToString(true);
  
  // Extract text up to cursor position (approximate based on visible chars)
  const textUpToCursor = fullLine.substring(0, cursorX);
  
  // Remove prompt (everything before $, >, or # followed by space)
  const promptMatch = textUpToCursor.match(/[$>#]\s+(.*)$/);
  const result = promptMatch ? promptMatch[1].trim() : textUpToCursor.trim();
  
  // Aggressively clean the string
  return result
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Remove ANSI escape codes
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters  
    .replace(/^["']|["']$/g, '') // Remove quotes at start/end
    .replace(/\\(.)/g, '$1') // Remove backslash escapes
    .trim();
}
