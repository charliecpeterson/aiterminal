# AI Terminal

A modern, AI-ready terminal emulator built with Tauri, React, and TypeScript.

## Features

- **Multi-Tab Support**: Manage multiple shell sessions in a single window.
- **Shell Integration**: Automatic detection of command start/end with visual markers.
- **Smart Copy**: Easily copy command output or command text via markers.
- **Productivity Tools**:
  - Font Zooming (`Cmd/Ctrl + +/-`)
  - Search (`Cmd/Ctrl + F`)
  - Clickable Links
- **Cross-Platform**: Runs on macOS, Windows, and Linux.

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
