# Tool Calling Troubleshooting Guide

## Issue: AI doesn't respond or gives blank responses

### Symptoms
- You ask a question like "what files are in my directory"
- AI returns a blank/empty response
- No tool confirmation modal appears
- No error message shown

### Possible Causes & Solutions

## 1. ❌ No API Key Configured

**Check**: Settings → AI → API Key

**Solution**:
1. Click "SETTINGS" button (top right)
2. Navigate to AI section
3. Enter your OpenAI API key
4. Select a model (e.g., gpt-4o, gpt-4-turbo)
5. Click Save
6. Try your question again

## 2. 🚫 Model Doesn't Support Function Calling

Some models don't support tool calling:
- ❌ o1, o1-mini, o1-preview (reasoning models)
- ❌ gpt-3.5-turbo (older versions)
- ✅ gpt-4o, gpt-4-turbo, gpt-4
- ✅ gpt-3.5-turbo-1106 and newer

**Solution**: Change model in Settings to `gpt-4o` or `gpt-4-turbo`

## 3. 🔍 Check Browser Console

**How to open**:
- Chrome/Edge: F12 or Cmd+Option+I (Mac)
- Look for errors in the Console tab

**What to look for**:
- `❌ AI request failed:` - Shows API errors
- `🔧 Sending request with tools:` - Confirms tools are being sent
- `OpenAI error:` - API rejected the request
- Network errors or CORS issues

## 4. 🌐 Network/Proxy Issues

If using a corporate network or VPN:
- Firewall might block OpenAI API
- Proxy settings might interfere
- Try different network

## 5. 💰 API Credits/Rate Limits

**OpenAI errors**:
- `insufficient_quota` - No API credits left
- `rate_limit_exceeded` - Too many requests
- `invalid_api_key` - Key is wrong or revoked

**Solution**: Check OpenAI dashboard at https://platform.openai.com/account/billing

## 6. 🔧 Provider-Specific Issues

### OpenAI
- URL should be blank (uses default)
- API key format: `sk-proj-...` or `sk-...`
- Model must support function calling

### Anthropic (Claude)
- Not yet implemented (coming soon!)
- Will show error if selected

### Ollama (Local)
- Must be running: `ollama serve`
- URL: `http://localhost:11434`
- Not all models support tool calling
- Try `llama3.1` or newer models

## Debugging Steps

### Step 1: Test Basic Chat
1. Open AI Panel
2. Type: "Hi"
3. Expected: AI responds normally

If this fails → Check API key and model configuration

### Step 2: Test Simple Command
1. Type: "What's 2+2?"
2. Expected: AI responds without tools

If this fails → API/model configuration issue

### Step 3: Test Tool Call
1. Type: "What files are in my directory?"
2. Expected: Tool confirmation modal appears

If this fails → Check console for:
- `🔧 Sending request with tools: 6 tools defined`
- API errors
- Model compatibility

### Step 4: Check Logs

**Frontend (Browser Console)**:
```
🔧 Sending request with tools: 6 tools defined
Tool calls received: [...]
```

**Backend (Terminal running `npm run tauri dev`)**:
```
📤 Sending OpenAI request to: https://api.openai.com/v1/chat/completions
🔧 Including 6 tools in request
✅ OpenAI request successful, streaming response
```

## Common Fixes

### Fix 1: Clear and Retry
1. Click "Clear Chat" button
2. Refresh the page (Cmd+R)
3. Try again

### Fix 2: Reconfigure Settings
1. Open Settings
2. Delete API key
3. Re-enter API key
4. Change model to `gpt-4o`
5. Save
6. Test

### Fix 3: Check Settings File
Settings stored at: `~/.config/aiterminal/settings.json`

**View it**:
```bash
cat ~/.config/aiterminal/settings.json
```

**Expected**:
```json
{
  "ai": {
    "provider": "openai",
    "model": "gpt-4o",
    "api_key": "sk-...",
    "url": ""
  }
}
```

### Fix 4: Development Mode Logs
If running `npm run tauri dev`, watch terminal output for errors

## Testing Without Tools

To verify AI is working at all (tools disabled), you can temporarily comment out the tools line:

**File**: `src/ai/chatSend.ts`

```typescript
// const tools = toOpenAIFunctions();
// tools: JSON.stringify(tools),
```

Then rebuild (`npm run build`) and test basic chat.

## Model Compatibility Matrix

| Model | Tool Calling | Recommended |
|-------|-------------|-------------|
| gpt-4o | ✅ Yes | ⭐ Best |
| gpt-4-turbo | ✅ Yes | ⭐ Good |
| gpt-4 | ✅ Yes | ⭐ Good |
| gpt-3.5-turbo | ✅ Yes (new versions) | ⚠️ Limited |
| o1 / o1-mini | ❌ No | ❌ Won't work |
| claude-3.5-sonnet | 🔜 Coming soon | - |
| llama3.1 (Ollama) | ✅ Yes | ⚠️ Local only |

## Still Not Working?

1. **Check this file** for error messages:
   - Browser console (F12)
   - Terminal running tauri dev

2. **Try minimal test**:
   ```javascript
   // In browser console
   console.log('Testing AI:', window.location.href);
   ```

3. **Report issue** with:
   - Browser console errors
   - Backend terminal output
   - Settings configuration (hide API key!)
   - Model being used

## Quick Verification Checklist

- [ ] API key is set in Settings
- [ ] Model is `gpt-4o` or `gpt-4-turbo`
- [ ] Provider is `openai`
- [ ] No errors in browser console
- [ ] Basic chat ("Hi") works
- [ ] Tool request triggers confirmation modal

If all checked and still failing, there may be a code issue - check console logs!
