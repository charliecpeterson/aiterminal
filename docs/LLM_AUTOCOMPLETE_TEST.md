# LLM Autocomplete Testing Guide

## Prerequisites
1. **Conda Environment**: Ensure `aiterminal` conda env is active
2. **Model Downloaded**: Qwen3-0.6B Q4_K_M GGUF at `~/.config/aiterminal/models/qwen3-0.6b-q4_k_m.gguf`
3. **Build Command**: Use `conda run -n aiterminal npm run tauri dev`

## Architecture Overview
Two-tier autocomplete system:
- **Tier 1 (Inline)**: Fast history matching, gray text, `→` to accept
- **Tier 2 (Menu)**: Smart LLM suggestions, Ctrl+Space dropdown

## Test Cases

### 1. Inline Autocomplete (Already Working)
**Expected**: Type `git c` → see `ommit` in gray
**Action**: Press `→` to accept
**Status**: ✅ Working

### 2. LLM Menu - Basic Flow
**Expected**:
1. Type: `git co`
2. Press: `Ctrl+Space`
3. See: Dropdown menu appears below cursor
4. See: Loading spinner
5. See: History matches appear immediately (📚 badge)
6. See: LLM suggestions appear within 250ms (✨ badge)

**Keyboard Nav**:
- `↑/↓`: Navigate suggestions
- `Enter` or `Tab`: Accept selected
- `Esc`: Close menu

### 3. LLM Initialization Check
**Check Console**:
```
Initializing LLM with model: ~/.config/aiterminal/models/qwen3-0.6b-q4_k_m.gguf
✅ LLM initialized successfully
```

**If Failed**:
- Check model path exists
- Check llama-server in conda env: `which llama-server`
- Check port 8765 not in use: `lsof -i :8765`

### 4. Context Gathering
**Test CWD Awareness**:
```bash
cd /tmp
# Type: ls -la .
# Press Ctrl+Space
# Expected: Suggestions should be CWD-aware
```

### 5. Suggestion Deduplication
**Test**:
1. Type a common command that exists in history
2. Press `Ctrl+Space`
3. Expected: No duplicate suggestions (LLM + history merged correctly)

### 6. Error Handling
**Test LLM Unavailable**:
1. Stop llama-server: `pkill llama-server`
2. Press `Ctrl+Space`
3. Expected: Menu still shows history matches (graceful fallback)

## Known Issues

### Issue 1: Model Not Trained for Commands
**Symptom**: LLM produces poor/irrelevant suggestions
**Fix**: Prompt engineering needed. Current prompts are placeholders.

**Current Prompt** (in `llm.rs`):
```
Complete this shell command: {input}
Context: {cwd}, shell: {shell}
```

**Better Prompt** (TODO):
```
You are a shell command autocomplete assistant. 
Complete the following command naturally.
Only output the completion, no explanations.

Command so far: {input}
Working directory: {cwd}
Shell: {shell}
Recent command: {last_command}

Completion:
```

### Issue 2: Latency Variance
**Symptom**: Sometimes slow (>500ms)
**Cause**: Model cold start, CPU scheduling
**Mitigation**: 500ms timeout prevents blocking

### Issue 3: CWD Not Updating
**Symptom**: `get_pty_cwd` returns stale directory
**Cause**: Shell hasn't reported PWD change via OSC
**Fix**: Track shell `cd` commands manually

## Debugging Commands

### Check LLM Server Status
```bash
# Check if server is running
ps aux | grep llama-server

# Check port
lsof -i :8765

# Check server logs (if any)
# Look in ~/.config/aiterminal/llm_server.log
```

### Test LLM Directly
```bash
conda activate aiterminal

# Start server manually
llama-server \
  --model ~/.config/aiterminal/models/qwen3-0.6b-q4_k_m.gguf \
  --port 8765 \
  --n-gpu-layers 1

# In another terminal
curl http://localhost:8765/health
```

### Check Tauri Console
Open DevTools in the app (usually Cmd+Option+I), check Console for:
- `Initializing LLM...`
- `✅ LLM initialized successfully`
- Any error messages

### Check Rust Logs
Tauri app logs (stderr) will show:
- `Starting LLM server...`
- `Server started on port 8765`
- Request/response logs

## Performance Benchmarks

### Expected Latency
- **History matching**: <10ms
- **LLM cold start**: First request ~500ms (model load)
- **LLM warm requests**: 116-250ms (tested on M4)

### Menu Responsiveness
- **Menu appears**: Instant (shows loading spinner)
- **History results**: <20ms
- **LLM results**: <250ms (or timeout)

## Settings Configuration

### In `~/.config/aiterminal/settings.json`
```json
{
  "autocomplete": {
    "enable_inline": true,
    "enable_menu": true
  }
}
```

### Disable LLM Menu
Set `enable_menu: false` to use only inline history autocomplete.

## Next Steps

### Phase 1: Validate Integration ✅ Done
- [x] Create all components
- [x] Wire into Terminal.tsx
- [x] Fix TypeScript errors

### Phase 2: Test & Debug (Current)
- [ ] Build and run app
- [ ] Test Ctrl+Space triggers menu
- [ ] Verify LLM initializes
- [ ] Check suggestions appear
- [ ] Test keyboard navigation
- [ ] Test error handling

### Phase 3: Prompt Engineering
- [ ] Test different prompt formats
- [ ] Add more context (file types, recent commands)
- [ ] Fine-tune temperature/tokens
- [ ] Test multi-line command handling

### Phase 4: Settings UI
- [ ] Add toggle to SettingsModal
- [ ] Add model path picker
- [ ] Add temperature slider
- [ ] Add "Download Model" button
- [ ] Add server status indicator

### Phase 5: Polish
- [ ] Improve menu positioning (handle screen edges)
- [ ] Add fuzzy matching for history
- [ ] Add command explanation tooltips
- [ ] Add statistics (cache hit rate, latency)
- [ ] Add A/B testing metrics

## Troubleshooting

### Menu Doesn't Appear
1. Check settings: `enable_menu` is true
2. Check console: Any errors?
3. Check terminal has focus
4. Try typing a partial command first

### LLM Suggestions Empty
1. Check model downloaded
2. Check llama-server running: `lsof -i :8765`
3. Check health: `curl http://localhost:8765/health`
4. Check Rust logs for errors

### Keyboard Navigation Broken
1. Check menu has focus (click it)
2. Check browser DevTools console
3. Verify `selectedIndex` updates in React DevTools

### Suggestions Look Wrong
1. Expected! Model not trained for this task
2. Requires prompt engineering (Phase 3)
3. Consider switching to different model (Codestral, etc.)

## Future Improvements

### Short Term
- [ ] Better prompts
- [ ] CWD tracking improvements
- [ ] Last command tracking
- [ ] Settings UI

### Medium Term
- [ ] Multiple model support (Codestral, DeepSeek)
- [ ] Command explanation (hover tooltip)
- [ ] Fuzzy matching
- [ ] Learning from accepted suggestions

### Long Term
- [ ] Fine-tuned model for shell commands
- [ ] Distributed model (remote server option)
- [ ] Command chaining suggestions
- [ ] Error correction suggestions
