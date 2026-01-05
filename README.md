# AI Terminal

A modern, AI-ready terminal emulator built with Tauri, React, and TypeScript.

## Features

- **Multi-Tab Support**: Manage multiple shell sessions in a single window.
- **Split Panes**: Split terminals vertically or horizontally within a tab.
- **SSH Session Management**: Save SSH profiles with one-click connections and auto-run startup commands.
- **Shell Integration**: Automatic detection of command start/end with visual markers.
- **Smart Copy**: Easily copy command output or command text via markers.
- **AI Integration**: Separate AI panel window for chat and context management.
- **Cross-Platform**: Runs on macOS, Windows, and Linux.


## Documentation

For detailed usage instructions and keyboard shortcuts, please refer to the [User Guide](docs/USER_GUIDE.md).

## Install / Download

Download the latest build from GitHub Releases:

https://github.com/charliecpeterson/aiterminal/releases

Choose the installer for your OS (for example: DMG for macOS, MSI/EXE for Windows, AppImage/DEB for Linux).

## Development

Vite 7 requires Node.js 20.19+ (or 22.12+). This repo includes a pinned version in `.nvmrc`.

- If you use `nvm`: run `nvm install` then `nvm use` (optional: `nvm alias default 20.19.0`)
- Install deps: `npm ci`
- Run: `npm run tauri dev`
