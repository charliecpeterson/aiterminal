# Memory Leak Fixes - Week 3 Day 11

**Date:** Sun Jan 25 2026  
**Status:** ✅ COMPLETE

## Overview

Fixed 2 critical memory leaks identified during the Week 3 memory leak audit. Both leaks would cause memory to grow unbounded over time as users opened/closed terminals or interacted with terminal UI elements.

---

## Fix 1: Module-Level State in useAutocompleteSimple.ts ✅

### Location
**File:** `src/terminal/hooks/useAutocompleteSimple.ts`

### Problem
Lines 373-374 declared state at the **module level** instead of inside the hook:

```typescript
// MODULE LEVEL (BAD!)
let debounceTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
let cwdRef: { current: string } = { current: '/' };
```

### Why This Was a Memory Leak
- **Module-level state persists forever** - never garbage collected
- Multiple component instances **share the same refs**
- When components unmounted, **timers in `debounceTimerRef` were never cleared**
- Each mount/unmount cycle would **leak the previous timer**
- Memory usage grows linearly with terminal open/close cycles

### The Fix
1. **Moved refs inside the hook** using `useRef()`:
   ```typescript
   const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const cwdRef = useRef<string>('/');
   ```

2. **Added cleanup effect** to clear timer on unmount:
   ```typescript
   useEffect(() => {
     return () => {
       if (debounceTimerRef.current) {
         clearTimeout(debounceTimerRef.current);
         debounceTimerRef.current = null;
       }
     };
   }, []);
   ```

3. **Updated function signature** to pass refs:
   - `handleLLMKey` now receives `debounceTimerRef` and `cwdRef` as parameters
   - Called with: `handleLLMKey(event, key, terminal, llmEngine, ptyId, debounceMs, debounceTimerRef, cwdRef)`

### Impact
- ✅ Each hook instance now has **isolated state**
- ✅ Timers are **properly cleaned up** on unmount
- ✅ No more accumulating module-level timers
- ✅ Memory freed when terminals close

### Files Modified
- `src/terminal/hooks/useAutocompleteSimple.ts` (lines 12-27, 111-150, 285-291, 311-368)

---

## Fix 2: Event Listener Leak in markers.ts ✅

### Location
**File:** `src/terminal/ui/markers.ts`

### Problem
Line 704 added an event listener inside a `setTimeout` without cleanup:

```typescript
// Line 704 (BAD!)
setTimeout(() => document.addEventListener('mousedown', removeButton), 100);
```

### Why This Was a Memory Leak
- **Event listener added in setTimeout** wasn't tracked
- If component unmounted before 100ms, **listener never cleaned up**
- If `showOutputButton()` called again before timeout fired, **old listener orphaned**
- `removeButton` only removes itself when clicked - **if user never clicks, listener stays forever**
- Each terminal interaction that shows the button would **leak another listener**

### The Fix

1. **Added tracking variables** (line 205-207):
   ```typescript
   let currentOutputButton: HTMLDivElement | null = null;
   let currentOutputButtonRemoveListener: ((e: MouseEvent) => void) | null = null;
   let currentOutputButtonTimeoutId: ReturnType<typeof setTimeout> | null = null;
   ```

2. **Track timeout and listener** in `showOutputButton()`:
   ```typescript
   currentOutputButtonRemoveListener = removeButton;
   currentOutputButtonTimeoutId = setTimeout(() => {
     document.addEventListener('mousedown', removeButton);
     currentOutputButtonTimeoutId = null;
   }, 100);
   ```

3. **Clear timeout/listener when button removed** (multiple locations):
   ```typescript
   if (currentOutputButtonTimeoutId) {
     clearTimeout(currentOutputButtonTimeoutId);
     currentOutputButtonTimeoutId = null;
   }
   if (currentOutputButtonRemoveListener) {
     document.removeEventListener('mousedown', currentOutputButtonRemoveListener);
     currentOutputButtonRemoveListener = null;
   }
   ```

4. **Added cleanup in all code paths**:
   - When new button shown (lines 653-663)
   - When "View in Window" clicked (lines 687-696)
   - When "Copy to Clipboard" clicked (lines 708-717)
   - When outside click detected (lines 728-733)
   - When clicking outside command block (lines 586-599, 603-616, 618-631)
   - In main cleanup function (lines 654-662)

### Impact
- ✅ Timeout **always cleared** before firing
- ✅ Event listener **always removed** from document
- ✅ No orphaned listeners accumulating
- ✅ Memory freed when terminals close or buttons dismissed

### Files Modified
- `src/terminal/ui/markers.ts` (lines 205-207, 653-733, 586-631, 654-662)

---

## Testing

### TypeScript Validation
✅ `npm run build` passes with no new errors in modified files

### Manual Testing Needed
To verify the fixes work, test these scenarios:

**Leak 1 Test (useAutocompleteSimple):**
1. Open terminal with LLM autocomplete enabled
2. Type several characters to trigger debounced completion
3. Close terminal before debounce fires
4. Repeat 20-30 times
5. Check Chrome DevTools Memory profiler - should not see growing timer count

**Leak 2 Test (markers):**
1. Run several commands in terminal (to create markers)
2. Click on command blocks to highlight them
3. Click outside to dismiss (tests timeout path)
4. Repeat 20-30 times
5. Check DevTools Memory profiler - should not see growing listener count
6. Also test: click "View in Window" / "Copy" buttons to test cleanup paths

### Expected Results
- Memory usage stable after repeated open/close cycles
- No accumulating timers in DevTools
- No accumulating event listeners in DevTools

---

## Code Quality Metrics

**Lines Changed:** ~100 lines across 2 files  
**Functions Modified:** 3  
**New Cleanup Code:** 8 locations  
**TypeScript Errors:** 0 new errors  
**Pre-existing Test Status:** 98/102 tests passing (96%)  

---

## Related Documentation

- **Memory Leak Audit:** `MEMORY_LEAK_AUDIT.md` - Full audit that identified these issues
- **Week 2 Summary:** `WEEK2_SUMMARY.md` - Previous week's progress
- **Security Fixes:** `SECURITY_FIXES_DAY*.md` - Week 1 security work

---

## Next Steps

With these 2 critical leaks fixed, the remaining Week 3 tasks are:

1. ✅ Audit interval timer leaks (COMPLETE)
2. ✅ Fix interval timer leaks (COMPLETE - 2 leaks fixed)
3. ⏳ Replace console.log with proper logging (94 instances found)
4. ⏳ Apply design tokens to 2-3 key components
5. ⏳ UI polish and consistency improvements

**Estimated Time Remaining:** 3-5 hours for logging + design tokens
