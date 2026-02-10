# AI Terminal

A modern, AI-ready terminal emulator built with Tauri, React, and TypeScript.

## Features

- **Multi-Tab Support**: Manage multiple shell sessions in a single window.
- **Split Panes**: Split terminals vertically or horizontally within a tab.
- **SSH Session Management**: Save SSH profiles with one-click connections and auto-run startup commands.
- **Shell Integration**: Automatic detection of command start/end with visual markers (bash and zsh).
- **Smart Copy**: Shift+Click markers to copy command output, add to AI context, or view in a separate window.
- **AI Integration**: 26-tool AI assistant that can read/write files, run commands, search, debug errors, and more.
- **Command Approval**: Dangerous commands require user approval; safe commands run automatically.
- **File Preview**: Render Markdown, HTML, PDFs, Jupyter notebooks, images, and more with `aiterm_render`.
- **Autocomplete**: History-based, LLM-powered, or hybrid inline completions.
- **Quick Actions**: Save and execute multi-command sequences with one click.
- **Command History**: Searchable overlay to jump to, copy, or send past commands to AI.
- **Output Folding**: Automatically collapse large outputs with expand/viewer options.
- **Cross-Platform**: Runs on macOS, Windows, and Linux.

## Documentation

- [User Guide](docs/USER_GUIDE.md) - Features, keyboard shortcuts, and configuration.
- [Developer Guide](docs/DEV_GUIDE.md) - Architecture, contributing, and debugging.

## Install / Download

Download the latest build from GitHub Releases:

https://github.com/charliecpeterson/aiterminal/releases

Choose the installer for your OS (for example: DMG for macOS, MSI/EXE for Windows, AppImage/DEB for Linux).

## Development

Vite 7 requires Node.js 20.19+ (or 22.12+). This repo includes a pinned version in `.nvmrc`.

- If you use `nvm`: run `nvm install` then `nvm use` (optional: `nvm alias default 20.19.0`)
- Install deps: `npm ci`
- Run: `npm run tauri dev`
