# Memory Leak Audit - Week 3

**Date**: January 25, 2026  
**Status**: In Progress

## Summary

Audited 41 timer usages and 32 event listener usages across the codebase.

**Good News**: Most timers and event listeners have proper cleanup!  
**Bad News**: Found 2 critical memory leaks that need fixing.

---

## Critical Issues Found

### 1. Module-Level State in `useAutocompleteSimple.ts` 🔴 HIGH PRIORITY

**File**: `src/terminal/hooks/useAutocompleteSimple.ts:373-374`

**Problem**:
```typescript
// Refs for LLM mode state (module-level to persist across renders)
let debounceTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
let cwdRef: { current: string } = { current: '/' };
```

**Why This Is Bad**:
- Module-level state persists across component unmounts
- Multiple component instances share the same state (not isolated)
- Timers stored in `debounceTimerRef` won't be cleaned up on unmount
- Memory leak grows with each component mount/unmount cycle

**Impact**: HIGH - Memory leak, state pollution, timer leaks

**Fix Required**: Move these refs into the hook itself using `useRef()`

---

### 2. Event Listener Leak in `markers.ts` 🔴 HIGH PRIORITY

**File**: `src/terminal/ui/markers.ts:704`

**Problem**:
```typescript
setTimeout(() => document.addEventListener('mousedown', removeButton), 100);
```

**Why This Is Bad**:
- Event listener added in a setTimeout without cleanup tracking
- If component unmounts before button is removed, listener orphaned forever
- The `removeButton` function removes itself, but only when triggered
- If user never clicks, listener stays attached

**Impact**: MEDIUM-HIGH - Event listener leak on document

**Fix Required**: Track the timeout ID and cleanup listener on unmount

---

## Good Patterns Found ✅

Most of the codebase follows good patterns! Here are examples:

### Proper Timer Cleanup

**App.tsx:157-174**:
```typescript
elapsedTimerRef.current = setInterval(() => {
  setRunningCommands(prev => {
    // ... update logic
  });
}, 1000);

return () => {
  if (elapsedTimerRef.current) {
    clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
  }
};
```
✅ Cleanup in useEffect return

### Proper Event Listener Cleanup

**Terminal.tsx:307-313**:
```typescript
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('toggle-command-history', handleToggleEvent);
return () => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('toggle-command-history', handleToggleEvent);
};
```
✅ All listeners removed on cleanup

### Proper Multi-Listener Cleanup

**scrollbarOverlay.ts:164-180**:
```typescript
thumb.addEventListener('mousedown', onThumbMouseDown);
track.addEventListener('mousedown', onTrackMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('resize', refresh);

const cleanup = () => {
  viewport?.removeEventListener('scroll', refresh);
  window.removeEventListener('resize', refresh);
  thumb.removeEventListener('mousedown', onThumbMouseDown);
  track.removeEventListener('mousedown', onTrackMouseDown);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  track.remove();
};

return { refresh, cleanup };
```
✅ All listeners cleaned up, even DOM removal

---

## Audit Results by File

### ✅ Clean (Proper Cleanup)

| File | Timers | Listeners | Status |
|------|--------|-----------|--------|
| `src/App.tsx` | 4 | 2 | ✅ All cleaned up |
| `src/app/AppContent.tsx` | 3 | 3 | ✅ All cleaned up |
| `src/components/Terminal.tsx` | 1 | 2 | ✅ All cleaned up |
| `src/app/sshIntegration.ts` | 1 | 0 | ✅ Cleaned up |
| `src/terminal/hooks/useAutocompleteSimple.ts` | 3 | 0 | ✅ Timers cleaned up |
| `src/terminal/hooks/useAutocompleteMenu.ts` | 1 | 1 | ✅ All cleaned up |
| `src/terminal/hooks/useLatencyProbe.ts` | 1 | 0 | ✅ Cleaned up |
| `src/terminal/ui/scrollbarOverlay.ts` | 0 | 6 | ✅ All cleaned up |
| `src/terminal/ui/markers.ts` | 2 | 3 | ⚠️ 1 listener leak (line 704) |
| `src/terminal/resize.ts` | 3 | 1 | ✅ All cleaned up |
| `src/components/AutocompleteMenu.tsx` | 0 | 1 | ✅ Cleaned up |
| `src/components/AIPanel.tsx` | 0 | 2 | ✅ Cleaned up |

### 🔴 Issues Found

| File | Issue | Priority |
|------|-------|----------|
| `src/terminal/hooks/useAutocompleteSimple.ts:373` | Module-level state | 🔴 HIGH |
| `src/terminal/ui/markers.ts:704` | Orphaned event listener | 🔴 HIGH |

---

## Low-Priority Items (Not Leaks)

These are intentionally left without cleanup or are safe:

### Promise setTimeout (Safe)
```typescript
await new Promise(resolve => setTimeout(resolve, 100));
```
✅ Safe - Promise resolves, no ongoing timer

### One-shot setTimeout (Usually Safe)
```typescript
setTimeout(() => inputRef.current?.focus(), 10);
```
✅ Safe - Short timeout, no cleanup needed

### Worker Listeners (Safe)
```typescript
// In worker context
self.addEventListener('message', handler);
```
✅ Safe - Worker lifecycle managed by browser

---

## Fix Plan

### Priority 1: Module-Level State

**File**: `src/terminal/hooks/useAutocompleteSimple.ts`

**Change**:
```typescript
// BEFORE (module-level - BAD)
let debounceTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
let cwdRef: { current: string } = { current: '/' };

// AFTER (hook-level - GOOD)
export function useAutocompleteSimple(...) {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cwdRef = useRef<string>('/');
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
  
  // ... rest of hook
}
```

**Benefit**: Proper isolation, automatic cleanup on unmount

---

### Priority 2: Event Listener Leak

**File**: `src/terminal/ui/markers.ts`

**Change**:
```typescript
// BEFORE
setTimeout(() => document.addEventListener('mousedown', removeButton), 100);

// AFTER
const timeoutId = setTimeout(() => {
  document.addEventListener('mousedown', removeButton);
}, 100);

// Add to cleanup function (line 630-648):
return () => {
  // ... existing cleanup
  
  // NEW: Clear pending timeout and listener
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  document.removeEventListener('mousedown', removeButton);
};
```

**Benefit**: Guaranteed cleanup, no orphaned listeners

---

## Testing Strategy

### Manual Testing
1. Open/close terminals repeatedly
2. Mount/unmount components with timers
3. Check Chrome DevTools Memory profiler
4. Look for detached DOM nodes

### Automated Testing
1. Add test that mounts/unmounts 100 times
2. Check for memory growth
3. Verify cleanup functions called

---

## Metrics

**Before Fixes**:
- 41 timer usages found
- 32 event listener usages found
- 2 memory leaks identified
- ~95% of code has proper cleanup ✅

**After Fixes** (Target):
- 0 memory leaks
- 100% proper cleanup

---

## Next Steps

1. ✅ Audit complete
2. ⏳ Fix module-level state in useAutocompleteSimple.ts
3. ⏳ Fix event listener leak in markers.ts
4. ⏳ Test fixes manually
5. ⏳ Add memory leak regression tests

---

**Estimated Time to Fix**: 1-2 hours  
**Risk Level**: LOW (isolated changes, easy to test)
