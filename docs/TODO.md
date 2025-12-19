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
