# Testing Quick Actions

## To Test:

1. **Start the app**: `npm run tauri dev`
2. **Run a command that fails** (to get a red marker):
   ```bash
   python nonexistent_file.py
   ```
   or
   ```bash
   ls /nonexistent/path
   ```

3. **Run a command that succeeds** (to get a green marker):
   ```bash
   ls -la
   ```

4. **Click on the markers** - you should see debug logs in the console:
   - `Marker clicked: { exitCode: X, hasOutput: true/false, ... }`
   
5. **Check which buttons appear**:
   - On **error markers** (red): Should see "Explain Error" and "Suggest Fix"
   - On **success markers** (green): Should see "What's Next?"
   - On **all markers**: Should see "Explain This"

6. **Click a quick action button**:
   - Should log: `Quick action clicked: { actionType: '...', exitCode: X }`
   - Should add context item
   - Should switch AI panel to chat tab
   - Should auto-send message with tailored prompt

## Debug Logs to Check

In the browser console you should see:
```
Marker clicked: { exitCode: 1, hasOutput: true, commandText: "python nonexist..." }
Quick action clicked: { actionType: 'explainError', exitCode: 1, hasOutput: true }
Quick action received in AI panel: { actionType: '...', systemPrompt: '...' }
```

## Known Issue to Debug

If "Explain Error" doesn't show on red markers:
- Check console for `exitCode` value when marker is clicked
- The `exitCode` should be !== 0 for failed commands
- The condition is: `exitCode !== undefined && exitCode !== 0`

The markers are created from OSC 133 sequences. Check that:
1. Your shell integration is working (you should see markers at all)
2. The OSC 133 D sequence includes the exit code
3. The exit code is being stored in the marker metadata
