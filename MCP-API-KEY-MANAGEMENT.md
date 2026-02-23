# MCP API Key Management

## Overview

Added support for secure API key management for MCP (Model Context Protocol) servers that require authentication. MCP servers like Brave Search, GitHub, Slack, etc. now have a dedicated UI in Settings to configure API keys.

## Changes Made

### 1. Settings Structure (`SettingsContext.tsx`)

Updated `MCPServerConfig` interface to include:
- `api_key_env_var?: string` - The environment variable name the MCP server expects (e.g., `BRAVE_API_KEY`)
- `api_key?: string` - The actual API key value (stored in `~/.config/aiterminal/settings.json`)

### 2. MCP Integration (`tools-vercel.ts`)

**API Key Injection**:
When initializing MCP servers, the system now:
1. Checks if a server has `api_key_env_var` and `api_key` defined
2. Injects the API key into the server's environment variables
3. Passes the complete environment to the Rust backend for spawning the MCP process

```typescript
const configsWithEnv = configs.map(config => {
  if (config.api_key_env_var && config.api_key) {
    return {
      ...config,
      env: {
        ...config.env,
        [config.api_key_env_var]: config.api_key,
      },
    };
  }
  return config;
});
```

**Default Brave Search Configuration**:
```typescript
{
  name: "brave-search",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-brave-search"],
  enabled: false,  // User must add API key first
  api_key_env_var: "BRAVE_API_KEY",
  api_key: "",  // User sets in Settings UI
  env: {},  // Populated at runtime with API key
}
```

### 3. Settings UI (`SettingsModal.tsx`)

**MCP Servers Tab Improvements**:
- Shows API key input field for servers that require one (`api_key_env_var` is set)
- Password-masked input for security
- Required indicator when API key is missing
- Direct link to API key provider (e.g., https://brave.com/search/api/)
- Added "+ Add Brave Search" button to easily add the pre-configured server

**UI Features**:
- Toggle MCP servers on/off
- Remove MCP servers
- API key input appears only for servers that need it
- Visual feedback for required API keys

### 4. Type Definitions

Updated in 3 places for consistency:
- `src/context/SettingsContext.tsx` - Main app settings
- `src/ai/mcp/mcpTypes.ts` - MCP module types
- `src/ai/tools-vercel.ts` - Local interface (to be removed/consolidated later)

## Usage

### Adding Brave Search

1. Open Settings (Cmd+, or gear icon)
2. Go to "MCP Servers" tab
3. Click "+ Add Brave Search"
4. Get API key from https://brave.com/search/api/
5. Paste API key into the input field
6. Check the "brave-search" checkbox to enable
7. Save settings

The AI can now use `brave_search_web` and `brave_search_local` tools!

### Adding Custom MCP Servers with API Keys

Manually edit `~/.config/aiterminal/settings.json`:

```json
{
  "mcp_servers": [
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "enabled": true,
      "api_key_env_var": "GITHUB_TOKEN",
      "api_key": "ghp_your_token_here",
      "env": {}
    }
  ]
}
```

The app will automatically inject `GITHUB_TOKEN=ghp_your_token_here` into the environment when spawning the MCP server.

## Security Considerations

### Current Storage
- API keys are stored in plaintext in `~/.config/aiterminal/settings.json`
- File permissions should be set to 600 (user read/write only)
- Similar to how the AI API key is currently stored

### Future Improvements (TODO)
- [ ] Store MCP API keys in system keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- [ ] Add "Save to Keychain" button for MCP API keys (similar to AI API key)
- [ ] Warn users about plaintext storage
- [ ] Environment variable fallback (check `process.env` before using stored value)

## Architecture Notes

### Why API Keys are Injected at Runtime

MCP servers are spawned as separate processes by the Rust backend. The API key injection happens at the TypeScript layer before passing configs to Rust because:

1. **Security**: API keys aren't hardcoded in server definitions
2. **Flexibility**: Users can enable/disable servers without editing JSON
3. **UI Integration**: Settings modal provides a clean interface for API key management
4. **Consistency**: All MCP server environment setup happens in one place

### PTY Tools vs MCP Tools

**PTY Tools** (29 tools):
- Run in the active terminal session
- Work over SSH, containers, sudo, etc.
- No API keys needed (use terminal environment)
- Examples: `read_file`, `execute_command`, `git_status`

**MCP Tools** (external APIs only):
- Run as separate processes locally
- Often require API keys for external services
- Examples: `brave_search`, `github_*`, `slack_*`
- Should NOT duplicate PTY functionality (filesystem operations stay with PTY)

## Testing

### Verify Build
```bash
npm run build
```

### Test in Development
1. Start app: `npm run tauri dev`
2. Open Settings → MCP Servers
3. Add Brave Search
4. Enter test API key (or get free tier from Brave)
5. Enable the server
6. Ask AI: "search the web for latest React 19 features"
7. Check if `brave_search_web` tool is called

### Check API Key Injection
Look at Rust logs when MCP servers initialize - should see environment variables passed correctly.

## Known Limitations

1. **No Keychain Integration Yet**: API keys stored in plaintext (same as AI API key)
2. **No Input Validation**: Doesn't check if API key format is valid
3. **No Test Connection**: Can't verify API key works before saving (unlike AI API key test)
4. **Manual JSON Editing**: Custom MCP servers still require editing settings.json
5. **Type Duplication**: `MCPServerConfig` defined in 3 places (should consolidate)

## Next Steps

### High Priority
- [ ] Add keychain support for MCP API keys
- [ ] Add GitHub MCP server preset (with `GITHUB_TOKEN`)
- [ ] Add test/validate button for API keys

### Medium Priority  
- [ ] UI for adding custom MCP servers (no JSON editing)
- [ ] MCP server marketplace/browser
- [ ] Environment variable fallback (respect `$BRAVE_API_KEY` if set)

### Low Priority
- [ ] Consolidate `MCPServerConfig` type definition to one place
- [ ] Add more default MCP servers (Slack, Linear, Notion)
- [ ] Per-server logging/debugging in UI

## References

- **Brave Search API**: https://brave.com/search/api/
- **MCP Servers Directory**: https://github.com/modelcontextprotocol/servers
- **MCP Specification**: https://modelcontextprotocol.io/
