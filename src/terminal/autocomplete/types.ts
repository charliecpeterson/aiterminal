/**
 * Autocomplete types for Fig-based command suggestions
 */

export interface Suggestion {
  name: string;
  description?: string;
  insertValue?: string; // What to insert (if different from name)
  type?: 'subcommand' | 'option' | 'argument' | 'file';
  priority?: number;
}

export interface AutocompleteState {
  inlineSuggestion: string | null;
  menuSuggestions: Suggestion[];
  menuVisible: boolean;
  selectedIndex: number;
}

export interface ParsedCommand {
  command: string; // e.g., "git"
  tokens: string[]; // e.g., ["git", "commit", "-m"]
  currentToken: string; // What user is typing now
  tokenType: 'subcommand' | 'option' | 'argument';
}
