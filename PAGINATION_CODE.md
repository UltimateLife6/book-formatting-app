# Pagination Code - Complete Reference

## 1. React Component: Pagination Logic
**File: `src/pages/Preview.tsx`**

### Pagination Function (lines 86-275)
```typescript
useEffect(() => {
  if (previewMode !== 'print') {
    setMeasuredPages([]);
    return;
  }

  const measureAndPaginate = async () => {
    try {
      const contentText = state.book.content || '';
      
      // ... sample content handling ...

      // Set timeout to fall back to word-based pagination if measurement takes too long (3 seconds)
      const timeoutId = setTimeout(() => {
        console.warn('Pagination measurement taking too long, using fallback');
        setMeasuredPages(fallbackPagination(contentText, state.book.formatting));
      }, 3000);

      // Wait for measureDiv to be available
      if (!measureDivRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!measureDivRef.current) {
          clearTimeout(timeoutId);
          setMeasuredPages(fallbackPagination(contentText, state.book.formatting));
          return;
        }
      }

      const paragraphs = contentText.split('\n').filter(p => p.trim());
      const measureDiv = measureDivRef.current;

      const pages: string[][] = [];
      let currentPageContent: string[] = [];

      // Clear and setup measurement div to match visible content Box exactly
      measureDiv.innerHTML = '';
      measureDiv.style.width = '8.5in';
      measureDiv.style.height = '11in'; // Full page height (matches Paper)
      measureDiv.style.padding = '0';
      measureDiv.style.margin = '0';
      measureDiv.style.boxSizing = 'border-box';
      measureDiv.style.overflow = 'hidden';
      measureDiv.style.position = 'absolute';
      measureDiv.style.top = '0';
      measureDiv.style.left = '0';
      measureDiv.style.display = 'flex';
      measureDiv.style.flexDirection = 'column';
      
      // Create inner content div that matches the visible content Box
      const contentDiv = document.createElement('div');
      contentDiv.style.flex = '1 1 auto';
      contentDiv.style.display = 'flex';
      contentDiv.style.flexDirection = 'column';
      contentDiv.style.padding = `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`;
      contentDiv.style.paddingBottom = `calc(${state.book.formatting.marginBottom}in + 1.5em)`; // Reserve space for page number
      contentDiv.style.minHeight = '0';
      contentDiv.style.width = '100%';
      contentDiv.style.maxWidth = '100%';
      contentDiv.style.boxSizing = 'border-box';
      contentDiv.style.wordWrap = 'break-word';
      contentDiv.style.overflowWrap = 'break-word';
      contentDiv.style.fontFamily = state.book.formatting.fontFamily;
      contentDiv.style.fontSize = `${state.book.formatting.fontSize}pt`;
      contentDiv.style.lineHeight = `${state.book.formatting.lineHeight}`;
      measureDiv.appendChild(contentDiv);

      // Calculate max content height
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Verify contentDiv exists
      if (!contentDiv || !measureDiv.contains(contentDiv)) {
        clearTimeout(timeoutId);
        setMeasuredPages(fallbackPagination(contentText, state.book.formatting));
        return;
      }
      
      // The contentDiv has flex: 1 1 auto, so it fills available space in the 11in container
      // We measure scrollHeight of contentDiv (content + padding) against its available height
      const contentDivHeight = contentDiv.clientHeight; // Available height for content
      const buffer = 2; // Minimal buffer to prevent overflow
      const threshold = contentDivHeight - buffer;

      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) continue;

        // Create a test element matching Typography component exactly
        const testP = document.createElement('p');
        testP.textContent = paragraph;
        testP.style.marginBottom = '16px';
        testP.style.marginTop = '0px';
        testP.style.wordWrap = 'break-word';
        testP.style.overflowWrap = 'break-word';
        testP.style.whiteSpace = 'normal';
        testP.style.fontFamily = state.book.formatting.fontFamily;
        testP.style.fontSize = `${state.book.formatting.fontSize}pt`;
        testP.style.lineHeight = `${state.book.formatting.lineHeight}`;
        testP.style.width = '100%';
        testP.style.maxWidth = '100%';
        testP.style.boxSizing = 'border-box';
        testP.style.textAlign = state.book.template === 'poetry' ? 'center' : 'left';
        testP.style.display = 'block';
        testP.style.textIndent = (state.book.formatting.paragraphIndent > 0 && currentPageContent.length > 0 && state.book.template !== 'poetry')
          ? `${state.book.formatting.paragraphIndent}em`
          : '0em';

        // Add to content div (the inner flex container)
        contentDiv.appendChild(testP);

        // Wait for browser to render
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Measure content height - scrollHeight of contentDiv includes padding
        const contentHeight = contentDiv.scrollHeight;

        // If adding this paragraph exceeds threshold, start new page
        if (contentHeight > threshold && currentPageContent.length > 0) {
          // Save current page and start new one
          pages.push([...currentPageContent]);
          currentPageContent = [];
          
          // Clear and reset for new page
          contentDiv.innerHTML = '';
          
          // Re-create the paragraph element for new page
          const newTestP = document.createElement('p');
          // ... (same styling as testP) ...
          contentDiv.appendChild(newTestP);
          await new Promise(resolve => requestAnimationFrame(resolve));
          currentPageContent.push(paragraph);
        } else {
          currentPageContent.push(paragraph);
        }
      }

      // Add remaining content as last page
      if (currentPageContent.length > 0) {
        pages.push(currentPageContent);
      }

      // Clear measurement div
      measureDiv.innerHTML = '';

      // If no content, create at least one empty page
      if (pages.length === 0) {
        pages.push([]);
      }

      clearTimeout(timeoutId);
      setMeasuredPages(pages);
    } catch (error) {
      console.error('Error during pagination measurement:', error);
      const contentText = state.book.content || '';
      setMeasuredPages(fallbackPagination(contentText, state.book.formatting));
    }
  };

  measureAndPaginate();
}, [previewMode, state.book.content, state.book.formatting, state.book.template]);
```

---

## 2. Visible Page JSX Structure
**File: `src/pages/Preview.tsx` (lines 714-876)**

```jsx
<Paper
  key={pageIndex}
  elevation={4}
  className="page"
  sx={{
    width: '8.5in',
    height: '11in',
    position: 'relative',
    pageBreakAfter: 'always',
    pageBreakInside: 'avoid',
    breakInside: 'avoid',
    overflow: 'visible !important' as any,
    overflowX: 'visible',
    overflowY: 'visible',
    display: 'flex',
    flexDirection: 'column',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
    backgroundColor: '#fff',
    color: '#333',
    padding: 0,
    margin: '0 auto',
  }}
>
  {/* Content area - stops before page number */}
  <Box sx={{ 
    flex: '1 1 auto',
    display: 'flex', 
    flexDirection: 'column',
    padding: `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`,
    paddingBottom: `calc(${state.book.formatting.marginBottom}in + 1.5em)`, // Reserve space for page number
    minHeight: 0,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    overflow: 'visible',
    overflowX: 'visible',
    overflowY: 'visible',
  }}>
    {/* Title and Author (first page only) */}
    {pageIndex === 0 && (state.book.title || !state.book.content) && (
      <Typography variant="h3" component="h1" gutterBottom sx={{ textAlign: 'center', mb: 4 }}>
        {state.book.title || 'Your Book Title'}
      </Typography>
    )}
    
    {/* Content paragraphs */}
    <Box sx={{ 
      flex: '1 1 auto', 
      overflow: 'visible',
      overflowX: 'visible',
      overflowY: 'visible',
      minHeight: 0,
      width: '100%',
      maxWidth: '100%',
      wordWrap: 'break-word',
      overflowWrap: 'break-word',
      hyphens: 'auto',
      boxSizing: 'border-box',
    }}>
      {pageContent.map((paragraph, paraIndex) => (
        <Typography 
          key={paraIndex} 
          paragraph 
          component="p"
          className="page-paragraph"
          sx={{ 
            mb: 2,
            ...templateStyles,
            textAlign: state.book.template === 'poetry' ? 'center' : 'left',
            textIndent: shouldIndent ? `${state.book.formatting.paragraphIndent}em` : '0em',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            wordBreak: 'normal',
            hyphens: 'auto',
            width: '100%',
            maxWidth: '100%',
            overflow: 'visible',
            overflowX: 'visible',
            overflowY: 'visible',
            whiteSpace: 'normal',
            display: 'block',
            boxSizing: 'border-box',
            minWidth: 0,
            breakInside: 'avoid !important' as any,
            pageBreakInside: 'avoid !important' as any,
          }}
        >
          {paragraph}
        </Typography>
      ))}
    </Box>
  </Box>
  
  {/* Page number footer - absolutely positioned at bottom, outside content flow */}
  <Box sx={{ 
    position: 'absolute', 
    bottom: `${state.book.formatting.marginBottom}in`,
    left: 0,
    right: 0,
    textAlign: 'center',
    pointerEvents: 'none',
    zIndex: 1,
  }}>
    <Typography variant="body2" color="text.secondary">
      {pageNumber}
    </Typography>
  </Box>
</Paper>
```

---

## 3. Measurement Div JSX
**File: `src/pages/Preview.tsx` (lines 658-680)**

```jsx
{/* Hidden measurement div - must match visible page exactly */}
<Box
  ref={measureDivRef}
  className="measure-page"
  sx={{
    visibility: 'hidden',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: -9999,
    width: '8.5in',
    height: '11in',
    padding: `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`,
    paddingBottom: `calc(${state.book.formatting.marginBottom}in + 1.5em)`,
    fontFamily: state.book.formatting.fontFamily,
    fontSize: `${state.book.formatting.fontSize}pt`,
    lineHeight: state.book.formatting.lineHeight,
    boxSizing: 'border-box',
    margin: 0,
    border: 'none',
    overflow: 'hidden',
  }}
/>
```

**⚠️ ISSUE FOUND:** The measurement div JSX has `padding` set directly, but the pagination logic creates an inner `contentDiv` with the padding. The JSX structure doesn't match the programmatic structure!

---

## 4. CSS
**File: `src/index.css`**

```css
/* Print preview page break rules */
.page {
  overflow: visible !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
  position: relative;
}

.page-paragraph,
.page p,
.page span {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}

/* Measurement div - must match visible page exactly */
.measure-page {
  visibility: hidden !important;
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  z-index: -9999 !important;
  width: 100% !important;
  padding: inherit !important;
  margin: 0 !important;
  font-size: inherit !important;
  line-height: inherit !important;
  font-family: inherit !important;
  letter-spacing: inherit !important;
  box-sizing: border-box !important;
  border: none !important;
  display: block !important;
}

/* Visible page styling */
.visible-page {
  width: 100% !important;
  padding: inherit !important;
  margin: 0 !important;
  font-size: inherit !important;
  line-height: inherit !important;
  font-family: inherit !important;
  letter-spacing: inherit !important;
  box-sizing: border-box !important;
  border: none !important;
}

/* Consistent line-height */
.page,
.page p {
  line-height: 1.5;
}
```

---

## 🔍 PROBLEM IDENTIFIED

**The Issue:** There's a mismatch between:
1. **Measurement div JSX** (lines 658-680): Has `padding` directly on the Box
2. **Pagination logic** (lines 134-163): Creates `measureDiv` with `padding: '0'` and an inner `contentDiv` with the padding
3. **Visible page** (lines 740-755): Has a Box with `flex: '1 1 auto'` and padding

The measurement div JSX structure doesn't match what the pagination logic creates programmatically. The JSX should have `padding: 0` and `display: 'flex'` to match the programmatic structure.


