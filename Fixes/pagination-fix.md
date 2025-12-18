# Pagination Fix Documentation

## Problem Statement

The pagination system had multiple critical issues that prevented content from displaying correctly:

1. **Content was being hidden** - Pages appeared blank or content was clipped
2. **Paragraph-based pagination** - Could not split paragraphs mid-flow, causing issues with long paragraphs
3. **Conflicting clipping boundaries** - Multiple elements had `overflow: hidden`, causing content to be hidden instead of flowing to next pages
4. **Measurement and render DOMs were different** - Used Typography components in render but plain DOM elements in measurement, causing inaccurate measurements
5. **No mid-paragraph splitting** - Long paragraphs would overflow pages instead of splitting correctly

## Root Cause Analysis

### Architecture Issues

1. **Dual Clipping Boundaries**
   - Paper component had `overflow: hidden` (correct)
   - Inner content wrapper ALSO had `overflow: hidden` and fixed height (incorrect)
   - Result: Content was clipped at the inner box level, never reaching the next page

2. **Measurement vs Render Mismatch**
   - Measurement used plain DOM `<p>` elements
   - Render used Material-UI `<Typography>` components
   - Different styling and DOM structure led to inaccurate height calculations

3. **Paragraph-Based Pagination**
   - Paginated entire paragraphs as atomic units
   - Could not split long paragraphs across pages
   - Result: Content overflowed or pages appeared empty

4. **Container-Based Instead of Flow-Based**
   - Used fixed heights and overflow constraints
   - Tried to contain content rather than let it flow naturally
   - Measurement container was absolutely positioned and removed from normal layout flow

## Solution: Token-Based Flow Pagination

### Key Principles

1. **Single Clipping Boundary** - Only the Paper component clips content
2. **Identical Measurement and Render DOMs** - Both use identical raw `<p>` elements
3. **Token-Based Flow** - Paginate word-by-word, not paragraph-by-paragraph
4. **Natural DOM Flow** - Let content flow naturally, paginate before render

### Implementation Details

#### 1. Token-Based Content Preparation

**Before:**
```typescript
// Split into paragraphs
const paragraphs = content.split(/\n{2,}/);
// Paginate entire paragraphs
```

**After:**
```typescript
// Convert to token stream (words + paragraph markers)
const tokens: string[] = [];
const paragraphs = fullText.split(/\n{2,}/);

paragraphs.forEach((para) => {
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  tokens.push(...words);  // Individual words
  tokens.push('\n\n');    // Paragraph break marker
});
```

**Benefits:**
- Can split at word boundaries
- Paragraphs can flow across pages naturally
- More granular control over pagination

#### 2. Identical Measurement and Render DOMs

**Measurement DOM:**
```typescript
const createParagraphElement = (): HTMLParagraphElement => {
  const p = document.createElement('p');
  p.style.margin = '0';
  p.style.marginBottom = `${Math.max(0, lineHeight - 1)}em`;
  p.style.fontFamily = state.book.formatting.fontFamily;
  p.style.fontSize = `${state.book.formatting.fontSize}pt`;
  p.style.lineHeight = `${state.book.formatting.lineHeight}`;
  p.style.textAlign = template === 'poetry' ? 'center' : 'left';
  // ... exact styles
  return p;
};
```

**Render DOM:**
```tsx
<p
  style={{
    margin: 0,
    marginBottom: `${paragraphSpacingEm}em`,
    fontFamily: state.book.formatting.fontFamily,
    fontSize: `${state.book.formatting.fontSize}pt`,
    lineHeight: state.book.formatting.lineHeight,
    textAlign: template === 'poetry' ? 'center' : 'left',
    // ... identical styles
  }}
>
  {paraText}
</p>
```

**Key Point:** Both use raw `<p>` elements with identical inline styles. No Typography components in paginated render.

#### 3. Single Clipping Boundary

**Paper Component (Only Clipping Point):**
```tsx
<Paper
  sx={{
    height: `${trimSize.height}in`,  // Fixed height
    overflow: 'hidden',                // ONLY clipping boundary
    // ...
  }}
>
  {/* Content wrapper - NO height, NO overflow */}
  <Box sx={{ 
    padding: `${margins}in`,
    // NO height
    // NO overflow
    // NO maxHeight
    display: 'block',
  }}>
    {/* Content flows naturally */}
  </Box>
</Paper>
```

**Content Wrapper:**
- NO `height` constraint
- NO `overflow` constraint
- NO `maxHeight` constraint
- Pure flow - content can grow naturally
- Only clipped by parent Paper component

#### 4. Token-Based Pagination Algorithm

```typescript
const paginate = async () => {
  const pages: string[] = [];
  let currentPageParagraphs: string[] = [];
  let currentParagraphTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (token === '\n\n') {
      // Commit current paragraph
      currentPageParagraphs.push(currentParagraphTokens.join(' ').trim());
      currentParagraphTokens = [];
      rebuildDOM();
      await waitForLayout();
      
      if (content.scrollHeight > CONTENT_HEIGHT_PX) {
        // Page is full - commit page, start new one
        pages.push(currentPageParagraphs.join('\n\n'));
        currentPageParagraphs = [''];
        // ...
      }
    } else {
      // Word token - try adding it
      currentParagraphTokens.push(token);
      rebuildDOM();
      await waitForLayout();
      
      if (content.scrollHeight > CONTENT_HEIGHT_PX) {
        // Rollback token, commit page, start new page with this token
        currentParagraphTokens.pop();
        if (currentParagraphTokens.length > 0) {
          currentPageParagraphs.push(currentParagraphTokens.join(' ').trim());
        }
        pages.push(currentPageParagraphs.join('\n\n'));
        currentPageParagraphs = [];
        currentParagraphTokens = [token];
        // ...
      }
    }
  }
  
  // Commit final page
  pages.push(currentPageParagraphs.join('\n\n'));
  setMeasuredPages(pages);
};
```

**Key Features:**
- Adds tokens one-by-one
- Measures after each addition (2× requestAnimationFrame)
- Rolls back if exceeds page height
- Can split mid-paragraph when needed
- Stores pages as strings (paragraphs separated by `\n\n`)

#### 5. Measurement Container Rules

```typescript
// Measurement root
measureDiv.style.position = 'absolute';
measureDiv.style.visibility = 'hidden';
measureDiv.style.overflow = 'visible';  // No clipping during measurement
measureDiv.style.height = 'auto';       // Can grow naturally

// Measurement content container
content.style.width = `${trim.width}in`;
content.style.padding = `${margins}in`;
content.style.height = 'auto';          // NO fixed height
content.style.overflow = 'visible';     // NO clipping
// Matches page content styling exactly
```

**Important:** Measurement container must be able to grow naturally to get accurate `scrollHeight` measurements.

## Results

### Before Fix
- ❌ Content hidden/clipped
- ❌ Only first page rendered
- ❌ Paragraphs could not split across pages
- ❌ Inaccurate measurements
- ❌ Pages appeared blank

### After Fix
- ✅ All content displays correctly
- ✅ Multiple pages render properly
- ✅ Paragraphs split mid-flow when needed
- ✅ Accurate measurements (identical DOMs)
- ✅ Stable page counts
- ✅ No hidden content
- ✅ Google Docs-style flow behavior

## Technical Details

### Page Storage Format

Pages are stored as strings with paragraphs separated by `\n\n`:

```typescript
const pages: string[] = [
  "Paragraph 1 text\n\nParagraph 2 text",
  "Paragraph 3 text\n\nParagraph 4 text",
  // ...
];
```

### Render Parsing

```tsx
// Parse page text for rendering
const paragraphs = typeof pageText === 'string' 
  ? pageText.split('\n\n').filter(p => p !== null && p !== undefined)
  : [];

// Render each paragraph
paragraphs.map((paraText, paraIndex) => (
  <p style={{ /* identical to measurement */ }}>
    {paraText.trim()}
  </p>
));
```

### Fixed Height Calculation

```typescript
const PX_PER_IN = 96;
const FOOTER_PX = 24;
const PAGE_HEIGHT_PX = trim.height * PX_PER_IN;
const marginTopPx = marginTop * PX_PER_IN;
const marginBottomPx = marginBottom * PX_PER_IN;

// Single source of truth - used ONLY for comparison
const CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - marginTopPx - marginBottomPx - FOOTER_PX;

// NEVER applied as CSS height - only for scrollHeight comparison
```

## Key Learnings

1. **Measurement and render must be identical** - Any differences lead to inaccurate pagination
2. **Only one clipping boundary** - Multiple overflow constraints fight each other
3. **Flow over containment** - Let content flow naturally, paginate before render
4. **Token-based granularity** - Word-level pagination enables proper flow splitting
5. **DOM accuracy** - Must wait for layout (requestAnimationFrame) before measuring

## Files Modified

- `src/pages/Preview.tsx` - Complete pagination refactor

## Related Issues

- Content appearing blank in print preview
- Paragraphs not splitting across pages
- Only first page rendering
- Hidden/overflown content

## Testing Checklist

- [x] Multiple pages render correctly
- [x] Content flows across pages without clipping
- [x] Long paragraphs split mid-flow
- [x] Page counts are stable
- [x] No content is hidden
- [x] Line-height changes don't cause missing text
- [x] Measurement matches render exactly

---

**Date Fixed:** December 2024  
**Approach:** Token-based flow pagination with identical measurement/render DOMs

