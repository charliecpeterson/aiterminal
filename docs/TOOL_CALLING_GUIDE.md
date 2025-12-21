# Tool Calling System - Implementation Guide

## ✅ Phase 1 Complete: Foundation

### What's Built

**1. Tool Definition System** ([src/ai/tools.ts](../src/ai/tools.ts))
- ✅ 6 core tools defined with JSON schemas:
  - `execute_command` - Run shell commands
  - `read_file` - Read file contents
  - `list_directory` - List directory contents
  - `search_files` - Find files by pattern
  - `get_current_directory` - Get current working directory
  - `get_environment_variable` - Get environment variables
- ✅ Safety checks for dangerous commands
- ✅ OpenAI and Anthropic format converters
- ✅ Tool call parsing and validation

**2. Tool Execution Engine** ([src/ai/toolExecutor.ts](../src/ai/toolExecutor.ts))
- ✅ Async execution framework
- ✅ Error handling
- ✅ Result formatting
- ⚠️ Placeholder Rust commands (need implementation)

**3. Tool Confirmation UI** ([src/components/ToolConfirmation.tsx](../src/components/ToolConfirmation.tsx))
- ✅ Beautiful modal interface
- ✅ Approve/Deny/Edit actions
- ✅ Dangerous command warnings
- ✅ Batch approval
- ✅ Command editing for execute_command

---

## 🔧 Next Steps: Backend Integration

### Phase 2: Add Rust Tool Commands

Need to implement these Tauri commands in `src-tauri/src/lib.rs`:

```rust
#[tauri::command]
async fn execute_tool_command(command: String) -> Result<CommandResult, String> {
    // Execute command and capture output
    // Return stdout, stderr, exit_code
}

#[tauri::command]
async fn read_file_tool(path: String, max_bytes: usize) -> Result<String, String> {
    // Read file with size limit
}

#[tauri::command]
async fn list_directory_tool(path: String, show_hidden: bool) -> Result<Vec<String>, String> {
    // List directory contents
}

#[tauri::command]
async fn search_files_tool(pattern: String, max_results: usize) -> Result<Vec<String>, String> {
    // Search for files matching pattern
}

#[tauri::command]
async fn get_current_directory_tool(terminal_id: Option<u32>) -> Result<String, String> {
    // Get current directory (from terminal state if provided)
}

#[tauri::command]
async fn get_env_var_tool(variable: String) -> Result<Option<String>, String> {
    // Get environment variable
}
```

---

### Phase 3: AI Provider Integration

Update the AI streaming to support tool calling:

**For OpenAI** (already uses function calling):
```rust
// In ai_chat_stream for OpenAI
let body = serde_json::json!({
    "model": model,
    "stream": true,
    "messages": messages,
    "tools": tools,  // Add tool definitions
    "tool_choice": "auto",
});
```

**For Anthropic** (uses tool use):
```rust
// In ai_chat_stream for Anthropic
let body = serde_json::json!({
    "model": model,
    "max_tokens": max_tokens,
    "messages": messages,
    "tools": tools,  // Add tool definitions
});
```

---

### Phase 4: Wire Up Frontend

**1. Integrate with AIContext**

Add tool call state to AIContext:

```typescript
// In AIContext.tsx
interface AIState {
  contextItems: ContextItem[];
  messages: ChatMessage[];
  pendingToolCalls: PendingToolCall[];  // Add this
}

// Add actions
| { type: 'tool:add'; toolCalls: PendingToolCall[] }
| { type: 'tool:update'; id: string; status: string; result?: string }
| { type: 'tool:clear' }
```

**2. Update AIPanel to Show Tool Confirmation**

```typescript
// In AIPanel.tsx
import { ToolConfirmation } from './ToolConfirmation';
import { executeTool } from '../ai/toolExecutor';

// In component
const { pendingToolCalls, addToolCalls, updateToolCall } = useAIContext();

const handleApprove = async (id: string) => {
  const toolCall = pendingToolCalls.find(tc => tc.id === id);
  if (!toolCall) return;
  
  updateToolCall(id, 'executing');
  const result = await executeTool(toolCall, activeTerminalId);
  updateToolCall(id, result.success ? 'completed' : 'failed', result.output);
  
  // Send result back to AI
  continueConversationWithToolResult(result);
};

// Render
<ToolConfirmation
  toolCalls={pendingToolCalls}
  onApprove={handleApprove}
  onDeny={(id) => updateToolCall(id, 'denied')}
  onEdit={(id, args) => updateToolCallArgs(id, args)}
/>
```

**3. Parse Tool Calls from AI Stream**

```typescript
// When receiving streaming chunks, detect tool calls
// OpenAI sends: { delta: { tool_calls: [...] } }
// Anthropic sends: { type: 'tool_use', id, name, input }

// Parse and add to pending state
if (chunk.tool_calls) {
  const parsed = parseToolCalls(chunk.tool_calls);
  addToolCalls(parsed);
}
```

---

## 🎯 Quick Implementation Order

**30 minutes:**
1. Add Rust commands for tools (start with execute_command and read_file)
2. Test tool execution from frontend

**1 hour:**
3. Update AI streaming to include tool definitions
4. Parse tool calls from streaming response

**1 hour:**
5. Wire ToolConfirmation into AIPanel
6. Implement tool result feedback to AI
7. Test full loop

---

## 🧪 Testing Plan

### Test Case 1: Simple Command
```
User: "What Python version do I have?"
AI: [tool_call] execute_command("python --version")
User: [Approves]
Tool: "Python 3.11.5"
AI: "You have Python 3.11.5 installed."
```

### Test Case 2: Multi-Step
```
User: "Find all Python files and tell me which imports numpy"
AI: [tool_call] search_files("*.py")
User: [Approves]
Tool: "main.py\ntest.py\nutils.py"
AI: [tool_call] read_file("main.py")
User: [Approves]
Tool: [file contents]
AI: "main.py imports numpy on line 5"
```

### Test Case 3: Dangerous Command
```
User: "Delete all log files"
AI: [tool_call] execute_command("rm -rf /var/log/*")
User: [Sees warning: "Recursive force deletion"]
User: [Denies]
AI: "I understand. Would you like to review the files first?"
```

---

## 🔒 Safety Features

✅ **Explicit Approval Required** - All tools need confirmation
✅ **Dangerous Command Detection** - Warns on rm -rf, sudo, etc.
✅ **Command Editing** - User can modify commands before execution
✅ **Reasoning Display** - AI must explain why it wants to use tool
✅ **Execution Sandboxing** - Tools run with proper error handling

---

## 🚀 Future Enhancements

- **Auto-approve safe commands** (cd, ls, pwd, etc.)
- **Tool usage history** - Learn user preferences
- **Parallel tool execution** - Run multiple non-conflicting tools
- **Tool output streaming** - Show real-time output for long commands
- **Tool templates** - Save common tool sequences
- **Remote execution** - Run tools over SSH
- **Tool result caching** - Avoid re-running identical commands

---

## 📊 Current Status

- ✅ Tool definitions
- ✅ Tool executor framework
- ✅ Confirmation UI
- ⏳ Rust backend implementation
- ⏳ AI provider integration
- ⏳ Frontend wiring
- ⏳ Testing

**Estimated remaining time:** 2-3 hours for full MVP
