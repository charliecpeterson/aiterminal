# TODO

This document captures ideas that are intentionally deferred.

## Large File Context (Remote-Friendly)
Current file capture uses `head -c` and writes to the terminal, which is fine for small files but noisy for large files.

Future direction:
- **Large file mode** for context: chunked capture + embeddings instead of dumping to the terminal.
- **Remote-safe capture**: avoid terminal output by fetching content over a side channel (SFTP or an SSH helper that streams to the app, then deletes temp files).
- **Size-aware UI**: show size, truncation status, and embedding coverage.

Constraints:
- Must work in SSH sessions without requiring a full remote file explorer.
- Minimize intrusiveness in the user’s terminal.

## AI Panel Features Still Pending
- **Explain Error** quick action: auto-capture last command/output and send a fix request.
- **Suggest Command** flow: natural-language input → code block → optional run.
- **Fix It** button on failed commands directly in the terminal marker row.
- **Auto-pruning** and smarter truncation/summarization for large outputs.

## UX / Platform Enhancements
- **Streaming cancel/stop** button for long responses.
- **Per-tab AI history** persistence (or session restore).

---

## Production Hardening (Daily-Driver Quality)

### Terminal lifecycle / cleanup
- **Fix potential event-listener leaks** in `Terminal.tsx` (custom scrollbar overlay: `mousemove`/`mouseup`/`resize`/viewport `scroll`).
- **Dispose xterm disposables on unmount** (e.g., `term.onSelectionChange(...)`, other `term.on*` handlers).
- **Remove DOM listeners on unmount** (e.g., `terminalRef.addEventListener('mouseup', ...)`).
- **Remove overlay DOM nodes on unmount/tab close** (custom scrollbar track/thumb).
- **Eliminate leftover debug logging** in production paths (e.g., marker click handler `console.log`).
- **Avoid brittle DOM querying for UI** (e.g., replace `document.querySelector(...)` with a React ref for the search input).

### “AI Run Command” safety (treat as a security boundary)
- Add an **explicit confirmation** before executing AI-generated commands (especially multiline or “dangerous” patterns like `rm -rf`, `sudo`, `ssh`, `sbatch`, `scancel`, `kill`, etc.).
- Split actions into **Insert vs Run**:
  - **Insert**: paste into terminal input (no newline).
  - **Run**: send with newline to execute.
- Make **target tab/session explicit** when running a command (avoid “wrong tab” accidents).
- Add a **“paste without newline”** mode so users can review before execution.

### Type safety / maintainability
- Replace `any` in marker plumbing with **typed marker models**:
  - `currentMarker`, `markers[]`, `WeakMap` payloads, marker metadata/ranges.
- Add invariants/tests around **marker boundaries** and **output slicing** (prevent off-by-one and misattribution across commands).

### Secrets & configuration
- Stop storing **AI API keys in plaintext** in `~/.config/aiterminal/settings.json`.
- Use **OS keychain/credential store** (macOS Keychain) and keep only a reference/identifier in settings.

### Repo hygiene / build artifacts
- Ensure `src-tauri/target/` is **gitignored and not committed** (remove build/bundle artifacts from version control).

---

## HPC / Research-User Focus

### Large outputs & performance
- Make “Smart Copy / Add to Context” **scale to huge outputs**:
  - avoid scanning the full xterm buffer on every click;
  - precompute/store output ranges on marker completion.
- Improve **truncation UX** for massive outputs (show size, truncation status, what was captured).

### SSH integration reliability & observability
- Add **structured debug logging** for shell/SSH integration decisions (without printing noisy output into the user terminal by default).
- Improve remote bootstrap observability (decode/validate failure reasons surfaced somewhere appropriate).

### Connectivity / backend health
- Revisit periodic backend `ping` strategy:
  - **back off** when app is unfocused / on battery (where applicable);
  - show clear UI state for **backend disconnected** rather than silent failures.
`````<!-- filepath: /Users/charlie/projects/AIterminal/docs/TODO.md -->
# TODO

This document captures ideas that are intentionally deferred.

## Large File Context (Remote-Friendly)
Current file capture uses `head -c` and writes to the terminal, which is fine for small files but noisy for large files.

Future direction:
- **Large file mode** for context: chunked capture + embeddings instead of dumping to the terminal.
- **Remote-safe capture**: avoid terminal output by fetching content over a side channel (SFTP or an SSH helper that streams to the app, then deletes temp files).
- **Size-aware UI**: show size, truncation status, and embedding coverage.

Constraints:
- Must work in SSH sessions without requiring a full remote file explorer.
- Minimize intrusiveness in the user’s terminal.

## AI Panel Features Still Pending
- **Explain Error** quick action: auto-capture last command/output and send a fix request.
- **Suggest Command** flow: natural-language input → code block → optional run.
- **Fix It** button on failed commands directly in the terminal marker row.
- **Auto-pruning** and smarter truncation/summarization for large outputs.

## UX / Platform Enhancements
- **Streaming cancel/stop** button for long responses.
- **Per-tab AI history** persistence (or session restore).

---

## Production Hardening (Daily-Driver Quality)

### Terminal lifecycle / cleanup
- **Fix potential event-listener leaks** in `Terminal.tsx` (custom scrollbar overlay: `mousemove`/`mouseup`/`resize`/viewport `scroll`).
- **Dispose xterm disposables on unmount** (e.g., `term.onSelectionChange(...)`, other `term.on*` handlers).
- **Remove DOM listeners on unmount** (e.g., `terminalRef.addEventListener('mouseup', ...)`).
- **Remove overlay DOM nodes on unmount/tab close** (custom scrollbar track/thumb).
- **Eliminate leftover debug logging** in production paths (e.g., marker click handler `console.log`).
- **Avoid brittle DOM querying for UI** (e.g., replace `document.querySelector(...)` with a React ref for the search input).

### “AI Run Command” safety (treat as a security boundary)
- Add an **explicit confirmation** before executing AI-generated commands (especially multiline or “dangerous” patterns like `rm -rf`, `sudo`, `ssh`, `sbatch`, `scancel`, `kill`, etc.).
- Split actions into **Insert vs Run**:
  - **Insert**: paste into terminal input (no newline).
  - **Run**: send with newline to execute.
- Make **target tab/session explicit** when running a command (avoid “wrong tab” accidents).
- Add a **“paste without newline”** mode so users can review before execution.

### Type safety / maintainability
- Replace `any` in marker plumbing with **typed marker models**:
  - `currentMarker`, `markers[]`, `WeakMap` payloads, marker metadata/ranges.
- Add invariants/tests around **marker boundaries** and **output slicing** (prevent off-by-one and misattribution across commands).

### Secrets & configuration
- Stop storing **AI API keys in plaintext** in `~/.config/aiterminal/settings.json`.
- Use **OS keychain/credential store** (macOS Keychain) and keep only a reference/identifier in settings.

### Repo hygiene / build artifacts
- Ensure `src-tauri/target/` is **gitignored and not committed** (remove build/bundle artifacts from version control).

---

## HPC / Research-User Focus

### Large outputs & performance
- Make “Smart Copy / Add to Context” **scale to huge outputs**:
  - avoid scanning the full xterm buffer on every click;
  - precompute/store output ranges on marker completion.
- Improve **truncation UX** for massive outputs (show size, truncation status, what was captured).

### SSH integration reliability & observability
- Add **structured debug logging** for shell/SSH integration decisions (without printing noisy output into the user terminal by default).
- Improve remote bootstrap observability (decode/validate failure reasons surfaced somewhere appropriate).

### Connectivity / backend health
- Revisit periodic backend `ping` strategy:
  - **back off** when app is unfocused / on battery (where applicable);
  - show clear UI state for **backend disconnected** rather than silent failures.
