/**
 * Simple Fish-style autocomplete - clean rewrite
 * Track user input directly instead of parsing terminal buffer
 */

import type { Terminal as XTermTerminal } from '@xterm/xterm';

export interface DirEntry {
  name: string;
  is_dir: boolean;
}

interface CompletionContext {
  currentToken: string;
  isFirstToken: boolean;
  pathLike: boolean;
  fileDirPath: string | null;
  filePrefix: string;
}

export class SimpleAutocomplete {
  private history: string[] = [];
  private currentInput: string = '';
  private currentSuggestion: string = '';
  private lastRenderedLength: number = 0;
  private lastCursorX: number = 0;
  private lastCursorY: number = 0;
  private pathCommands: string[] = [];
  private cwd: string = '/';
  private homeDir: string = '';
  private dirEntries: DirEntry[] = [];
  private dirEntriesPath: string = '';
  
  updateHistory(history: string[]) {
    this.history = history;
  }

  setPathCommands(commands: string[]) {
    this.pathCommands = commands;
  }

  setCwd(cwd: string) {
    this.cwd = cwd;
  }

  setHomeDir(home: string) {
    this.homeDir = home;
  }

  setDirEntries(path: string, entries: DirEntry[]) {
    this.dirEntriesPath = path;
    this.dirEntries = entries;
  }
  
  /**
   * Handle user typing a character
   */
  onChar(char: string) {
    this.currentInput += char;
    this.updateSuggestion();
  }
  
  /**
   * Handle backspace
   */
  onBackspace() {
    if (this.currentInput.length > 0) {
      this.currentInput = this.currentInput.slice(0, -1);
      this.updateSuggestion();
    }
  }
  
  /**
   * Handle Enter - reset
   */
  onEnter() {
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

  getCurrentInput(): string {
    return this.currentInput;
  }

  refreshSuggestion() {
    this.updateSuggestion();
  }
  
  /**
   * Update suggestion based on current input
   */
  private updateSuggestion() {
    const input = this.currentInput;
    if (input.trim().length === 0) {
      this.currentSuggestion = '';
      return;
    }

    const context = this.getCompletionContext(input);
    if (!context.currentToken) {
      this.currentSuggestion = '';
      return;
    }

    const historyMatch = this.findHistorySuggestion(input);

    if (!context.pathLike && context.isFirstToken) {
      if (historyMatch) {
        this.currentSuggestion = historyMatch;
        return;
      }

      const commandMatch = this.findCommandSuggestion(context.currentToken);
      if (commandMatch) {
        this.currentSuggestion = commandMatch;
        return;
      }
    }

    const fileMatch = this.findFileSuggestion(input, context);
    if (fileMatch) {
      this.currentSuggestion = fileMatch;
      return;
    }

    if (historyMatch) {
      this.currentSuggestion = historyMatch;
      return;
    }

    this.currentSuggestion = '';
  }

  getFileCompletionContext(): { dirPath: string | null; prefix: string; showHidden: boolean } {
    const context = this.getCompletionContext(this.currentInput);
    if (!context.currentToken) {
      return { dirPath: null, prefix: '', showHidden: false };
    }

    if (!context.pathLike && context.isFirstToken) {
      return { dirPath: null, prefix: '', showHidden: false };
    }

    return {
      dirPath: context.fileDirPath,
      prefix: context.filePrefix,
      showHidden: context.filePrefix.startsWith('.') || context.currentToken.startsWith('.'),
    };
  }

  private findHistorySuggestion(input: string): string | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const cmd = this.history[i];
      if (cmd.startsWith(input) && cmd !== input) {
        return cmd;
      }
    }
    return null;
  }

  private findCommandSuggestion(prefix: string): string | null {
    if (!prefix) return null;
    for (const cmd of this.pathCommands) {
      if (cmd.startsWith(prefix) && cmd !== prefix) {
        return cmd;
      }
    }
    return null;
  }

  private findFileSuggestion(input: string, context: CompletionContext): string | null {
    if (!context.fileDirPath || context.filePrefix === null) {
      return null;
    }
    if (this.dirEntriesPath !== context.fileDirPath) {
      return null;
    }

    const match = this.dirEntries.find((entry) => entry.name.startsWith(context.filePrefix));
    if (!match) return null;

    const suffix = match.name.substring(context.filePrefix.length) + (match.is_dir ? '/' : '');
    if (!suffix) return null;

    return input + suffix;
  }

  private getCompletionContext(input: string): CompletionContext {
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let lastSep = -1;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && !inSingle) {
        escaped = true;
        continue;
      }
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }
      if (!inSingle && !inDouble && /\s/.test(ch)) {
        lastSep = i;
      }
    }

    const currentToken = input.slice(lastSep + 1);
    const hasLeading = input.slice(0, lastSep + 1).trim().length > 0;
    const isFirstToken = !hasLeading;
    const pathLike = currentToken.startsWith('.') ||
      currentToken.startsWith('~') ||
      currentToken.startsWith('/') ||
      currentToken.includes('/');

    const { dirPath, prefix } = this.computeFileContext(currentToken);

    return {
      currentToken,
      isFirstToken,
      pathLike,
      fileDirPath: dirPath,
      filePrefix: prefix,
    };
  }

  private computeFileContext(token: string): { dirPath: string | null; prefix: string } {
    if (!token) {
      return { dirPath: null, prefix: '' };
    }

    let stripped = token;
    if (stripped.startsWith('"') || stripped.startsWith("'")) {
      stripped = stripped.slice(1);
    }

    const lastSlash = stripped.lastIndexOf('/');
    const dirPart = lastSlash >= 0 ? stripped.slice(0, lastSlash + 1) : '';
    const prefix = lastSlash >= 0 ? stripped.slice(lastSlash + 1) : stripped;

    let dirPath = this.cwd;
    if (dirPart) {
      if (dirPart.startsWith('~')) {
        dirPath = (this.homeDir || this.cwd) + dirPart.slice(1);
      } else if (dirPart.startsWith('/')) {
        dirPath = dirPart;
      } else {
        dirPath = this.joinPath(this.cwd, dirPart);
      }
    }

    return { dirPath, prefix };
  }

  private joinPath(base: string, part: string): string {
    if (!base) return part;
    if (base.endsWith('/')) return `${base}${part}`;
    return `${base}/${part}`;
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
    if (toInsert) {
      this.currentInput = this.currentSuggestion;
      this.currentSuggestion = '';
    }
    return toInsert;
  }
  
  /**
   * Render the suggestion in the terminal
   */
  render(term: XTermTerminal) {
    const suggestion = this.getSuggestion();
    if (!suggestion) return;
    
    // Get current cursor position from buffer
    const buffer = term.buffer.active;
    const cursorX = buffer.cursorX;
    const cursorY = buffer.cursorY;
    const terminalWidth = term.cols;
    
    // Calculate available space from cursor to end of line
    const availableSpace = terminalWidth - cursorX;
    
    // Truncate suggestion if it would exceed terminal width
    const displayText = suggestion.length > availableSpace 
      ? suggestion.substring(0, Math.max(0, availableSpace)) 
      : suggestion;

    if (displayText.length === 0) return;

    // Store render position for cleanup
    this.lastRenderedLength = displayText.length;
    this.lastCursorX = cursorX;
    this.lastCursorY = cursorY;

    // Write gray text then reposition cursor back to where it was
    term.write(`\x1b[2m\x1b[97m${displayText}\x1b[0m`); // Write dimmed bright white
    term.write(`\x1b[${cursorY + 1};${cursorX + 1}H`); // Move cursor to absolute position (1-indexed)
  }
  
  /**
   * Clear the rendered suggestion
   */
  clearRender(term: XTermTerminal) {
    if (this.lastRenderedLength === 0) return;
    
    // Move to where we rendered, overwrite with spaces, move back
    term.write(`\x1b[${this.lastCursorY + 1};${this.lastCursorX + 1}H`); // Move to render position
    term.write(' '.repeat(this.lastRenderedLength)); // Overwrite with spaces
    term.write(`\x1b[${this.lastCursorY + 1};${this.lastCursorX + 1}H`); // Move back
    
    this.lastRenderedLength = 0;
  }
}
