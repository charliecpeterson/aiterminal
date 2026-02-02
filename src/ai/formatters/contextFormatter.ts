/**
 * Context Item Formatter Utility
 * 
 * Shared formatting logic for context items used in AI prompts.
 * Consolidates duplicate formatting code from AIContext.tsx and smartContext.ts.
 */

import type { ContextItem } from '../../context/AIContext';

/**
 * Get the appropriate text content for a context item, respecting redaction settings.
 * Returns redacted content if secrets exist and redaction is enabled, otherwise raw content.
 */
export function getTextForModel(item: ContextItem): string {
  if (item.hasSecrets && item.secretsRedacted && item.redactedContent) {
    return item.redactedContent;
  }
  return item.content;
}

/**
 * Format a context item for inclusion in an AI prompt.
 * Handles different item types (command_output, file, etc.) with appropriate metadata.
 * 
 * @example
 * // Command output
 * formatContextItem(commandItem);
 * // Returns: "Type: command\nContent: ls -la\n\nType: output\nContent: ..."
 * 
 * // File content
 * formatContextItem(fileItem);
 * // Returns: "Type: file\nContent: ...\nPath: /path/to/file\nTruncated: true"
 */
export function formatContextItem(item: ContextItem): string {
  const content = getTextForModel(item);

  if (item.type === 'command_output') {
    const command = item.metadata?.command || '';
    return `Type: command\nContent: ${command}\n\nType: output\nContent: ${content}`;
  }

  if (item.type === 'file') {
    const pathLine = item.metadata?.path ? `\nPath: ${item.metadata.path}` : '';
    const truncatedLine = item.metadata?.truncated ? '\nTruncated: true' : '';
    return `Type: file\nContent: ${content}${pathLine}${truncatedLine}`;
  }

  if (item.metadata?.command) {
    return `Type: ${item.type}\nContent: ${content}\nCommand: ${item.metadata.command}`;
  }

  return `Type: ${item.type}\nContent: ${content}`;
}

/**
 * Format multiple context items and join them for a prompt.
 * 
 * @param items - Array of context items to format
 * @param separator - Separator between items (default: double newline)
 * @returns Formatted string suitable for AI prompt context section
 */
export function formatContextItems(items: ContextItem[], separator: string = '\n\n'): string {
  return items.map(formatContextItem).join(separator);
}

/**
 * Determine the effective include mode for a context item.
 * Used by smart context to decide which items to include/exclude.
 * 
 * @param item - The context item
 * @param globalSmartMode - Whether global smart mode is enabled
 * @returns The effective mode: 'smart', 'always', or 'exclude'
 */
export function effectiveIncludeMode(
  item: ContextItem,
  globalSmartMode: boolean
): 'smart' | 'always' | 'exclude' {
  if (globalSmartMode) return 'smart';
  const mode = item.metadata?.includeMode;
  if (mode === 'always' || mode === 'exclude' || mode === 'smart') return mode;
  return 'smart';
}
