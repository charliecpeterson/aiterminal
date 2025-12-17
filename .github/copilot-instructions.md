# AI Terminal Project Instructions

## Project Overview
AI Terminal is a modern terminal emulator built with Tauri (Rust) and React (TypeScript). It features multi-tab support, shell integration, and a persistent configuration system.

## Architecture
- **Frontend**: React, TypeScript, Vite.
  - `src/components/Terminal.tsx`: Wraps `xterm.js` and handles PTY interaction.
  - `src/context/SettingsContext.tsx`: Manages global application settings.
  - `src/App.tsx`: Main layout and tab management.
- **Backend**: Rust (Tauri).
  - `src-tauri/src/lib.rs`: Main entry point, command definitions, and PTY management.
  - `src-tauri/Cargo.toml`: Rust dependencies.

## Configuration
Settings are stored in `~/.config/aiterminal/settings.json`.
- **Appearance**: Theme, Font Size, Font Family.
- **AI**: Provider, Model, API Key, Embedding Model, URL.

## Development
- Run `npm run tauri dev` to start the development server.
- Run `npm run build` to build the frontend.
- Run `cargo check` in `src-tauri` to check Rust code.

## Conventions
- Use `xterm.js` for terminal rendering.
- Use `portable-pty` for cross-platform PTY management.
- Use `serde` for serialization between Rust and TypeScript.
