# Autocomplete Feature

## Overview

AITerminal now includes intelligent command-line autocompletion powered by [Fig's autocomplete specifications](https://github.com/withfig/autocomplete). This provides IDE-style suggestions for 600+ CLI tools including git, npm, docker, kubectl, and more.

## Features

### 🐟 Fish-Style Inline Suggestions
- **Automatic**: Suggestions appear as gray text after your cursor as you type
- **Non-intrusive**: Keep typing to ignore, press → (right arrow) to accept
- **Smart**: Matches subcommands, options, and flags from Fig specs
- **Example**:
  ```bash
  $ git commit -m ""
           └─────────┘
           (gray text)
  ```

### 📋 Full Suggestion Menu
- **On-demand**: Press `Ctrl+Space` to see all available options
- **Keyboard navigation**: Use ↑↓ to browse, Enter to accept
- **Rich descriptions**: Each suggestion includes helpful documentation
- **Example**:
  ```bash
  $ git commit -█
  # Press Ctrl+Space
  ┌──────────────────────────┐
  │ -m  Commit message       │
  │ -a  Stage all changes    │
  │ --amend  Modify previous │
  │ --no-verify  Skip hooks  │
  └──────────────────────────┘
  ```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **→** (Right Arrow) | Accept inline suggestion |
| **Ctrl+Space** | Show full suggestion menu |
| **↑** / **↓** | Navigate menu |
| **Enter** | Accept selected menu item |
| **Esc** | Close menu |
| **Tab** | Shell completion (unchanged) |

## Settings

Access via Settings → Autocomplete tab:

- **Enable inline suggestions**: Fish-style gray text (default: ON)
- **Enable suggestion menu**: Ctrl+Space dropdown (default: ON)

Both can be toggled independently or disabled entirely.

## Tab Key Still Works

Your Tab key continues to work exactly as before for:
- File and directory completion
- PATH executable completion
- Shell-specific completions (bash/zsh)

Autocomplete uses different keybindings to avoid conflicts.

## Supported Commands

Powered by Fig's 600+ command specifications including:

**Popular Tools:**
- `git` - All subcommands, options, and branch names
- `npm`, `yarn`, `pnpm` - Package management
- `docker`, `docker-compose` - Container operations
- `kubectl` - Kubernetes management
- `aws`, `gcloud`, `az` - Cloud CLIs
- `cargo`, `python`, `node` - Language tooling

**System Commands:**
- `cd`, `ls`, `cat`, `grep`, `find`
- `ssh`, `scp`, `rsync`
- `systemctl`, `brew`, `apt`

Full list: https://github.com/withfig/autocomplete/tree/master/src

## How It Works

1. **Parser**: Extracts current command and context from terminal
2. **Spec Loader**: Dynamically loads Fig specs for the command
3. **Matcher**: Finds matching subcommands/options based on what you typed
4. **Renderer**: Shows suggestions inline or in menu
5. **Accepter**: Inserts selected text into terminal

## Performance

- **Inline suggestions**: ~10ms latency (updates on space/typing)
- **Menu**: ~50ms to load and display
- **Specs cached**: Only loaded once per command per session
- **No network calls**: Everything runs locally

## Technical Details

### Architecture
```
Terminal (xterm.js)
    ↓
useAutocomplete Hook
    ↓
AutocompleteEngine
    ├── Parser (extract context)
    ├── SpecLoader (Fig specs)
    └── Renderer (gray text / menu)
```

### File Structure
```
src/terminal/autocomplete/
├── engine.ts        # Main autocomplete logic
├── parser.ts        # Command line parsing
├── specLoader.ts    # Dynamic Fig spec loading
├── renderer.ts      # Inline suggestion rendering
└── types.ts         # TypeScript interfaces
```

### Dependencies
- `@withfig/autocomplete` - Command specifications (MIT license)
- Integrated with xterm.js for terminal rendering
- React hooks for state management

## Troubleshooting

### Suggestions not appearing
- Check Settings → Autocomplete to ensure it's enabled
- Verify the command has a Fig spec (try `git` or `npm`)
- Check browser console for errors

### Inline text looks weird
- Ensure your terminal font supports the characters
- Try adjusting font size in Settings → Appearance

### Menu position is off
- Resize the terminal window (menu position recalculates)
- Check if terminal is zoomed/scaled

### Conflicts with shell completion
- Autocomplete uses → and Ctrl+Space, not Tab
- Tab key still works for shell completion
- If issues persist, disable in Settings

## Future Enhancements

- **Custom specs**: Add your own command definitions
- **Learning**: Suggest recently used commands
- **AI integration**: Natural language → command generation
- **Context awareness**: Suggest based on current directory/git status

## Credits

- [Fig Autocomplete](https://github.com/withfig/autocomplete) - Command specifications (400+ contributors)
- [Fish Shell](https://fishshell.com/) - Inspiration for inline suggestions
- [inshellisense](https://github.com/microsoft/inshellisense) - Reference implementation
