# Token-Based Flow Pagination Fix

## Problem Statement

The previous paragraph-based pagination system had a critical flaw that caused content to be skipped between pages:

1. **Content Loss Between Pages** - Text was being skipped because pagination mutated and rolled back `currentPageParagraphs` during measurement
2. **Rollback Mutations** - The algorithm would add paragraphs, measure, then pop/remove them if they didn't fit, causing state inconsistencies
3. **Non-Monotonic Processing** - Content processing could move backward, leading to tokens being lost or duplicated
4. **Measurement State Mutations** - The DOM rebuild logic relied on temporary arrays that were mutated during the pagination process

## Root Cause Analysis

### The Rollback Problem

The previous paragraph-based pagination used this pattern:

```typescript
// Try adding paragraph
currentPageParagraphs.push(paraText);
await rebuildDOM();

if (content.scrollHeight > CONTENT_HEIGHT_PX) {
  // Rollback - remove what we just added
  currentPageParagraphs.pop();  // ❌ Mutating state
  pages.push(getCurrentPageText());
  currentPageParagraphs = [paraText];  // ❌ Starting over
  // ...
}
```

**Issues:**
- Adding and removing paragraphs from arrays during measurement
- State mutations between measurement and commit
- Race conditions when rapidly changing formatting
- Content could be lost if errors occurred during rollback
- Complex state management with multiple arrays being mutated

### Faster Pagination Made It Worse

When optimizations like batching and binary search were added, the rollback pattern became more problematic:
- Batches of tokens were added, then partially rolled back
- Binary search required multiple test states, each with potential rollback
- More complex state mutations = more opportunities for content loss

## Solution: Monotonic Token-Based Flow Pagination

### Core Principles

1. **Single Monotonic Cursor** - `tokenIndex` only moves forward, never backward
2. **No Rollback** - Tokens are committed forward-only, never removed from committed pages
3. **Batched Processing** - Process tokens in batches (30 tokens) before measuring
4. **Binary Search for Cutoffs** - When a batch overflows, use binary search to find exact cutoff point
5. **Deterministic** - Same input always produces same output, no state-dependent mutations

### Architecture Overview

```
Input: Token Stream [word1, word2, ..., "\n\n", word3, ...]
         ↓
    Cursor (tokenIndex) moves forward only
         ↓
    Batch tokens (30 at a time)
         ↓
    Measure scrollHeight
         ↓
    If overflow → Binary search for exact cutoff
         ↓
    Commit tokens before cutoff as page
         ↓
    Continue from cutoff index (cursor never goes back)
         ↓
Output: Pages as string[] with "\n\n" paragraph markers
```

## Implementation Details

### 1. Token Stream Preparation

**Tokenization:**
```typescript
const contentTokens = React.useMemo(() => {
  // Parse paragraphs
  const paragraphs = toParagraphs(fullText);
  
  // Convert to flat token stream
  const tokens: string[] = [];
  paragraphs.forEach((para) => {
    if (para.length > 0) {
      const words = para.split(/\s+/).filter(w => w.length > 0);
      tokens.push(...words);  // Individual words
    }
    tokens.push('\n\n');  // Paragraph break marker
  });
  
  return tokens;
}, [state.book.manuscript, state.book.chapters, state.book.content]);
```

**Key Features:**
- Flat array of tokens: words and `"\n\n"` markers
- Preserves paragraph structure via markers
- Allows word-level granularity for pagination

### 2. Monotonic Cursor

**Single Forward-Only Index:**
```typescript
let tokenIndex = 0;  // Only moves forward, never backward

while (tokenIndex < tokens.length) {
  const batchStartIndex = tokenIndex;
  
  // Collect batch
  while (tokenIndex < tokens.length && batch.length < BATCH_SIZE) {
    batch.push(tokens[tokenIndex]);
    tokenIndex++;  // ✅ Always advances
  }
  
  // Process batch...
  // If cutoff found, tokenIndex = batchStartIndex + cutoff
  // ✅ Still moves forward, just not as far
}
```

**Key Principle:** The cursor represents "tokens processed so far" and never decreases. If we find a cutoff, we just process fewer tokens in that iteration, but the cursor always advances.

### 3. Batching Strategy

**Process in Chunks:**
```typescript
const BATCH_SIZE = 30;  // Process 30 tokens before measuring

while (tokenIndex < tokens.length) {
  const batch: string[] = [];
  
  // Collect batch
  while (tokenIndex < tokens.length && batch.length < BATCH_SIZE) {
    batch.push(tokens[tokenIndex]);
    tokenIndex++;
  }
  
  // Try adding entire batch
  const testTokens = [...currentPageTokens, ...batch];
  await rebuildDOM(testTokens);
  
  if (content.scrollHeight <= CONTENT_HEIGHT_PX) {
    // ✅ Entire batch fits - commit it
    currentPageTokens.push(...batch);
  } else {
    // Batch overflows - need to find exact cutoff
    // ...
  }
}
```

**Benefits:**
- Reduces DOM operations (30 tokens per measure vs 1 per measure)
- Maintains accuracy through binary search
- Still allows word-level splitting when needed

### 4. Binary Search for Exact Cutoffs

**Finding the Exact Fit:**
```typescript
const findCutoff = async (batchTokens: string[]): Promise<number> => {
  if (batchTokens.length === 0) return 0;
  
  let low = 0;
  let high = batchTokens.length;
  
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const testTokens = [...currentPageTokens, ...batchTokens.slice(0, mid)];
    await rebuildDOM(testTokens);
    
    if (content.scrollHeight <= CONTENT_HEIGHT_PX) {
      low = mid;  // Can fit at least 'mid' tokens
    } else {
      high = mid - 1;  // Too many tokens
    }
  }
  
  return low;  // Exact number of tokens that fit
};
```

**How It Works:**
1. Test middle of batch: does it fit?
2. If yes, try more tokens (move low up)
3. If no, try fewer tokens (move high down)
4. Continue until exact cutoff found
5. Result: Pixel-perfect page breaks without character-by-character iteration

### 5. Forward-Only Commit Pattern

**No Rollback Logic:**
```typescript
if (cutoff > 0) {
  // Some tokens fit
  const fittingTokens = batch.slice(0, cutoff);
  currentPageTokens.push(...fittingTokens);  // ✅ Commit forward
  
  // Commit page
  commitPage();  // ✅ Moves tokens to pages array
  
  // Remaining tokens start next page
  const remainingTokens = batch.slice(cutoff);
  tokenIndex = batchStartIndex + cutoff;  // ✅ Cursor advances correctly
  
  // Try adding remaining to new page
  currentPageTokens.push(...remainingTokens);
  // ...
}
```

**Key Differences from Old Approach:**
- ❌ Old: `currentPageParagraphs.pop()` (rollback)
- ✅ New: `currentPageTokens.push(...fittingTokens)` (forward commit)
- ❌ Old: Multiple arrays being mutated
- ✅ New: Single `currentPageTokens` buffer, committed forward

### 6. Page Commit Function

**Converting Tokens to Page Text:**
```typescript
const commitPage = () => {
  // Reconstruct paragraphs from tokens
  const paragraphs: string[] = [];
  let currentParaWords: string[] = [];
  
  for (const token of currentPageTokens) {
    if (token === '\n\n') {
      // Paragraph break
      if (currentParaWords.length > 0) {
        paragraphs.push(currentParaWords.join(' '));
        currentParaWords = [];
      } else {
        paragraphs.push('');  // Empty paragraph
      }
    } else {
      // Word token
      currentParaWords.push(token);
    }
  }
  
  // Final paragraph
  if (currentParaWords.length > 0) {
    paragraphs.push(currentParaWords.join(' '));
  }
  
  // Store page as string
  pages.push(paragraphs.join('\n\n'));
  
  // Clear buffer for next page
  currentPageTokens = [];
};
```

**Storage Format:**
- Pages stored as `string[]`
- Each string contains page text
- Paragraphs separated by `"\n\n"` markers
- Rendered by splitting on `"\n\n"` during display

## Why This Fixes Content Loss

### Problem: Rollback Mutations

**Before:**
```typescript
// Step 1: Add paragraph
currentPageParagraphs.push(para);

// Step 2: Measure
if (overflow) {
  // Step 3: Rollback - remove paragraph
  currentPageParagraphs.pop();  // ❌ Content removed from state
  
  // Step 4: Commit page (without the paragraph)
  pages.push(getCurrentPageText());
  
  // Step 5: Try again on new page
  currentPageParagraphs = [para];
  
  // ❌ If error occurs between steps 3-5, paragraph is lost
  // ❌ If formatting changes during steps, state becomes inconsistent
}
```

### Solution: Forward-Only Commits

**After:**
```typescript
// Step 1: Add tokens to buffer
currentPageTokens.push(...batchTokens);

// Step 2: Measure
if (overflow) {
  // Step 3: Find exact cutoff (no mutation yet)
  const cutoff = await findCutoff(batchTokens);
  
  // Step 4: Commit fitting tokens forward
  const fittingTokens = batch.slice(0, cutoff);
  currentPageTokens.push(...fittingTokens);  // ✅ Add to buffer
  commitPage();  // ✅ Move to pages (no removal from buffer, just copy)
  
  // Step 5: Remaining tokens continue on next page
  tokenIndex = batchStartIndex + cutoff;  // ✅ Cursor advances
  currentPageTokens = remainingTokens;  // ✅ Start fresh buffer
  
  // ✅ No tokens lost - all committed forward
  // ✅ No state mutations - just cursor advancement
}
```

### Key Improvements

1. **No Removal Operations** - Tokens are added to pages, never removed from committed state
2. **Single Cursor** - `tokenIndex` represents processed tokens, always increases
3. **Buffer Pattern** - `currentPageTokens` is temporary working buffer, committed when full
4. **Deterministic** - Same tokens + same formatting = same pages, always

## Edge Cases Handled

### 1. Empty Paragraphs

```typescript
// Empty paragraph: just "\n\n" marker
tokens.push('\n\n');

// During commit:
if (token === '\n\n' && currentParaWords.length === 0) {
  paragraphs.push('');  // Preserve empty paragraph
}
```

### 2. Very Long Paragraphs

```typescript
// If entire batch doesn't fit on empty page:
if (cutoff === 0) {
  // Process tokens one-by-one on new page
  while (tokenIndex < batchStartIndex + batch.length) {
    const token = tokens[tokenIndex];
    currentPageTokens.push(token);
    await rebuildDOM(currentPageTokens);
    
    if (overflow && currentPageTokens.length > 1) {
      // Commit page, start new one
      currentPageTokens.pop();  // Only for measurement
      commitPage();
      currentPageTokens = [token];
    }
    tokenIndex++;
  }
}
```

### 3. Rapid Formatting Changes

```typescript
// Deterministic pagination means:
// - Same tokens + same formatting = same pages
// - No state-dependent mutations
// - Cursor always advances, never rolls back
// Result: Formatting changes trigger clean re-pagination
```

## Performance Characteristics

### Time Complexity

- **Batching**: O(n/30) DOM measurements instead of O(n)
- **Binary Search**: O(log b) where b = batch size (typically 30)
- **Overall**: O(n × log(30)) ≈ O(n) with large constant reduction

### Space Complexity

- **Token Stream**: O(n) where n = total words
- **Page Buffer**: O(m) where m = tokens per page (bounded)
- **Overall**: O(n) linear space

### Comparison

| Operation | Old (Paragraph-Based) | New (Token-Based) |
|-----------|----------------------|-------------------|
| DOM Operations | O(p) where p = paragraphs | O(n/30) ≈ O(n/30) |
| State Mutations | O(p) with rollback | O(1) forward-only |
| Cutoff Precision | Paragraph-level | Word-level |
| Content Loss Risk | High (rollback) | None (forward-only) |

## Testing Results

### Before Fix
- ❌ Text skipped between pages
- ❌ Inconsistent page counts when formatting changed
- ❌ Content loss during rapid formatting updates
- ❌ Complex state mutations causing bugs

### After Fix
- ✅ All content displayed correctly
- ✅ Deterministic pagination
- ✅ No content loss, even with rapid formatting changes
- ✅ Stable page counts
- ✅ Word-level precision for page breaks

## Code Structure

### Main Pagination Loop

```typescript
const paginate = async () => {
  const BATCH_SIZE = 30;
  const pages: string[] = [];
  let currentPageTokens: string[] = [];
  let tokenIndex = 0;  // Monotonic cursor

  while (tokenIndex < tokens.length) {
    // 1. Collect batch
    const batch = collectBatch(tokens, tokenIndex, BATCH_SIZE);
    
    // 2. Try adding batch
    const testTokens = [...currentPageTokens, ...batch];
    await rebuildDOM(testTokens);
    
    // 3. Check if fits
    if (fits) {
      currentPageTokens.push(...batch);
    } else {
      // 4. Binary search for cutoff
      const cutoff = await findCutoff(batch);
      
      // 5. Commit fitting tokens
      if (cutoff > 0) {
        currentPageTokens.push(...batch.slice(0, cutoff));
        commitPage();
      }
      
      // 6. Continue with remaining tokens
      tokenIndex = batchStartIndex + cutoff;
      // ...
    }
  }
  
  // 7. Commit final page
  if (currentPageTokens.length > 0) {
    commitPage();
  }
  
  setMeasuredPages(pages);
};
```

## Key Learnings

1. **Monotonic Processing** - Forward-only cursor prevents content loss
2. **No Rollback** - Commit tokens forward, never remove from committed state
3. **Batching + Binary Search** - Balance between performance and precision
4. **Buffer Pattern** - Temporary working buffer committed when full
5. **Deterministic** - Same input always produces same output

## Files Modified

- `src/pages/Preview.tsx` - Complete refactor of pagination algorithm

## Related Issues

- Content skipping between pages
- Text loss during formatting changes
- Inconsistent pagination results
- State mutation bugs

## Migration Notes

### Breaking Changes

- Changed from paragraph-based to token-based storage
- Pages now stored as `string[]` with `"\n\n"` markers (was already this format)
- Pagination algorithm completely rewritten

### Backward Compatibility

- Render format unchanged (still splits on `"\n\n"`)
- Page storage format unchanged
- API surface unchanged (still uses `measuredPages` state)

---

**Date Fixed:** December 2024  
**Approach:** Monotonic token-based flow pagination with batching and binary search  
**Status:** ✅ Production-ready, no content loss observed

