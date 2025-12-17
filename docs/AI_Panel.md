# AI Feature Specification & Architecture

## 1. Overview
The AI Terminal integrates a context-aware AI assistant directly into the terminal workflow. Unlike a standard side-chat, this assistant allows users to "stage" specific terminal artifacts (commands, outputs, selections) as context for the AI to analyze.

## 2. UI Architecture

### 2.1. Layout
- **Split Pane**: The main window is divided into the Terminal (Left) and AI Panel (Right).
- **Collapsible**: The AI Panel can be toggled (Open/Closed). When closed, the Terminal expands to fill 100% width.
- **Resizing**: (Optional for v1) Draggable divider between Terminal and AI Panel.

### 2.2. AI Panel Components
The panel contains two main tabs:

#### A. Chat Tab
- **Message History**: Scrollable list of user/assistant messages.
- **Input Area**: Text area for user prompts.
- **Quick Actions Bar**: Buttons for common tasks (e.g., "Explain Last Error").
- **Controls**: "Clear Chat" button to reset history.

#### B. Context Tab
- **Purpose**: A dedicated space to manage the "Staged Context" that will be sent with the next message.
- **List View**: Cards representing each context item.
- **Controls**:
  - **Remove (x)**: Delete specific context items.
  - **Preview**: Expand to see the full text of the context (useful for large outputs).
  - **Clear All**: Remove all staged context.

## 3. Data Structures

### 3.1. Context Item
```typescript
type ContextType = 'command' | 'output' | 'selection' | 'file';

interface ContextItem {
  id: string;
  type: ContextType;
  content: string;
  timestamp: number;
  metadata?: {
    command?: string; // For 'output' type, what command generated it?
    exitCode?: number;
    cwd?: string;
  };
}
```

### 3.2. Chat Message
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}
```

## 4. Context Management Workflow

### 4.1. Adding Context
1.  **Text Selection**:
    - User highlights text in the terminal.
    - A "Floating Action Button" (FAB) appears near the cursor.
    - Click -> Adds `ContextItem` (type: 'selection').
2.  **Command Markers**:
    - User clicks the status icon (✔/✘) of a command.
    - Menu options: "Add Output to Context", "Add Command to Context".
    - Click -> Adds `ContextItem` (type: 'command' or 'output').
3.  **Quick Actions**:
    - Button in AI Panel: "Add Last Command & Output".
    - Logic: Queries the shell integration history for the most recent entry.

### 4.2. Using Context (Prompt Construction)
When the user sends a message, the system constructs the prompt dynamically:

**System Prompt**:
> "You are an expert terminal assistant. You help users debug commands, write scripts, and understand system outputs."

**User Message Construction**:
```text
[Context Items]
Type: command
Content: git commit -m "wip"

Type: output
Content: error: pathspec 'wip' did not match any file(s) known to git

[User Query]
Why did this fail?
```

*Note: If the Context List is empty, the [Context Items] section is omitted.*

## 5. Quick Actions & "Magic" Buttons

### 5.1. "Explain Error"
- **Trigger**: Button in AI Panel or Context Menu on a failed command.
- **Action**:
  1.  Auto-captures the last command and its output.
  2.  Adds them as temporary context.
  3.  Sends prompt: "Explain this error and suggest a fix."

### 5.2. "Suggest Command"
- **Trigger**: User types a natural language query in Input.
- **Action**: AI responds with a code block.
- **Enhancement**: A "Run" button appears next to the code block in the chat to insert it into the terminal.

## 6. Implementation Plan

### Phase 1: Core Infrastructure (Current Focus)
- [ ] **AIContext**: React Context to hold `items[]` and `messages[]`.
- [ ] **Layout**: Implement the Collapsible Split Pane in `App.tsx`.
- [ ] **Panel UI**: Build the Tab interface (Chat/Context).

### Phase 2: Terminal Integration
- [ ] **Selection Listener**: Detect xterm.js selection events.
- [ ] **Floating UI**: Implement the "Add to Context" button overlay.
- [ ] **Marker Integration**: Hook into the existing marker system to extract command/output data.

### Phase 3: LLM Integration
- [ ] **Prompt Builder**: Function to serialize `ContextItem[]` into string format.
- [ ] **API Client**: Connect to the configured provider (OpenAI/Anthropic/etc) using settings.

## 7. UX Refinements & Suggestions
- **Context Indicators**: While the "Context Tab" is great for management, the "Chat Tab" should probably show a small counter (e.g., "3 items attached") near the input box so the user knows context is active without switching tabs.
- **Auto-Pruning**: Large outputs (e.g., 1MB logs) should be truncated in the prompt but preserved in the UI, or summarized if the model supports it.
- **"Fix It" Button**: If a command fails, a small "Fix" button could appear directly in the terminal row, bypassing the need to open the panel manually.
