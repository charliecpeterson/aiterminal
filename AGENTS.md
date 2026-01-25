# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the React + TypeScript frontend. UI components live in `src/components/`, hooks in `src/hooks/`, app wiring in `src/app/`, and shared helpers in `src/utils/`.
- `src-tauri/` contains the Rust backend, Tauri config, and shell integration scripts (see `src-tauri/shell-integration/`).
- `tests/` contains Vitest specs such as `tests/text.test.ts`.
- `public/` and `src/assets/` hold static assets; user docs live in `docs/`.

## Build, Test, and Development Commands
- `npm ci` installs pinned dependencies (recommended for reproducible builds).
- `npm run dev` starts the Vite frontend dev server.
- `npm run tauri dev` runs the full Tauri desktop app in dev mode.
- `npm run build` type-checks and builds the frontend.
- `npm run preview` serves the production build locally.
- `npm run test` runs Vitest in watch mode; `npm run test:run` runs once.

## Coding Style & Naming Conventions
- TypeScript/React uses 2-space indentation and double quotes (see `src/main.tsx`).
- Rust follows rustfmt defaults (4-space indentation).
- Components are `PascalCase.tsx` (e.g., `src/components/SSHSessionPanel.tsx`).
- Hooks are `use*.ts` (e.g., `src/terminal/hooks/useLatencyProbe.ts`).
- Styles are plain `.css` files colocated with components.

## Testing Guidelines
- Framework: Vitest; tests live in `tests/` and use `*.test.ts` naming.
- Prefer focused unit tests for utilities and AI helpers; keep fixtures small and inline.
- Run `npm run test:run` before opening a PR.

## Commit & Pull Request Guidelines
- No enforced commit message convention is evident in history; use clear, imperative summaries.
- PRs should include a brief problem/solution summary, test command(s) run, and screenshots for UI changes.
- Keep PRs focused; split large refactors from feature work when possible.

## Configuration & Tooling Notes
- Node.js 20.19+ (or 22.12+) is required; `.nvmrc` is provided.
- Tauri config lives in `src-tauri/tauri.conf.json`; avoid editing without validating a `tauri dev` run.
