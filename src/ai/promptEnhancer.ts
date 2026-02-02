/**
 * Prompt Enhancer - Fixes vague/poor prompts before classification
 * 
 * This module applies rule-based enhancement patterns to improve
 * prompt quality without additional API calls.
 * 
 * Enhancement Patterns:
 * 1. Vague references: "fix this" → "fix this error in file.ts:123"
 * 2. Missing context: Append available context metadata
 * 3. Beginner mode: Add "explain step-by-step" qualifier
 * 4. Ambiguous questions: Note available context for clarity
 */

import type { ContextItem } from '../context/AIContext';
import type { AiSettings } from '../context/SettingsContext';
import type { PromptEnhancement } from '../types/routing';
import { createLogger } from '../utils/logger';

const log = createLogger('PromptEnhancer');

// Patterns that indicate vague references
const VAGUE_PATTERNS = [
  /^(fix|solve|help with) (this|that|it)\s*$/i,
  /^(fix|solve|help with) (this|that|it)\b(?!\s+(error|bug|issue|problem|file|function|code))/i,
  /^what('s| is) (wrong|the problem|the issue)\s*\??$/i,
  /^why (doesn't|isn't|won't) (this|that|it) work\s*\??$/i,
  /^(this|that|it) (doesn't|isn't|won't) work\s*$/i,
];

// Patterns that are already specific enough
const SPECIFIC_PATTERNS = [
  /\b(in|at|from)\s+[a-zA-Z0-9_\-/.]+\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|hpp|css|html|json|yaml|yml|md|txt|sh|bash)/i,
  /\bline\s+\d+/i,
  /\berror:?\s+.{10,}/i, // Has error message
  /\bfunction\s+\w+/i,
  /\bclass\s+\w+/i,
  /```[\s\S]+```/, // Has code block
];

// Patterns that indicate missing context reference
const MISSING_CONTEXT_PATTERNS = [
  /^(run|execute|do|perform)\s+(this|that|it)\s*$/i,
  /^what does (this|that|it) (do|mean)\s*\??$/i,
  /^(explain|describe)\s+(this|that|it)\s*$/i,
];

/**
 * Check if prompt contains vague references
 */
function isVagueReference(prompt: string): boolean {
  // First check if it's already specific
  if (SPECIFIC_PATTERNS.some(p => p.test(prompt))) {
    return false;
  }
  
  // Then check for vague patterns
  return VAGUE_PATTERNS.some(p => p.test(prompt));
}

/**
 * Check if prompt references context without specifying which
 */
function isMissingContextReference(prompt: string, contextItems: ContextItem[]): boolean {
  if (contextItems.length === 0) {
    return false; // No context to reference anyway
  }
  
  return MISSING_CONTEXT_PATTERNS.some(p => p.test(prompt));
}

/**
 * Get the most relevant context item for enhancing a vague prompt
 */
function getMostRelevantContext(contextItems: ContextItem[]): ContextItem | null {
  if (contextItems.length === 0) return null;
  
  // Priority order:
  // 1. Items with errors (exitCode !== 0)
  // 2. Most recent file
  // 3. Most recent output
  // 4. Most recent command
  
  // Check for error outputs first
  const errorItem = contextItems.find(item => 
    item.metadata?.exitCode !== undefined && item.metadata.exitCode !== 0
  );
  if (errorItem) return errorItem;
  
  // Check for files
  const fileItem = contextItems.find(item => item.type === 'file');
  if (fileItem) return fileItem;
  
  // Check for outputs
  const outputItem = contextItems.find(item => 
    item.type === 'output' || item.type === 'command_output'
  );
  if (outputItem) return outputItem;
  
  // Return most recent item
  return contextItems[0] || null;
}

/**
 * Format context reference for prompt enhancement
 */
function formatContextReference(item: ContextItem): string {
  if (item.type === 'file') {
    const path = item.metadata?.path || 'attached file';
    return `in ${path}`;
  }
  
  if (item.type === 'output' || item.type === 'command_output') {
    if (item.metadata?.exitCode !== undefined && item.metadata.exitCode !== 0) {
      const cmd = item.metadata?.command || 'command';
      return `in the output from "${cmd}" (exit code ${item.metadata.exitCode})`;
    }
    const cmd = item.metadata?.command || 'command';
    return `in the output from "${cmd}"`;
  }
  
  if (item.type === 'command') {
    return `for command "${item.content.substring(0, 50)}"`;
  }
  
  return 'in the provided context';
}

/**
 * List available context items for ambiguous queries
 */
function listAvailableContext(contextItems: ContextItem[]): string {
  if (contextItems.length === 0) return '';
  
  const items = contextItems.slice(0, 3).map(item => {
    if (item.type === 'file') {
      return `file: ${item.metadata?.path || 'unknown'}`;
    }
    if (item.type === 'output' || item.type === 'command_output') {
      return `output from: ${item.metadata?.command || 'command'}`;
    }
    if (item.type === 'command') {
      return `command: ${item.content.substring(0, 30)}`;
    }
    return item.type;
  });
  
  return items.join(', ');
}

/**
 * Main enhancement function - enhances prompt if needed
 */
export async function enhancePromptIfNeeded(
  prompt: string,
  contextItems: ContextItem[],
  _settings: AiSettings
): Promise<PromptEnhancement> {
  const trimmed = prompt.trim();
  
  // Check for vague references
  if (isVagueReference(trimmed)) {
    const relevantContext = getMostRelevantContext(contextItems);
    
    if (relevantContext) {
      const contextRef = formatContextReference(relevantContext);
      
      // Enhance based on prompt type
      let enhanced = trimmed;
      
      // "fix this" → "fix this [context reference]"
      if (/^(fix|solve|help with)\b/i.test(trimmed)) {
        enhanced = `${trimmed} ${contextRef}`;
      }
      // "what's wrong" → "what's wrong [context reference]"
      else if (/^what('s| is) (wrong|the problem|the issue)/i.test(trimmed)) {
        enhanced = `${trimmed} ${contextRef}`;
      }
      // "why doesn't this work" → "why doesn't this work [context reference]"
      else if (/^why (doesn't|isn't|won't)/i.test(trimmed)) {
        enhanced = `${trimmed} ${contextRef}`;
      }
      // "this doesn't work" → "this doesn't work [context reference]"
      else if (/^(this|that|it) (doesn't|isn't|won't) work/i.test(trimmed)) {
        enhanced = `${trimmed} ${contextRef}`;
      }
      
      if (enhanced !== trimmed) {
        log.debug('Enhanced vague reference', { original: trimmed, enhanced });
        
        return {
          original: trimmed,
          enhanced,
          wasEnhanced: true,
          reason: 'Added explicit context reference',
          pattern: 'vague_reference',
        };
      }
    }
  }
  
  // Check for missing context references
  if (isMissingContextReference(trimmed, contextItems)) {
    const available = listAvailableContext(contextItems);
    
    if (available) {
      const enhanced = `${trimmed} (Available context: ${available})`;
      
      log.debug('Added context list', { original: trimmed, enhanced });
      
      return {
        original: trimmed,
        enhanced,
        wasEnhanced: true,
        reason: 'Listed available context items',
        pattern: 'missing_context',
      };
    }
  }
  
  // No enhancement needed
  return {
    original: trimmed,
    enhanced: trimmed,
    wasEnhanced: false,
  };
}

// Export for testing
export { isVagueReference, isMissingContextReference, getMostRelevantContext };
