# Inline Command Suggestions - Implementation Guide

## Problem
Real-time AI suggestions are computationally expensive. Even small local models add 50-200ms latency, which feels sluggish for typing.

## Recommended Approach: Hybrid System

### Phase 1: Smart Non-AI Suggestions (Zero Latency) ✅

**What works well:**
```typescript
// 1. Command History Matching
$ git co█
  ↳ git commit -m "fix" (you used this 5 min ago)

// 2. Directory Context
$ cd ~/pro█
  ↳ cd ~/projects/AIterminal (you visit this often)

// 3. Git-Aware Completions
$ git push origin█
  ↳ git push origin main (current branch)

// 4. Common Patterns
$ npm █
  ↳ npm install (most common in this directory)
```

**Implementation:**
- Parse `~/.bash_history` or `~/.zsh_history`
- Track frequency & recency of commands
- Use current directory for context
- Check if in git repo for smart git completions
- ~0ms latency, no API calls

### Phase 2: AI on Explicit Request ⚡

**Trigger:** User presses `Ctrl+Space` or types natural language

```typescript
// Natural language query
$ how do i find files larger than 100MB█  [User presses Ctrl+Space]
  ⟳ Generating...
  ↳ find . -type f -size +100M -exec ls -lh {} \;
  [Tab] to accept | [Esc] to dismiss
```

**Benefits:**
- Uses your existing AI provider (no new infrastructure)
- Only runs when requested (controlled cost)
- Can use stronger models (Claude, GPT-4)
- Handles complex queries that history can't

### Phase 3: Tiny Local Model (Optional) 🚀

**Only if you need true auto-complete:**

**Best Options:**
1. **Qwen2.5-Coder 1.5B** (Recommended)
   - Size: ~1GB GGUF Q4
   - Latency: 50-80ms on M1/M2
   - Quality: Good for commands
   ```bash
   ollama pull qwen2.5-coder:1.5b
   ```

2. **DeepSeek-Coder 1.3B**
   - Size: ~900MB
   - Latency: 40-70ms
   - Quality: Decent

3. **Phi-3-mini** (3.8B)
   - Size: ~2GB
   - Latency: 100-150ms
   - Quality: Better but slower

**Implementation with Ollama:**
```bash
# Install Ollama
brew install ollama

# Pull model
ollama pull qwen2.5-coder:1.5b

# Test
ollama run qwen2.5-coder:1.5b "Complete: git push origin"
```

**In your app:**
```typescript
async function getLocalSuggestion(input: string, context: string) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'qwen2.5-coder:1.5b',
      prompt: `Complete this shell command: ${input}\nContext: ${context}`,
      stream: false,
      options: {
        num_predict: 30,  // Only generate command, not explanation
        temperature: 0.3,
        stop: ['\n', '$', '#']
      }
    })
  });
  return await response.json();
}
```

**Optimizations:**
- Run in background process (low CPU priority)
- Debounce requests (only after 300ms pause)
- Cancel previous request if user keeps typing
- Cache common suggestions
- Only suggest for commands >3 characters

## Performance Comparison

| Approach | Latency | Quality | Cost | Setup |
|----------|---------|---------|------|-------|
| History matching | 0ms | Good | Free | Easy |
| AI on-demand | 500-2000ms | Excellent | API costs | Easy |
| Tiny local LLM | 50-150ms | Good | Free | Medium |
| Full local LLM (7B+) | 200-500ms | Excellent | Free | Hard |

## Recommended Implementation Order

### Week 1: Smart History-Based
```typescript
// src/terminal/suggestions.ts
interface Suggestion {
  text: string;
  score: number;
  source: 'history' | 'git' | 'common';
}

function getSuggestions(input: string, context: Context): Suggestion[] {
  const suggestions: Suggestion[] = [];
  
  // 1. Check command history
  const historyMatches = searchHistory(input);
  suggestions.push(...historyMatches);
  
  // 2. Git context
  if (context.isGitRepo) {
    const gitSuggestions = getGitSuggestions(input, context.branch);
    suggestions.push(...gitSuggestions);
  }
  
  // 3. Common patterns
  const commonPatterns = getCommonPatterns(input, context.cwd);
  suggestions.push(...commonPatterns);
  
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
}
```

### Week 2: AI Integration (Ctrl+Space)
```typescript
// Add keyboard shortcut
xterm.onKey(({ key, domEvent }) => {
  if (domEvent.ctrlKey && domEvent.key === ' ') {
    const currentLine = getCurrentLine(xterm);
    showAISuggestion(currentLine);
  }
});

async function showAISuggestion(input: string) {
  const suggestion = await callAIProvider({
    system: "You are a shell command assistant. Complete the command or convert natural language to shell command.",
    user: input,
    max_tokens: 100
  });
  
  displaySuggestion(suggestion);
}
```

### Week 3: Local LLM (Optional)
```typescript
// Check if Ollama is running
const hasLocalLLM = await checkOllamaHealth();

if (hasLocalLLM) {
  // Enable background suggestions
  enableAutoSuggestions();
}

// Debounced suggestions
let suggestionTimeout: number;
function onTerminalInput(input: string) {
  clearTimeout(suggestionTimeout);
  suggestionTimeout = setTimeout(async () => {
    if (input.length > 3) {
      const suggestion = await getLocalSuggestion(input);
      showInlineSuggestion(suggestion);
    }
  }, 300);
}
```

## UI Design for Suggestions

**Inline Ghost Text** (Like GitHub Copilot):
```
$ git co█mit -m "fix"
         ^^^^^^^^^^^ (dimmed gray text)
```

**Popup Menu** (Like Fish shell):
```
$ git co█
  ┌─────────────────────────────┐
  │ → git commit -m "..."       │ (history)
  │   git checkout main         │ (common)
  │   git config --list         │ (recent)
  └─────────────────────────────┘
```

**Status Bar** (Non-intrusive):
```
┌──────────────────────────────────┐
│ Terminal                          │
│                                   │
│ $ █                               │
└──────────────────────────────────┘
  💡 Press Ctrl+Space for AI help
```

## My Recommendation

**Start with Option 1 (History-based):**
- Instant feedback
- No infrastructure needed
- Covers 80% of use cases
- Zero cost

**Add Option 2 (AI on-demand):**
- Handles complex queries
- Uses existing AI setup
- User controls when it runs

**Skip Option 3 unless:**
- You really want true autocomplete
- Users have powerful machines
- You're willing to ship a 1GB+ model

## Real-World Examples

**Warp Terminal:**
- Uses history + heuristics (fast)
- AI features are explicit (search, generate)
- No auto-complete with AI

**GitHub Copilot for CLI:**
- Explicit command (`gh copilot suggest`)
- Uses cloud API
- No auto-complete

**Fig (now part of AWS):**
- Autocomplete from specifications
- No AI in the autocomplete
- AI is separate feature

**Conclusion:** The best terminals keep autocomplete fast (no AI) and add AI as a separate, explicit feature. That's what you should do too.
