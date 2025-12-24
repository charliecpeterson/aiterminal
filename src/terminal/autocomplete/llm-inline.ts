/**
 * Pure LLM-powered inline autocomplete (Fish-style)
 * Optimized for low-latency single completions
 */

import { invoke } from '@tauri-apps/api/core';

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

  constructor() {
    console.log('🤖 LLM Inline Autocomplete initialized');
  }

  async initialize(modelPath: string): Promise<void> {
    try {
      await invoke('init_llm', { modelPath });
      this.enabled = true;
      console.log('✅ LLM Inline ready');
    } catch (error) {
      console.error('❌ LLM Inline init failed:', error);
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
      const startTime = performance.now();

      const completionContext: CompletionContext = {
        shell: context.shell,
        cwd: context.cwd,
        last_command: '',
        partial_input: input,
        shell_history: [],
      };

      console.log(`[LLM query] input="${input}" cwd="${context.cwd}"`);

      // Call optimized inline completion endpoint
      const result = await invoke<string>('get_llm_inline_completion', {
        context: completionContext,
      });

      const latency = Math.round(performance.now() - startTime);
      console.log(`⚡ LLM inline latency: ${latency}ms`);

      // Only update if input hasn't changed
      if (this.lastQueryInput === input) {
        const completion = this.extractCompletion(result, input);
        this.currentSuggestion = completion;
        console.log(`[LLM result] input="${input}" raw="${result}" completion="${completion}"`);
        return completion;
      }
      
      return this.currentSuggestion;
    } catch (error) {
      console.error('LLM inline query failed:', error);
      this.currentSuggestion = '';
      return '';
    } finally {
      this.isQuerying = false;
    }
  }

  private extractCompletion(llmOutput: string, input: string): string {
    // Get first line of output
    const firstLine = llmOutput.split('\n')[0].trim();

    // Remove markdown, quotes, etc
    let cleaned = firstLine
      .replace(/^```.*$/, '')
      .replace(/^["']/, '')
      .replace(/["']$/, '')
      .trim();

    console.log(`[LLM extract] input="${input}" raw="${llmOutput}" cleaned="${cleaned}"`);

    // If it starts with the input, return only the completion part after the input
    if (cleaned.startsWith(input)) {
      const completion = cleaned.substring(input.length);
      console.log(`[LLM extract] completion="${completion}"`);
      return completion;
    }

    // If it's just the completion part, return as-is
    console.log(`[LLM extract] using as-is: "${cleaned}"`);
    return cleaned;
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
    console.log(`[LLM onChar] currentInput="${this.currentInput}"`);
  }

  /**
   * Handle backspace
   */
  onBackspace(): void {
    if (this.currentInput.length > 0) {
      this.currentInput = this.currentInput.slice(0, -1);
    }
    console.log(`[LLM onBackspace] currentInput="${this.currentInput}"`);
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

    // Save cursor position, write gray text, restore cursor
    // This way the cursor stays where the user is typing
    terminal.write(`\x1b7`); // Save cursor position (ESC 7)
    terminal.write(`\x1b[2m\x1b[97m${text}\x1b[0m`); // Write dimmed bright white
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
