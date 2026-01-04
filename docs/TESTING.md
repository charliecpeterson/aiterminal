# Testing Guide

## Automated (fast)
- Run unit tests: `npm test`
- CI-friendly run: `npm run test:run`

## Manual smoke checklist (core terminal flows)
- Terminal renders, typing works, and prompt updates after resize.
- Marker highlights work: click a command block; click outside clears.
- "View in Window" opens for highlighted output.
- Quick Actions: create, edit, execute in active terminal.
- AI Panel receives context and runs a quick action without errors.
- SSH: connect profile, latency pill updates, host label shows lock.

## Notes
- Terminal/PTy behavior is hard to simulate in unit tests; use the manual checklist before release.
