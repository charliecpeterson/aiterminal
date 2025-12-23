/**
 * Simple Fish-style autocomplete - clean rewrite
 * Track user input directly instead of parsing terminal buffer
 */

import type { Terminal as XTermTerminal } from '@xterm/xterm';

export class SimpleAutocomplete {
  private history: string[] = [];
  private currentInput: string = '';
  private currentSuggestion: string = '';
  
  updateHistory(history: string[]) {
    this.history = history;
  }
  
  /**
   * Handle user typing a character
   */
  onChar(char: string) {
    this.currentInput += char;
    console.log('📝 currentInput is now:', this.currentInput, 'length:', this.currentInput.length, 'charCodes:', Array.from(this.currentInput).map(c => c.charCodeAt(0)));
    this.updateSuggestion();
  }
  
  /**
   * Handle backspace
   */
  onBackspace() {
    if (this.currentInput.length > 0) {
      this.currentInput = this.currentInput.slice(0, -1);
      console.log('⌫ currentInput after backspace:', JSON.stringify(this.currentInput));
      this.updateSuggestion();
    }
  }
  
  /**
   * Handle Enter - reset
   */
  onEnter() {
    console.log('↵ Resetting currentInput');
    this.currentInput = '';
    this.currentSuggestion = '';
  }
  
  /**
   * Handle Ctrl+C or clear
   */
  onClear() {
    this.currentInput = '';
    this.currentSuggestion = '';
  }
  
  /**
   * Update suggestion based on current input
   */
  private updateSuggestion() {
    console.log('🔍 Searching for match with currentInput:', this.currentInput, 'length:', this.currentInput.length);
    
    if (this.currentInput.trim().length === 0) {
      this.currentSuggestion = '';
      return;
    }
    
    // Search history in reverse (most recent first)
    for (let i = this.history.length - 1; i >= 0; i--) {
      const cmd = this.history[i];
      if (cmd.startsWith(this.currentInput) && cmd !== this.currentInput) {
        this.currentSuggestion = cmd;
        console.log('✅ Found match:', cmd);
        return;
      }
    }
    
    this.currentSuggestion = '';
    console.log('❌ No match found');
  }
  
  /**
   * Get the current suggestion text (what to show in gray)
   */
  getSuggestion(): string {
    if (!this.currentSuggestion) return '';
    // Return only the part after what user typed
    return this.currentSuggestion.substring(this.currentInput.length);
  }
  
  /**
   * Get the full suggestion (for accepting)
   */
  getFullSuggestion(): string {
    return this.currentSuggestion;
  }
  
  /**
   * Accept suggestion - returns the text to insert
   */
  acceptSuggestion(): string {
    const toInsert = this.getSuggestion();
    console.log('🎯 acceptSuggestion called. currentInput:', this.currentInput, 'currentSuggestion:', this.currentSuggestion, 'toInsert:', toInsert);
    if (toInsert) {
      this.currentInput = this.currentSuggestion;
      this.currentSuggestion = '';
      console.log('🎯 After accepting, currentInput updated to:', this.currentInput);
    }
    return toInsert;
  }
  
  /**
   * Render the suggestion in the terminal
   */
  render(term: XTermTerminal) {
    const suggestion = this.getSuggestion();
    if (!suggestion) return;
    
    // Write gray text
    term.write('\x1b[90m' + suggestion + '\x1b[0m');
    
    // Move cursor back
    term.write('\x1b[' + suggestion.length + 'D');
  }
  
  /**
   * Clear the rendered suggestion
   */
  clearRender(term: XTermTerminal) {
    const suggestion = this.getSuggestion();
    if (!suggestion) return;
    
    // Overwrite with spaces and move back
    term.write(' '.repeat(suggestion.length));
    term.write('\x1b[' + suggestion.length + 'D');
  }
}
