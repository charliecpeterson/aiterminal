# MCP API Key Management

## Overview

Added comprehensive MCP (Model Context Protocol) server management with:
1. **API key support** for servers requiring authentication
2. **Pre-configured presets** (Brave Search)
3. **Custom MCP form** to add any MCP server from the 700+ community ecosystem

Users can now add any MCP server without editing JSON files manually.

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

**MCP Servers Tab Features**:

**Pre-configured Servers**:
- "+ Add Brave Search" button for quick web search integration
- More presets can be added easily (GitHub, Slack, etc.)

**Custom MCP Form**:
- "+ Add Custom MCP" button opens a form
- Fields:
  - **Server Name** (required) - Display name for the MCP
  - **NPM Package** (required) - Package name (e.g., `@modelcontextprotocol/server-github`)
  - **Requires API Key** (checkbox) - Toggle API key fields
  - **Environment Variable Name** - Name of env var (e.g., `GITHUB_TOKEN`)
  - **API Key** - The actual API key value
- Links to MCP directories:
  - https://www.mcplist.ai/ (700+ community servers)
  - https://github.com/modelcontextprotocol/servers (official)

**Server Management**:
- Toggle servers on/off
- Edit API keys inline
- Remove servers
- See command/args for each server

**UI Features**:
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

### Quick Start: Add Brave Search

1. Open Settings → MCP Servers tab
2. Click "+ Add Brave Search"
3. Get free API key from https://brave.com/search/api/
4. Paste API key into the input field
5. Check the "brave-search" checkbox to enable
6. Save settings

### Add Any Custom MCP Server

1. Open Settings → MCP Servers tab
2. Click "+ Add Custom MCP"
3. Fill in the form:
   - **Server Name**: `github` (or any name)
   - **NPM Package**: `@modelcontextprotocol/server-github`
   - **Requires API Key**: ✓ (if needed)
   - **Env Variable**: `GITHUB_TOKEN`
   - **API Key**: `ghp_your_token_here`
4. Click "Add Server"
5. Enable the checkbox to activate
6. Save settings

**Popular MCPs to Try**:
- `@modelcontextprotocol/server-github` - GitHub API integration (needs `GITHUB_TOKEN`)
- `@modelcontextprotocol/server-slack` - Slack messaging (needs `SLACK_TOKEN`)
- `@modelcontextprotocol/server-postgres` - PostgreSQL queries (needs `DATABASE_URL`)
- `@modelcontextprotocol/server-google-drive` - Google Drive access (needs OAuth)

**Find More**: Browse https://www.mcplist.ai/ for 700+ community servers!

### Adding Custom MCP Servers with API Keys

**Via UI** (Recommended):
Use the "+ Add Custom MCP" form in Settings → MCP Servers tab.

**Via JSON** (Advanced):
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
4. **Type Duplication**: `MCPServerConfig` defined in 3 places (should consolidate)
5. **NPM-only**: Custom form assumes `npx` command (can edit JSON for custom commands)

## Next Steps

### High Priority
- [ ] Add keychain support for MCP API keys
- [ ] Add more presets (GitHub, Slack with one-click setup)
- [ ] Add test/validate button for API keys
- [ ] Show tool count for each MCP server

### Medium Priority  
- [ ] MCP server health status (connected/disconnected)
- [ ] Browse MCP marketplace in-app (fetch from mcplist.ai API)
- [ ] Environment variable fallback (respect `$BRAVE_API_KEY` if set)
- [ ] Custom command support in UI (not just npx)

### Low Priority
- [ ] Consolidate `MCPServerConfig` type definition to one place
- [ ] Per-server logging/debugging in UI
- [ ] MCP server presets with descriptions/screenshots
- [ ] Import/export MCP configurations

## References

- **Brave Search API**: https://brave.com/search/api/
- **MCP Servers Directory**: https://github.com/modelcontextprotocol/servers
- **MCP Specification**: https://modelcontextprotocol.io/
