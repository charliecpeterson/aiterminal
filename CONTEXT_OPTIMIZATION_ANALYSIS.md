# Context System Optimization Analysis

## Current Implementation Overview

### What's Already Built (Good News!)

Your context system is already quite sophisticated with several optimization layers:

#### 1. **Three-Tier Context Filtering**
- **Always Mode**: Item always included (boosted +50 relevance)
- **Smart Mode**: AI decides based on relevance scoring
- **Exclude Mode**: Item never included

#### 2. **Smart Ranking System** (`contextRanker.ts`)
- **Time Decay**: Context gets stale over time (25 points for <5min, down to -25 for >3hrs)
- **Usage Penalty**: Recently used context gets deprioritized (-30 for <2min reuse)
- **Query Matching**: Keyword relevance scoring (up to 40 points)
- **Type Relevance**: File/command/output get different weights
- **Conversation Relevance**: Checks against recent message topics
- **Size Penalty**: Large items (>10KB) penalized to prefer concise context

#### 3. **Smart Context with Embeddings** (`smartContext.ts`)
- Uses embedding model for semantic similarity (when enabled)
- Chunks large files intelligently (140 lines for files, 220 for commands)
- Overlap between chunks (12 lines) to preserve context
- Only triggers when you have ≥10 context items

#### 4. **Context Deduplication**
- Prevents same content from being sent multiple times
- Checks content similarity

#### 5. **Token Budget Management**
- Enforces 8000 token limit per request
- Estimates tokens (~4 chars per token)

#### 6. **Context Caching**
- Caches context for same query to avoid re-ranking
- Only caches keyword-based ranking (not embeddings)

#### 7. **Conversation History Optimization** (`conversationHistory.ts`)
- Sliding window (8 recent messages)
- Auto-summarizes older messages
- Saves 60-80% tokens on long conversations

---

## Issues to Address

### Issue 1: Context Repetition Across Messages
**Problem**: Once context is sent, it keeps being re-sent on subsequent queries unless usage penalty kicks in.

**Current Behavior**:
```
Message 1: User adds file.txt → Sends file.txt to AI
Message 2: User asks follow-up → Sends file.txt AGAIN (unless recently used)
Message 3: User asks another follow-up → Sends file.txt AGAIN
```

**What Should Happen**:
```
Message 1: User adds file.txt → Sends file.txt to AI
Message 2: User asks follow-up → AI already knows file.txt, don't resend (unless highly relevant)
Message 3: AI remembers context from conversation history
```

**Root Cause**: Context is re-evaluated every message, not tracked as "already known by AI in this conversation."

---

### Issue 2: Chat vs Agent Mode Context Handling
**Current**: Both modes use identical context system
**Problem**: Agent mode has tools to fetch files on-demand, while Chat mode doesn't

**Implications**:
- **Chat Mode**: Should front-load more context since it can't fetch files later
- **Agent Mode**: Can be more conservative with context, fetch on-demand with `read_file` tool

---

### Issue 3: No Context Lifecycle Management
**Missing**: 
- No way to say "this context is stale, remove it"
- No automatic expiration of old context
- No way to track "AI has seen this, stop sending it"

---

### Issue 4: Always Mode Can Bloat Token Budget
**Problem**: Users can mark many items as "Always", exhausting token budget
**Current**: Always items get +50 relevance but still compete in ranking
**Risk**: Could squeeze out more relevant context

---

## Recommended Optimizations

### Priority 1: Add "Conversation Memory" Tracking

**Concept**: Track which context items the AI has already seen in this conversation.

**Implementation**:
```typescript
// In ContextItem interface
lastSentInMessage?: string; // Message ID when context was last sent
conversationId?: string; // Track which conversation knows this

// In chatSend-vercel.ts scoring
if (item.lastSentInMessage && !queryHighlyRelevant) {
  // AI already knows this from earlier in conversation
  usagePenalty -= 40; // Heavy penalty, only resend if very relevant
}
```

**Benefits**:
- Reduces token waste by 30-50% on multi-message conversations
- AI references earlier context instead of needing it resent
- More tokens available for new context

---

### Priority 2: Different Strategies for Chat vs Agent Mode

#### Chat Mode Strategy: "Front-load Context"
```typescript
if (mode === 'chat') {
  // More aggressive context inclusion
  maxTokens = 12000; // Higher budget
  minRelevanceScore = 20; // Lower threshold
  alwaysIncludeRecent = true; // Include last 3 context items regardless
}
```

**Reasoning**: Chat mode can't fetch files later, so give AI everything upfront.

#### Agent Mode Strategy: "Just-in-Time Context"
```typescript
if (mode === 'agent') {
  // Conservative context, rely on tools
  maxTokens = 6000; // Lower budget
  minRelevanceScore = 35; // Higher threshold
  // Let AI use read_file/grep tools for detailed info
}
```

**Reasoning**: Agent can always fetch more context via tools, so only send high-level overview.

---

### Priority 3: Smart Context Auto-Cleanup

**Add Auto-Expiration**:
```typescript
// Remove context older than X hours (configurable)
function pruneStaleContext(items: ContextItem[], maxAgeHours: number = 6): ContextItem[] {
  const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
  return items.filter(item => {
    if (item.metadata?.includeMode === 'always') return true; // Never auto-remove Always items
    return item.timestamp > cutoff;
  });
}
```

**Add Smart Suggestions**:
```typescript
// After 5+ uses, suggest removing context
if (item.usageCount > 5 && item.lastUsedTimestamp < Date.now() - 30*60*1000) {
  // Show UI hint: "This context has been sent 5 times. Remove it?"
}
```

---

### Priority 4: Improve "Always" Mode

**Current Problem**: Always items can crowd out more relevant context.

**Solution**: Reserve Token Budget
```typescript
// Reserve 30% of budget for Always items, 70% for ranked
const alwaysTokenBudget = maxTokens * 0.3;
const smartTokenBudget = maxTokens * 0.7;

// Always items get their own budget
const alwaysContext = formatAlwaysContext(alwaysTokenBudget);
const smartContext = formatSmartContext(smartTokenBudget);
```

**Benefit**: Always items don't compete with relevance-ranked items.

---

### Priority 5: Add "Conversation Context Summary"

Instead of resending full context, send a summary after first use:

```typescript
if (item.lastSentInMessage && !queryHighlyRelevant) {
  // Send summary instead of full content
  return `[Previously shared: ${item.type} from ${item.metadata?.path || 'terminal'}, ${Math.round(item.content.length / 1000)}KB]`;
}
```

**Example**:
```
First message: <sends full 50KB file>
Second message: "[Previously shared: file from package.json, 50KB]"
```

AI can reference the earlier message if needed.

---

## Proposed Scoring System Refinements

### Enhanced Scoring with Conversation Memory

```typescript
function calculateEnhancedScore(item: ContextItem, context: {
  query: string,
  currentMessageId: string,
  conversationHistory: ChatMessage[],
  mode: 'chat' | 'agent'
}) {
  let score = baseScore; // Existing scoring
  
  // 1. Conversation Memory Penalty
  if (item.lastSentInMessage) {
    const messagesSince = countMessagesSince(item.lastSentInMessage, context.conversationHistory);
    if (messagesSince < 3) {
      score -= 50; // Very recent, AI still remembers
    } else if (messagesSince < 10) {
      score -= 25; // Recent, probably remembers
    } else {
      score -= 10; // Older, might need refresh
    }
  }
  
  // 2. Mode-Specific Adjustments
  if (context.mode === 'chat') {
    // Chat mode: boost file context (can't fetch later)
    if (item.type === 'file') score += 15;
  } else {
    // Agent mode: prefer command_output over files (can read files later)
    if (item.type === 'command_output') score += 10;
    if (item.type === 'file') score -= 10;
  }
  
  // 3. Cross-Reference Bonus
  const referencedInConversation = conversationHistory.some(msg => 
    msg.content.includes(item.metadata?.path || '')
  );
  if (referencedInConversation) {
    score += 20; // AI explicitly mentioned this, likely still relevant
  }
  
  return score;
}
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 hours)
1. ✅ **Add `lastSentInMessage` tracking** to ContextItem
2. ✅ **Implement conversation memory penalty** in contextRanker
3. ✅ **Add mode-specific token budgets** (chat: 12K, agent: 6K)

### Phase 2: Smart Cleanup (2-3 hours)
1. **Auto-prune stale context** (>6 hours old)
2. **UI hints for over-used context** ("Remove this?")
3. **Context summary mode** for previously-sent items

### Phase 3: Advanced Features (3-4 hours)
1. **Split Always/Smart token budgets** (30/70 split)
2. **Cross-reference detection** (AI mentioned this context)
3. **Conversation context summary** (compact representation)

---

## Key Metrics to Track

Add these to your metrics system:

```typescript
interface ContextMetrics {
  itemsAdded: number;        // Total context items in staging
  itemsSent: number;          // Items actually sent to AI
  itemsReused: number;        // Items sent multiple times
  averageRelevanceScore: number;
  tokensSaved: number;        // From not resending known context
  pruned: number;             // Auto-removed stale items
}
```

---

## Best Practices for Users

### When to Use Each Mode

**Smart Context (Recommended)**:
- AI automatically picks relevant context
- Best for most use cases
- Reduces token waste

**Always Mode**:
- Critical reference files (API docs, config)
- Information needed in every response
- ⚠️ Use sparingly (max 2-3 items)

**Exclude Mode**:
- Outdated context
- Sensitive data you don't want AI to see
- Context added by accident

---

## Questions to Consider

1. **Should context auto-remove after X uses?**
   - Pro: Keeps context list clean
   - Con: User might want to keep it

2. **Should Chat mode automatically mark all context as "Always"?**
   - Pro: Ensures AI has full context (no tool access)
   - Con: Could waste tokens on irrelevant context

3. **Should there be a "Conversation" scope for context?**
   - Items tied to this conversation only
   - Cleared when chat is cleared
   - Separate from "Global" context

4. **Should Agent mode have a "Context Budget" warning?**
   - "You have 15 context items. Agent mode works best with 5-8. Consider using Exclude mode."

---

## Current Token Flow Example

**Scenario**: User adds 3 files, asks 5 questions

```
Message 1: Question about file1
  → Sends: file1 (2K tokens), file2 (1.5K), file3 (2K) = 5.5K tokens
  
Message 2: Follow-up question about file1  
  → Sends: file1 (2K), file2 (1.5K), file3 (2K) = 5.5K tokens ❌ REDUNDANT
  
Message 3: Question about file2
  → Sends: file2 (1.5K), file1 (2K), file3 (2K) = 5.5K tokens ❌ REDUNDANT
  
Total: 16.5K tokens sent (11K wasted)
```

**With Conversation Memory**:

```
Message 1: Question about file1
  → Sends: file1 (2K), file2 (1.5K), file3 (2K) = 5.5K tokens
  
Message 2: Follow-up question about file1
  → Sends: file1 summary (50 tokens) = 50 tokens ✅ EFFICIENT
  
Message 3: Question about file2
  → Sends: file2 summary (50 tokens) = 50 tokens ✅ EFFICIENT
  
Total: 5.6K tokens (saves 10.9K = 66% reduction)
```

---

## Recommended Next Steps

1. **Add conversation memory tracking** (Priority 1)
   - Track `lastSentInMessage` in ContextItem
   - Penalize recently-sent context heavily

2. **Test with real usage patterns**
   - Monitor how many times same context gets sent
   - Track token waste

3. **Add UI indicators**
   - Show "✓ Sent to AI" badge on context items
   - Show "📊 Sent 3 times" usage counter
   - Show "⏰ Added 2 hours ago" timestamp

4. **Implement smart cleanup**
   - Auto-suggest removing stale context
   - Add "Refresh Context" button to reset usage counters

5. **Mode-specific optimizations**
   - Test chat vs agent behavior differences
   - Tune token budgets based on real usage

Would you like me to implement any of these optimizations?
