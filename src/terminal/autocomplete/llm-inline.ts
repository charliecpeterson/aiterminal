/**
 * Pure LLM-powered inline autocomplete (Fish-style)
 * Optimized for low-latency single completions
 */

import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../../utils/logger';

const log = createLogger('LLMInlineAutocomplete');

interface CompletionContext {
  shell: string;
  cwd: string;
  last_command: string;
  partial_input: string;
  shell_history: string[];
}

export class LLMInlineAutocomplete {
  private currentSuggestion: string = '';
  private currentInput: string = ''; // What user has typed on current line
  private lastQueryInput: string = ''; // Last input we queried LLM for (caching)
  private isQuerying: boolean = false;
  private debounceTimer: number | null = null;
  private enabled: boolean = false;
  private commandAllowedCache = new Map<string, boolean>();

  constructor() {
  }

  async initialize(modelPath: string): Promise<void> {
    try {
      await invoke('init_llm', { modelPath });
      this.enabled = true;
    } catch (error) {
      log.error('LLM Inline init failed', error);
      this.enabled = false;
    }
  }

  /**
   * Get inline suggestion with debouncing
   */
  async getSuggestionAsync(
    currentInput: string,
    context: { shell: string; cwd: string },
    _debounceMs: number = 300
  ): Promise<string> {
    if (!this.enabled || !currentInput.trim()) {
      return '';
    }

    // Return cached suggestion if input matches last query
    if (currentInput === this.lastQueryInput && this.currentSuggestion) {
      return this.currentSuggestion;
    }

    // Query immediately (debouncing handled by caller)
    return this.queryLLM(currentInput, context);
  }

  /**
   * Get current cached suggestion synchronously
   */
  getCachedSuggestion(currentInput: string): string {
    if (currentInput === this.lastQueryInput) {
      return this.currentSuggestion;
    }
    return '';
  }

  private async queryLLM(input: string, context: { shell: string; cwd: string }): Promise<string> {
    if (this.isQuerying) {
      return this.currentSuggestion;
    }

    this.isQuerying = true;
    this.lastQueryInput = input;

    try {
      const completionContext: CompletionContext = {
        shell: context.shell,
        cwd: context.cwd,
        last_command: '',
        partial_input: input,
        shell_history: [],
      };

      // Call optimized inline completion endpoint
      const result = await invoke<string>('get_llm_inline_completion', {
        context: completionContext,
      });

      // Only update if input hasn't changed
      if (this.lastQueryInput === input) {
        const parsed = this.parseCompletion(result, input);
        if (!parsed) {
          this.currentSuggestion = '';
          return '';
        }

        const { full, suffix } = parsed;
        if (!this.isSuggestionAcceptable(input, full, suffix)) {
          this.currentSuggestion = '';
          return '';
        }

        const allowed = await this.isCommandAllowed(full);
        if (!allowed) {
          this.currentSuggestion = '';
          return '';
        }

        this.currentSuggestion = suffix;
        return suffix;
      }
      
      return this.currentSuggestion;
    } catch (error) {
      log.error('LLM inline query failed', error);
      this.currentSuggestion = '';
      return '';
    } finally {
      this.isQuerying = false;
    }
  }

  private parseCompletion(llmOutput: string, input: string): { full: string; suffix: string } | null {
    // Get first line of output
    const firstLine = llmOutput.split('\n')[0].trim();

    // Remove markdown, quotes, etc
    let cleaned = firstLine
      .replace(/^```.*$/, '')
      .replace(/^["']/, '')
      .replace(/["']$/, '')
      .trim();

    // If it starts with the input, return only the completion part after the input
    if (cleaned.startsWith(input)) {
      const completion = cleaned.substring(input.length);
      return { full: cleaned, suffix: completion };
    }

    // Full-command mode expects the model to echo the input.
    return null;
  }

  private isSuggestionAcceptable(input: string, full: string, suffix: string): boolean {
    if (!suffix) return false;
    const trimmed = full.trim();
    if (!trimmed) return false;

    if (!input.includes(' ')) {
      if (/\s/.test(suffix)) return false;
      if (suffix.length > 24) return false;
      const tokenCount = trimmed.split(/\s+/).length;
      if (tokenCount > 1) return false;
      if (/[|&;<>`'"]/.test(trimmed)) return false;
    }

    return true;
  }

  private async isCommandAllowed(full: string): Promise<boolean> {
    const primary = this.getPrimaryCommand(full);
    if (!primary) return false;
    if (this.isBuiltin(primary)) return true;

    const cached = this.commandAllowedCache.get(primary);
    if (cached !== undefined) return cached;

    try {
      const allowed = await invoke<boolean>('is_command_in_path', { cmd: primary });
      this.commandAllowedCache.set(primary, allowed);
      return allowed;
    } catch (error) {
      log.error('Failed to validate command', error);
      return false;
    }
  }

  private getPrimaryCommand(full: string): string | null {
    const tokens = full.trim().split(/\s+/);
    if (tokens.length === 0) return null;

    if (tokens[0] === 'sudo') {
      return tokens[1] ?? null;
    }

    return tokens[0] || null;
  }

  private isBuiltin(cmd: string): boolean {
    const builtins = new Set([
      '.', 'alias', 'bg', 'cd', 'command', 'echo', 'eval', 'exec', 'exit',
      'export', 'fg', 'history', 'jobs', 'pwd', 'read', 'set', 'source', 'type',
      'unalias', 'unset', 'wait',
    ]);
    return builtins.has(cmd);
  }

  /**
   * Clear current suggestion
   */
  clear(): void {
    this.currentSuggestion = '';
    this.currentInput = '';
    this.lastQueryInput = '';
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.enabled;
  }

  // --- Methods matching SimpleAutocomplete interface ---

  /**
   * Track character input
   */
  onChar(char: string): void {
    this.currentInput += char;
  }

  /**
   * Handle backspace
   */
  onBackspace(): void {
    if (this.currentInput.length > 0) {
      this.currentInput = this.currentInput.slice(0, -1);
    }
  }

  /**
   * Handle enter (reset state)
   */
  onEnter(): void {
    this.clear();
  }

  /**
   * Get current input
   */
  getCurrentInput(): string {
    return this.currentInput;
  }

  /**
   * Get current suggestion without clearing
   */
  getCurrentSuggestion(): string {
    return this.currentSuggestion;
  }

  /**
   * Accept current suggestion and return the text to insert
   */
  acceptSuggestion(): string {
    const toInsert = this.currentSuggestion;
    this.clear();
    return toInsert;
  }

  /**
   * Render suggestion as gray text in terminal (Fish-style)
   */
  render(terminal: any, suggestion?: string): void {
    const text = suggestion !== undefined ? suggestion : this.currentSuggestion;
    if (!text) {
      return;
    }

    // Store the suggestion being rendered
    if (suggestion !== undefined) {
      this.currentSuggestion = suggestion;
    }

    // Get the actual visible text on the current line (stripping escape sequences)
    const buffer = terminal.buffer.active;
    const cursorY = buffer.cursorY;
    const line = buffer.getLine(cursorY);
    if (!line) {
      return;
    }

    // Get the visible text content (translateToString strips escape codes)
    const lineText = line.translateToString(true);
    const terminalWidth = terminal.cols;
    
    // The current input length tells us the visual cursor position
    const visualCursorPos = this.currentInput.length;
    
    // Calculate available space from the current visual position to end of line
    const promptLength = lineText.length - this.currentInput.length;
    const totalUsed = promptLength + visualCursorPos;
    const availableSpace = terminalWidth - totalUsed;
    
    // Truncate suggestion if it would wrap to next line
    const displayText = availableSpace > 0 && text.length > availableSpace 
      ? text.substring(0, availableSpace) 
      : text;

    if (displayText.length === 0) {
      return;
    }

    // Save cursor position, write gray text, restore cursor
    terminal.write(`\x1b7`); // Save cursor position (ESC 7)
    terminal.write(`\x1b[2m\x1b[97m${displayText}\x1b[0m`); // Write dimmed bright white
    terminal.write(`\x1b8`); // Restore cursor position (ESC 8)
  }

  /**
   * Clear rendered suggestion (clear to end of line)
   */
  clearRender(terminal: any): void {
    if (!this.currentSuggestion) return;

    // Clear from cursor to end of line
    terminal.write(`\x1b[K`);
  }
}
