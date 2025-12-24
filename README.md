# AI Terminal

A modern, AI-ready terminal emulator built with Tauri, React, and TypeScript.

## Features

- **Multi-Tab Support**: Manage multiple shell sessions in a single window.
- **Split Panes**: Split terminals vertically or horizontally within a tab.
- **Shell Integration**: Automatic detection of command start/end with visual markers.
- **Smart Copy**: Easily copy command output or command text via markers.
- **AI Integration**: Separate AI panel window for chat and context management.
- **Productivity Tools**:
  - Font Zooming (`Cmd/Ctrl + +/-`)
  - Search (`Cmd/Ctrl + F`)
  - Clickable Links
- **Cross-Platform**: Runs on macOS, Windows, and Linux.

## Keyboard Shortcuts

### Tabs
- **Cmd/Ctrl + T** - New tab
- **Cmd/Ctrl + W** - Close current pane/tab

### Split Panes
- **Cmd/Ctrl + D** - Split vertically
- **Cmd/Ctrl + Shift + D** - Split horizontally
- **Cmd/Ctrl + [** - Focus previous pane
- **Cmd/Ctrl + ]** - Focus next pane

### Other
- **Cmd/Ctrl + B** - Open AI Panel
- **Cmd + ,** - Open Settings

## Documentation

For detailed usage instructions and keyboard shortcuts, please refer to the [User Guide](docs/USER_GUIDE.md).

## Development

### Prerequisites

- Rust & Cargo
- Node.js & npm

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run tauri dev
   ```

## Tech Stack

- **Frontend**: React, TypeScript, xterm.js
- **Backend**: Rust, Tauri, portable-pty
