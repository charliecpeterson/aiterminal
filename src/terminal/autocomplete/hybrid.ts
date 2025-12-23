/**
 * Hybrid autocomplete: combines fast history matching with smart LLM suggestions
 */

import { SimpleAutocomplete } from './simple';
import { LLMAutocomplete, type Suggestion, type CompletionContext } from './llm';

export class HybridAutocomplete {
  private history: SimpleAutocomplete;
  private llm: LLMAutocomplete;
  
  constructor() {
    this.history = new SimpleAutocomplete();
    this.llm = new LLMAutocomplete();
  }
  
  async initLLM(modelPath: string): Promise<void> {
    await this.llm.initialize(modelPath);
  }
  
  updateHistory(commands: string[]): void {
    this.history.updateHistory(commands);
  }
  
  /**
   * Get fast history-based matches for a given input
   */
  getHistoryMatches(input: string, limit: number = 5): Suggestion[] {
    if (!input.trim()) return [];
    
    const matches: string[] = [];
    const history = (this.history as any).history || []; // Access private field
    
    // Search in reverse (most recent first)
    for (let i = history.length - 1; i >= 0 && matches.length < limit; i--) {
      const cmd = history[i];
      if (cmd.startsWith(input) && cmd !== input && !matches.includes(cmd)) {
        matches.push(cmd);
      }
    }
    
    return matches.map(text => ({
      text,
      source: 'history' as const,
    }));
  }
  
  /**
   * Get menu suggestions: instant history + async LLM (with timeout)
   */
  async getMenuSuggestions(
    currentInput: string,
    context: {
      shell: string;
      cwd: string;
      last_command: string;
      history: string[];
    }
  ): Promise<Suggestion[]> {
    // Get history suggestions immediately
    const historySuggestions = this.getHistoryMatches(currentInput, 5);
    
    // Try to get LLM suggestions (with timeout)
    let llmSuggestions: Suggestion[] = [];
    
    if (this.llm.isEnabled()) {
      try {
        const llmContext: CompletionContext = {
          shell: context.shell,
          cwd: context.cwd,
          last_command: context.last_command,
          partial_input: currentInput,
          shell_history: context.history.slice(-10), // Last 10 commands for context
        };
        
        // Race against 500ms timeout
        const llmPromise = this.llm.getSuggestions(llmContext);
        const timeoutPromise = new Promise<Suggestion[]>((resolve) => {
          setTimeout(() => resolve([]), 500);
        });
        
        llmSuggestions = await Promise.race([llmPromise, timeoutPromise]);
      } catch (error) {
        console.warn('LLM suggestions failed:', error);
      }
    }
    
    // Merge and deduplicate
    return this.mergeSuggestions(historySuggestions, llmSuggestions);
  }
  
  /**
   * Merge LLM and history suggestions, deduplicating and prioritizing quality
   */
  private mergeSuggestions(
    history: Suggestion[],
    llm: Suggestion[]
  ): Suggestion[] {
    const seen = new Set<string>();
    const merged: Suggestion[] = [];
    
    // Add LLM suggestions first (generally higher quality)
    for (const suggestion of llm) {
      const normalized = suggestion.text.trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        merged.push(suggestion);
      }
    }
    
    // Add history suggestions (fallback)
    for (const suggestion of history) {
      const normalized = suggestion.text.trim();
      if (normalized && !seen.has(normalized) && merged.length < 10) {
        seen.add(normalized);
        merged.push(suggestion);
      }
    }
    
    return merged;
  }
  
  async shutdown(): Promise<void> {
    await this.llm.shutdown();
  }
}
