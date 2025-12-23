/**
 * Main autocomplete engine
 * History-based Fish-style inline suggestions
 */

import type { Suggestion, AutocompleteState } from './types';

export class AutocompleteEngine {
  private state: AutocompleteState = {
    inlineSuggestion: null,
    menuSuggestions: [],
    menuVisible: false,
    selectedIndex: 0,
  };

  private enabled = {
    inline: true,
    menu: true,
  };

  private commandHistory: string[] = [];

  constructor(enableInline = true, enableMenu = true) {
    this.enabled = { inline: enableInline, menu: enableMenu };
  }

  /**
   * Update enabled features
   */
  updateSettings(enableInline: boolean, enableMenu: boolean) {
    this.enabled = { inline: enableInline, menu: enableMenu };
  }

  /**
   * Update command history for suggestions
   */
  updateHistory(history: string[]) {
    this.commandHistory = history;
  }

  /**
   * Get inline suggestion from history (Fish-style)
   * Returns the most recent history item that starts with current input
   */
  getInlineSuggestion(currentInput: string): string {
    if (!this.enabled.inline || !currentInput.trim()) {
      return '';
    }

    console.log('🔎 Searching for:', JSON.stringify(currentInput), 'in', this.commandHistory.length, 'commands');
    console.log('🔎 First 5 history items:', this.commandHistory.slice(-5));

    // Search history in reverse (most recent first)
    for (let i = this.commandHistory.length - 1; i >= 0; i--) {
      const historyItem = this.commandHistory[i];
      
      // Find first match that starts with current input
      if (historyItem.startsWith(currentInput) && historyItem !== currentInput) {
        console.log('✅ Match found:', historyItem);
        return historyItem;
      }
    }

    console.log('❌ No match found');
    return '';
  }

  /**
   * Get suggestions for the current command line (for dropdown menu - future use)
   */
  async getSuggestions(_commandLine: string): Promise<Suggestion[]> {
    // Menu suggestions disabled for now (will add LLM-based suggestions later)
    return [];
  }

  /**
   * Update inline suggestion (Fish-style gray text)
   */
  async updateInlineSuggestion(commandLine: string): Promise<string | null> {
    if (!this.enabled.inline) return null;

    const fullSuggestion = this.getInlineSuggestion(commandLine);
    
    if (fullSuggestion) {
      // Return only the part AFTER what user typed
      const remaining = fullSuggestion.substring(commandLine.length);
      this.state.inlineSuggestion = remaining;
      console.log('💡 Full match:', fullSuggestion, '| User typed:', commandLine, '| Remaining:', remaining);
      return this.state.inlineSuggestion;
    }

    this.state.inlineSuggestion = null;
    return null;
  }

  /**
   * Show full suggestion menu
   */
  async showMenu(commandLine: string): Promise<Suggestion[]> {
    if (!this.enabled.menu) return [];

    const suggestions = await this.getSuggestions(commandLine);
    this.state.menuSuggestions = suggestions;
    this.state.menuVisible = true;
    this.state.selectedIndex = 0;
    
    return suggestions;
  }

  /**
   * Navigate menu
   */
  navigateMenu(direction: 'up' | 'down') {
    if (!this.state.menuVisible || this.state.menuSuggestions.length === 0) return;

    if (direction === 'down') {
      this.state.selectedIndex = 
        (this.state.selectedIndex + 1) % this.state.menuSuggestions.length;
    } else {
      this.state.selectedIndex = 
        (this.state.selectedIndex - 1 + this.state.menuSuggestions.length) % 
        this.state.menuSuggestions.length;
    }
  }

  /**
   * Get selected suggestion
   */
  getSelectedSuggestion(): Suggestion | null {
    if (!this.state.menuVisible || this.state.menuSuggestions.length === 0) {
      return null;
    }
    return this.state.menuSuggestions[this.state.selectedIndex];
  }

  /**
   * Hide menu
   */
  hideMenu() {
    this.state.menuVisible = false;
    this.state.menuSuggestions = [];
    this.state.selectedIndex = 0;
  }

  /**
   * Get current state (for rendering)
   */
  getState(): AutocompleteState {
    return { ...this.state };
  }
}
