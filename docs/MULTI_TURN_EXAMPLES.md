# Multi-Turn Tool Loop Example

This document demonstrates how the AI agent can chain multiple tool calls to accomplish complex tasks.

## Example 1: Finding and Reading a File

**User**: "Find all Python files in the project and show me the first one"

### Turn 1: AI requests tool
```json
{
  "tool_calls": [{
    "id": "call_123",
    "name": "search_files",
    "arguments": {
      "pattern": "*.py",
      "directory": "."
    }
  }]
}
```

**User approves** → Tool executes → Returns: `main.py, utils.py, config.py`

### Turn 2: AI receives result and requests another tool
```json
{
  "content": "I found 3 Python files. Let me read the first one.",
  "tool_calls": [{
    "id": "call_456",
    "name": "read_file",
    "arguments": {
      "path": "main.py"
    }
  }]
}
```

**User approves** → Tool executes → Returns file content

### Turn 3: AI provides final answer
```json
{
  "content": "Here's the content of main.py:\n\n[content displayed]\n\nThis file contains the main entry point of the application..."
}
```

## Example 2: Environment Check

**User**: "What version of Python do I have and where is it installed?"

### Turn 1: Check Python version
```json
{
  "tool_calls": [{
    "id": "call_789",
    "name": "execute_command",
    "arguments": {
      "command": "python --version"
    }
  }]
}
```

Result: `Python 3.11.5`

### Turn 2: Find Python path
```json
{
  "content": "You have Python 3.11.5. Let me find where it's installed.",
  "tool_calls": [{
    "id": "call_abc",
    "name": "execute_command",
    "arguments": {
      "command": "which python"
    }
  }]
}
```

Result: `/usr/local/bin/python`

### Turn 3: Final answer
```json
{
  "content": "You're running Python 3.11.5, installed at /usr/local/bin/python"
}
```

## Example 3: Complex Analysis

**User**: "Analyze the package.json and tell me if any dependencies are outdated"

### Turn 1: Read package.json
```json
{
  "tool_calls": [{
    "id": "call_def",
    "name": "read_file",
    "arguments": {
      "path": "package.json"
    }
  }]
}
```

Result: Package.json content

### Turn 2: Check installed versions
```json
{
  "content": "I'll check the current versions of your main dependencies.",
  "tool_calls": [{
    "id": "call_ghi",
    "name": "execute_command",
    "arguments": {
      "command": "npm outdated --json"
    }
  }]
}
```

Result: Outdated packages list

### Turn 3: Get latest versions
```json
{
  "content": "Found some outdated packages. Let me check the latest versions.",
  "tool_calls": [{
    "id": "call_jkl",
    "name": "execute_command",
    "arguments": {
      "command": "npm view react version"
    }
  }]
}
```

Result: Latest version info

### Turn 4: Final analysis
```json
{
  "content": "Here's your dependency status:\n\n✅ Up to date:\n- vite 5.4.11\n- typescript 5.3.3\n\n⚠️ Outdated:\n- react: 18.2.0 → 18.3.1 available\n- react-dom: 18.2.0 → 18.3.1 available\n\nWould you like me to update them?"
}
```

## Key Features Demonstrated

1. **Sequential Tool Execution**: AI requests tools one after another based on previous results
2. **Context Awareness**: Each tool result informs the next decision
3. **User Control**: Every tool call requires approval (safety first!)
4. **Natural Flow**: AI provides updates between tool calls
5. **Complex Reasoning**: Can chain 3+ tools to accomplish sophisticated tasks

## How It Works

1. **User sends message** → AI analyzes and plans tool usage
2. **AI requests tool(s)** → Frontend shows confirmation modal
3. **User approves** → Tool executes on backend
4. **Result added to chat** → `continueChatWithHistory()` called
5. **AI receives full history** → Makes informed decision:
   - Continue with more tools
   - Provide final answer
   - Ask clarifying questions
6. **Loop continues** until task complete

## Safety Mechanisms

- **Approval Required**: Every tool call must be explicitly approved
- **Dangerous Command Warnings**: Destructive commands highlighted in red
- **Edit Before Execute**: User can modify tool arguments
- **Deny Option**: User can reject any tool call
- **Context Preservation**: Full conversation history maintained for transparency

## Testing Tips

1. **Start Simple**: "List files in current directory"
2. **Add Complexity**: "Find all TypeScript files and count lines in each"
3. **Test Chains**: "Check if Python is installed, then run a test script"
4. **Test Errors**: Request non-existent files to see error handling
5. **Test Dangerous**: Try `rm -rf` to verify warning system

## Configuration

No special configuration needed! The system:
- ✅ Auto-detects when AI wants to use tools
- ✅ Shows confirmation UI automatically
- ✅ Handles results and continues conversation
- ✅ Works with any OpenAI-compatible provider

Just configure your AI provider (OpenAI, etc.) in Settings and start chatting!
