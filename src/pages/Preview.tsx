import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  useMediaQuery,
  useTheme,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Slider,
  Divider,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  Phone as PhoneIcon,
  Tablet as TabletIcon,
  Computer as ComputerIcon,
  Visibility as VisibilityIcon,
  Print as PrintIcon,
  Edit as EditIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useBook, type BookData, type Chapter, type ChapterHeadingStyle, type ChapterAlign, type ChapterTextStyle, type ChapterNumberView } from '../context/BookContext';

// Helper function to get all chapters in order from manuscript structure
const getAllChaptersInOrder = (manuscript: BookData['manuscript']): Chapter[] => {
  const allChapters: Chapter[] = [];
  
  // Front matter
  allChapters.push(...manuscript.frontMatter);
  
  // Parts and their chapters
  manuscript.parts.forEach(part => {
    part.chapterIds.forEach(chapterId => {
      const chapter = manuscript.chapters.find(c => c.id === chapterId);
      if (chapter) allChapters.push(chapter);
    });
  });
  
  // Standalone chapters (not in parts)
  const chaptersInParts = new Set(
    manuscript.parts.flatMap(part => part.chapterIds)
  );
  allChapters.push(
    ...manuscript.chapters.filter(c => !chaptersInParts.has(c.id))
  );
  
  // Back matter
  allChapters.push(...manuscript.backMatter);
  
  return allChapters;
};

// Helper function to format font family with proper quotes and fallbacks
const formatFontFamily = (fontName: string): string => {
  // Fonts with spaces need quotes
  const needsQuotes = fontName.includes(' ');
  const quotedFont = needsQuotes ? `"${fontName}"` : fontName;
  
  // Add appropriate fallbacks based on font category
  if (fontName.includes('Serif') || ['Times New Roman', 'Georgia', 'Garamond', 'Palatino', 'Book Antiqua', 'Cambria'].includes(fontName)) {
    return `${quotedFont}, serif`;
  } else if (['Courier New'].includes(fontName)) {
    return `${quotedFont}, monospace`;
  } else {
    return `${quotedFont}, sans-serif`;
  }
};

// Fallback pagination function removed - fallback pagination is disabled
// Only the measurement-based pagination path is used

const Preview: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useBook();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [previewMode, setPreviewMode] = useState<'ebook' | 'print'>('ebook');
  const [deviceSize, setDeviceSize] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [currentPage, setCurrentPage] = useState(1);
  const measureDivRef = useRef<HTMLDivElement>(null);
  const paragraphSpacingEm = Math.max(0, state.book.formatting.lineHeight - 1);

  const updateFormatting = (updates: Partial<typeof state.book.formatting>) => {
    dispatch({
      type: 'SET_BOOK',
      payload: {
        formatting: {
          ...state.book.formatting,
          ...updates,
        },
      },
    });
  };

  const updateChapterHeading = (updates: Partial<ChapterHeadingStyle>) => {
    dispatch({
      type: 'SET_BOOK',
      payload: {
        formatting: {
          ...state.book.formatting,
          chapterHeading: {
            ...state.book.formatting.chapterHeading,
            ...updates,
          },
        },
      },
    });
  };

  // Reset to page 1 when switching modes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [previewMode]);

  // Helper function to convert number to Roman numerals
  const toRoman = (n: number): string => {
    const map: Array<[number, string]> = [
      [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],
      [100,'C'],[90,'XC'],[50,'L'],[40,'XL'],
      [10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I'],
    ];
    let num = n;
    let out = '';
    for (const [v, s] of map) {
      while (num >= v) { out += s; num -= v; }
    }
    return out;
  };

  // Format chapter label based on chapterHeading style settings
  const formatChapterLabel = React.useCallback((chapter: Chapter): string => {
    const chStyle = state.book.formatting.chapterHeading;
    const n = chapter.chapterNumber ?? 0;
    const baseTitle = chapter.title ?? '';

    if (!chapter.isNumbered || !n || chStyle.numberView === 'none') {
      return baseTitle;
    }

    if (chStyle.numberView === 'number') return `${n}. ${baseTitle}`.trim();
    if (chStyle.numberView === 'chapter-number') return `Chapter ${n}${baseTitle ? `: ${baseTitle}` : ''}`.trim();
    if (chStyle.numberView === 'roman') return `CHAPTER ${toRoman(n)}${baseTitle ? `: ${baseTitle}` : ''}`.trim();
    if (chStyle.numberView === 'custom') {
      const prefix = (chStyle.customPrefix ?? 'Chapter').trim();
      return `${prefix} ${n}${baseTitle ? `: ${baseTitle}` : ''}`.trim();
    }

    return baseTitle;
  }, [state.book.formatting.chapterHeading]);

  // Get all chapters and their formatted headings for matching during rendering
  const chaptersWithHeadings = React.useMemo(() => {
    let chapters: Chapter[] = [];
    if (state.book.manuscript && (
      state.book.manuscript.chapters.length > 0 ||
      state.book.manuscript.frontMatter.length > 0 ||
      state.book.manuscript.backMatter.length > 0
    )) {
      chapters = getAllChaptersInOrder(state.book.manuscript);
    } else if (state.book.chapters.length > 0) {
      chapters = state.book.chapters;
    }
    
    // Create a map of chapter heading text (both formatted and plain title) to chapter info
    const headingMap = new Map<string, Chapter>();
    chapters.forEach(ch => {
      const formattedHeading = formatChapterLabel(ch);
      const plainTitle = ch.title?.trim() || '';
      if (formattedHeading) headingMap.set(formattedHeading.trim(), ch);
      if (plainTitle && plainTitle !== formattedHeading) headingMap.set(plainTitle, ch);
    });
    
    return headingMap;
  }, [state.book.manuscript, state.book.chapters, formatChapterLabel]);

  // Get all chapters and their subtitles for matching during rendering
  const chaptersWithSubtitles = React.useMemo(() => {
    let chapters: Chapter[] = [];
    if (state.book.manuscript && (
      state.book.manuscript.chapters.length > 0 ||
      state.book.manuscript.frontMatter.length > 0 ||
      state.book.manuscript.backMatter.length > 0
    )) {
      chapters = getAllChaptersInOrder(state.book.manuscript);
    } else if (state.book.chapters.length > 0) {
      chapters = state.book.chapters;
    }
    
    // Create a map of subtitle text to chapter info
    const subtitleMap = new Map<string, Chapter>();
    chapters.forEach(ch => {
      if (ch.subtitle?.trim()) {
        subtitleMap.set(ch.subtitle.trim(), ch);
      }
    });
    
    return subtitleMap;
  }, [state.book.manuscript, state.book.chapters]);

  // Measurement-based pagination using hidden div
  // Pages are stored as strings (paragraphs separated by '\n\n')
  const [measuredPages, setMeasuredPages] = useState<string[]>([]);
  const [isPaginating, setIsPaginating] = useState(false);
  
  // Header and footer settings (preview-only constants, later user-configurable)
  const showHeader = false; // Default: no header
  const showFooter = true; // Default: show footer with page numbers
  const headerHeightPx = 0; // Default: no header height
  const footerHeightPx = 28; // Default: 28px footer zone for page number (24-32px range)
  
  // Tokenize content into flat token stream: words + paragraph markers ("\n\n")
  const contentTokens = React.useMemo(() => {
    // Parse paragraphs: split on single newline (Google Docs behavior)
    const toParagraphs = (raw: string): string[] => {
      return raw
        .replace(/\r\n/g, '\n')   // normalize Windows newlines
        .split('\n')              // split on single newline
        .map(p => p.trimEnd());  // preserve empty paragraphs (trimEnd only removes trailing spaces)
    };
    
    // Get full text content from manuscript, chapters, or plain content
    let fullText = '';
    
    if (state.book.manuscript && (
      state.book.manuscript.chapters.length > 0 ||
      state.book.manuscript.frontMatter.length > 0 ||
      state.book.manuscript.backMatter.length > 0
    )) {
      const chapters = getAllChaptersInOrder(state.book.manuscript);
      const parts: string[] = [];
      chapters.forEach((ch) => {
        // Use formatted chapter label for chapter headings
        const chapterLabel = formatChapterLabel(ch);
        if (chapterLabel) {
          parts.push(chapterLabel);
          parts.push('\n'); // Single newline paragraph break
        }
        // Add subtitle if it exists
        if (ch.subtitle?.trim()) {
          parts.push(ch.subtitle.trim());
          parts.push('\n'); // Single newline paragraph break
        }
        const body = ch.body || ch.content || '';
        if (body) {
          parts.push(body);
          parts.push('\n'); // Single newline paragraph break
        }
      });
      fullText = parts.join('');
    } else if (state.book.chapters.length > 0) {
      const parts: string[] = [];
      state.book.chapters.forEach((ch) => {
        // Use formatted chapter label for chapter headings
        const chapterLabel = formatChapterLabel(ch);
        if (chapterLabel) {
          parts.push(chapterLabel);
          parts.push('\n');
        }
        // Add subtitle if it exists
        if (ch.subtitle?.trim()) {
          parts.push(ch.subtitle.trim());
          parts.push('\n');
        }
        const body = ch.body || ch.content || '';
        if (body) {
          parts.push(body);
          parts.push('\n');
        }
      });
      fullText = parts.join('');
    } else {
      fullText = state.book.content || '';
    }
    
    // Parse into paragraphs
    const paragraphs = toParagraphs(fullText);
    
    // Convert to flat token stream: words + paragraph markers
    const tokens: string[] = [];
    
    paragraphs.forEach((para) => {
      if (para.length > 0) {
        // Split paragraph into words (preserve whitespace structure)
        const words = para.split(/\s+/).filter(w => w.length > 0);
        tokens.push(...words);
      }
      // Add paragraph break marker after each paragraph (including empty ones)
      tokens.push('\n\n');
    });
    
    return tokens;
  }, [state.book.manuscript, state.book.chapters, state.book.content, formatChapterLabel]);

  // Token-based flow pagination (Google Docs style)
  useEffect(() => {
    if (previewMode !== 'print') {
      setMeasuredPages([]);
      setIsPaginating(false);
          return;
        }

        if (!measureDivRef.current) {
      setIsPaginating(false);
            return;
    }

        const measureDiv = measureDivRef.current;
        measureDiv.innerHTML = '';

    // Atticus/Vellum-style page zones - explicit header/footer heights
    const PX_PER_IN = 96;
    const trim = state.book.pageSize?.trimSize ?? { width: 6, height: 9 };
    const PAGE_HEIGHT_PX = trim.height * PX_PER_IN;
    const marginTopPx = (state.book.formatting.marginTop ?? 0) * PX_PER_IN;
    const marginBottomPx = (state.book.formatting.marginBottom ?? 0) * PX_PER_IN;
    
    // Header and footer zones are excluded from text flow
    const HEADER_HEIGHT_PX = showHeader ? headerHeightPx : 0;
    const FOOTER_HEIGHT_PX = showFooter ? footerHeightPx : 0;
    
    // TEXT_BLOCK_HEIGHT_PX: Only the main text block height (excludes header/footer zones)
    // This is the height available for text content, not including margins
    const TEXT_BLOCK_HEIGHT_PX = Math.max(
      0,
      PAGE_HEIGHT_PX - marginTopPx - marginBottomPx - HEADER_HEIGHT_PX - FOOTER_HEIGHT_PX
    );
    
    // MAX_CONTENT_SCROLL_HEIGHT_PX: Maximum scrollHeight for the content container
    // scrollHeight includes padding (margins), so we compare against:
    // marginTopPx + TEXT_BLOCK_HEIGHT_PX + marginBottomPx
    const MAX_CONTENT_SCROLL_HEIGHT_PX = marginTopPx + TEXT_BLOCK_HEIGHT_PX + marginBottomPx;
    
    // Overflow tolerance: small tolerance to prevent premature breaks from rounding (cap at 3px to prevent footer overlap)
    const fontSizePx = (state.book.formatting.fontSize * PX_PER_IN) / 72; // Convert pt to px
    const lineHeightPx = fontSizePx * state.book.formatting.lineHeight;
    const OVERFLOW_TOLERANCE_PX = Math.min(3, lineHeightPx * 0.1);
    const MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX = MAX_CONTENT_SCROLL_HEIGHT_PX + OVERFLOW_TOLERANCE_PX;

    // Measurement root (MUST be offscreen + isolated)
    measureDiv.style.position = 'fixed';
    measureDiv.style.top = '-10000px';
    measureDiv.style.left = '-10000px';
    measureDiv.style.width = `${trim.width}in`;
    measureDiv.style.visibility = 'hidden';
    measureDiv.style.pointerEvents = 'none';
    measureDiv.style.contain = 'layout paint style';
    measureDiv.style.willChange = 'contents';
        measureDiv.style.padding = '0';
        measureDiv.style.margin = '0';
        measureDiv.style.boxSizing = 'border-box';

    // Measurement container (NO height limit, matches page content styling exactly)
    // Must reserve footer space structurally (same as render DOM)
    const PX_PER_IN_MEASURE = 96;
    const footerPaddingInches = FOOTER_HEIGHT_PX / PX_PER_IN_MEASURE;
    const content = document.createElement('div');
    content.style.width = `${trim.width}in`;
    // Reserve footer space structurally to prevent overlap (matches render DOM)
    content.style.padding = `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom + footerPaddingInches}in ${state.book.formatting.marginLeft}in`;
    content.style.fontFamily = state.book.formatting.fontFamily;
    content.style.fontSize = `${state.book.formatting.fontSize}pt`;
    content.style.lineHeight = `${state.book.formatting.lineHeight}`;
    content.style.boxSizing = 'border-box';
    content.style.position = 'static';
    content.style.visibility = 'visible';
    content.style.overflow = 'visible';
    content.style.height = 'auto';
    content.style.display = 'block';
    content.style.wordWrap = 'break-word';
    content.style.overflowWrap = 'break-word';

    measureDiv.appendChild(content);

    const tokens = contentTokens;
    if (tokens.length === 0) {
      setMeasuredPages(['']);
      setIsPaginating(false);
      return;
    }

    // Create paragraph element with EXACT styles that will be used in render
    // isLast: if true, margin-bottom = 0 (collapse spacing at page boundaries)
    const createParagraphElement = (isLast: boolean = false): HTMLParagraphElement => {
      const p = document.createElement('p');
      p.style.margin = '0';
      // Collapse paragraph spacing at page boundaries - last paragraph has no margin-bottom
      p.style.marginBottom = isLast ? '0' : `${Math.max(0, state.book.formatting.lineHeight - 1)}em`;
      p.style.fontFamily = state.book.formatting.fontFamily;
      p.style.fontSize = `${state.book.formatting.fontSize}pt`;
      p.style.lineHeight = `${state.book.formatting.lineHeight}`;
      p.style.textAlign = state.book.template === 'poetry' ? 'center' : 'left';
      p.style.whiteSpace = 'normal';
      p.style.display = 'block';
      p.style.wordWrap = 'break-word';
      p.style.overflowWrap = 'break-word';
      p.style.hyphens = 'auto';
      return p;
    };

    // Create heading element with EXACT styles that match render
    const createHeadingElement = (headingText: string, isLast: boolean): HTMLElement => {
      const chStyle = state.book.formatting.chapterHeading;

      const wrap = document.createElement('div');
      wrap.style.width = `${chStyle.widthPercent}%`;
      wrap.style.marginLeft = 'auto';
      wrap.style.marginRight = 'auto';
      // match your render: mb: 3 (MUI spacing = 8px * 3 = 24px)
      wrap.style.marginBottom = isLast ? '0px' : '24px';

      const h = document.createElement('div');
      h.style.margin = '0';
      h.style.padding = '0';
      h.style.display = 'block';
      h.style.fontFamily = formatFontFamily(chStyle.fontFamily);
      h.style.fontSize = `${chStyle.sizePt}pt`;
      h.style.textAlign = chStyle.align;
      h.style.fontStyle = chStyle.style.includes('italic') ? 'italic' : 'normal';
      h.style.fontWeight = chStyle.style.includes('bold') ? '700' : '400';
      h.style.fontVariant = chStyle.style === 'small-caps' ? 'small-caps' : 'normal';
      // IMPORTANT: lock heading line-height so it matches measurement + render
      h.style.lineHeight = '1.2';
      h.style.wordWrap = 'break-word';
      h.style.overflowWrap = 'break-word';

      h.textContent = headingText.trim() || ' ';
      wrap.appendChild(h);
      return wrap;
    };

    // Token-based flow pagination (Google Docs style) - monotonic, no rollback
    const paginate = async () => {
      try {
        const BATCH_SIZE = 30; // Process 30 tokens at a time before measuring
        const pages: string[] = [];
        
        // Working buffer: tokens currently being added to current page
        let currentPageTokens: string[] = [];
        // Single cursor index - never goes backward, monotonic progression
        let tokenIndex = 0;

        // Helper to rebuild DOM from tokens for measurement
        const rebuildDOM = (tokensToRender: string[] = currentPageTokens) => {
          content.innerHTML = '';
          
          // Reconstruct paragraphs from tokens
          const paragraphs: string[] = [];
          let currentParaWords: string[] = [];
          
          for (const token of tokensToRender) {
            if (token === '\n\n') {
              // Paragraph break marker
              if (currentParaWords.length > 0) {
                paragraphs.push(currentParaWords.join(' '));
                currentParaWords = [];
              } else {
                // Empty paragraph
                paragraphs.push('');
              }
            } else {
              // Word token
              currentParaWords.push(token);
            }
          }
          
          // Add final paragraph if any words remain
          if (currentParaWords.length > 0) {
            paragraphs.push(currentParaWords.join(' '));
          }
          
          // Render paragraphs in DOM
          // Last paragraph has no margin-bottom (collapse spacing at page boundaries)
          paragraphs.forEach((paraText, paraIndex) => {
            const isLast = paraIndex === paragraphs.length - 1;
            const trimmed = paraText.trim();

            const isHeading = chaptersWithHeadings.has(trimmed);
            const isSubtitle = chaptersWithSubtitles.has(trimmed);

            if (isHeading) {
              // Use the formatted label so measurement matches what render shows
              const chapter = chaptersWithHeadings.get(trimmed)!;
              const label = formatChapterLabel(chapter);

              content.appendChild(createHeadingElement(label, isLast));
              return;
            }

            if (isSubtitle) {
              // Create subtitle element with user-configurable styling
              const chStyle = state.book.formatting.chapterHeading;
              const subtitleP = createParagraphElement(isLast);
              subtitleP.style.textAlign = 'center';
              subtitleP.style.fontStyle = (chStyle.subtitleItalic ?? true) ? 'italic' : 'normal';
              subtitleP.style.fontWeight = (chStyle.subtitleBold ?? false) ? '700' : '400';
              subtitleP.style.color = '#666';
              subtitleP.style.marginBottom = isLast ? '0' : `${Math.max(0, state.book.formatting.lineHeight - 1)}em`;
              subtitleP.textContent = trimmed || ' ';
              content.appendChild(subtitleP);
              return;
            }

            const p = createParagraphElement(isLast);
            p.textContent = trimmed || ' ';
            content.appendChild(p);
          });
          
          return new Promise(resolve => {
            requestAnimationFrame(() => {
              requestAnimationFrame(resolve);
            });
          });
        };

        // Binary search to find exact cutoff within a batch
        // Uses MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX for comparison
        const findCutoff = async (batchTokens: string[]): Promise<number> => {
          if (batchTokens.length === 0) return 0;
          
          let low = 0;
          let high = batchTokens.length;
          
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            const testTokens = [...currentPageTokens, ...batchTokens.slice(0, mid)];
            await rebuildDOM(testTokens);
            
            // Use overflow tolerance to prevent premature breaks from rounding
            if (content.scrollHeight <= MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX) {
              low = mid;
            } else {
              high = mid - 1;
            }
          }
          
          return low;
        };

        // Commit current page and start new one
        const commitPage = () => {
          // Reconstruct page text from tokens
          const paragraphs: string[] = [];
          let currentParaWords: string[] = [];
          
          for (const token of currentPageTokens) {
            if (token === '\n\n') {
              if (currentParaWords.length > 0) {
                paragraphs.push(currentParaWords.join(' '));
                currentParaWords = [];
              } else {
                paragraphs.push('');
              }
            } else {
              currentParaWords.push(token);
            }
          }
          
          if (currentParaWords.length > 0) {
            paragraphs.push(currentParaWords.join(' '));
          }
          
          pages.push(paragraphs.join('\n\n'));
          currentPageTokens = [];
        };

        while (tokenIndex < tokens.length) {
          const batch: string[] = [];
          const batchStartIndex = tokenIndex;
          
          // Collect a batch of tokens
          while (tokenIndex < tokens.length && batch.length < BATCH_SIZE) {
            batch.push(tokens[tokenIndex]);
            tokenIndex++;
          }
          
          // Try adding batch to current page
          const testTokens = [...currentPageTokens, ...batch];
          await rebuildDOM(testTokens);
          
          // Use overflow tolerance to prevent premature breaks from rounding
          if (content.scrollHeight <= MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX) {
            // Entire batch fits - commit it
            currentPageTokens.push(...batch);
          } else {
            // Batch overflows - need to find exact cutoff using binary search
            const cutoff = await findCutoff(batch);
            
            if (cutoff > 0) {
              // Some tokens fit - add them to current page
              const fittingTokens = batch.slice(0, cutoff);
              currentPageTokens.push(...fittingTokens);
              
              // Commit current page
              commitPage();
              
              // Remaining tokens start the next page
              // Reset cursor to start processing remaining tokens
              tokenIndex = batchStartIndex + cutoff;
              
              if (cutoff < batch.length) {
                // Try to add remaining tokens to new page
                const remainingTokens = batch.slice(cutoff);
                currentPageTokens.push(...remainingTokens);
                await rebuildDOM(currentPageTokens);
                
                // Check if they fit on the new page (with overflow tolerance)
                if (content.scrollHeight > MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX) {
                  // Still overflowing - process remaining tokens individually
                  currentPageTokens = [];
                  
                  // Process remaining tokens one by one (tokenIndex already at cutoff)
                  while (tokenIndex < batchStartIndex + batch.length) {
                    const token = tokens[tokenIndex];
                    currentPageTokens.push(token);
                    await rebuildDOM(currentPageTokens);
                    
                    // Use overflow tolerance when checking if page is full
                    if (content.scrollHeight > MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX && currentPageTokens.length > 1) {
                      // Last token causes overflow - commit page without it, start new page with it
                      currentPageTokens.pop();
                      commitPage();
                      currentPageTokens = [token];
                      await rebuildDOM(currentPageTokens);
                    }
                    tokenIndex++;
                  }
                } else {
                  // Remaining tokens fit - advance cursor past batch
                  tokenIndex = batchStartIndex + batch.length;
                }
              } else {
                // All tokens fit - cursor already at end of batch
                tokenIndex = batchStartIndex + batch.length;
              }
            } else {
              // Nothing in batch fits on current page - commit current page
              commitPage();
              
              // Reset cursor to start of batch to process on new page
              tokenIndex = batchStartIndex;
              
              // Process batch tokens one by one on new page
              while (tokenIndex < batchStartIndex + batch.length) {
                const token = tokens[tokenIndex];
                currentPageTokens.push(token);
                await rebuildDOM(currentPageTokens);
                
                // Use overflow tolerance when checking if page is full
                if (content.scrollHeight > MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX && currentPageTokens.length > 1) {
                  // Rollback last token (only for measurement)
                  currentPageTokens.pop();
                  commitPage();
                  currentPageTokens = [token];
                  await rebuildDOM(currentPageTokens);
                }
                tokenIndex++;
              }
            }
          }
        }
        
        // Commit final page if any tokens remain
        if (currentPageTokens.length > 0 || pages.length === 0) {
          commitPage();
        }

        measureDiv.innerHTML = '';
        setMeasuredPages(pages);
        setIsPaginating(false);
      } catch (error) {
        console.error('Pagination error:', error);
        setMeasuredPages(['']);
        setIsPaginating(false);
      }
    };

    setIsPaginating(true);
    paginate();
  }, [
    previewMode,
    contentTokens,
    state.book.formatting,
    state.book.template,
    state.book.pageSize?.trimSize,
    showHeader,
    showFooter,
    chaptersWithHeadings,
    chaptersWithSubtitles,
    formatChapterLabel
  ]);
  // Use measured pages for print mode, null for ebook
  const splitIntoPages = previewMode === 'print' ? measuredPages : null;

  // Total pages includes title page (if exists) + body pages
  const hasTitlePage = (state.book.title || state.book.author);
  const bodyPageCount = splitIntoPages ? splitIntoPages.length : 0;
  const totalPages = hasTitlePage ? 1 + bodyPageCount : bodyPageCount;

  const getTemplateStyles = () => {
    const template = state.book.template;
    const baseStyles: Record<string, any> = {
      fontFamily: state.book.formatting.fontFamily,
      fontSize: `${state.book.formatting.fontSize}pt`,
      lineHeight: state.book.formatting.lineHeight,
    };

    // Apply template-specific styles
    switch (template) {
      case 'poetry':
        return {
          ...baseStyles,
          textAlign: 'center',
          fontStyle: 'italic',
        };
      case 'romance':
        return {
          ...baseStyles,
          letterSpacing: '0.5px',
        };
      case 'fantasy':
        return {
          ...baseStyles,
          fontWeight: 500,
          letterSpacing: '0.3px',
        };
      case 'academic':
        return {
          ...baseStyles,
          textAlign: 'justify',
        };
      default:
        return baseStyles;
    }
  };

  const getPreviewStyles = () => {
    const templateStyles = getTemplateStyles();
    const baseStyles = {
      ...templateStyles,
      margin: '0 auto',
      padding: '20px',
      backgroundColor: '#fff',
      color: '#333',
    };

    if (previewMode === 'ebook') {
      return {
        ...baseStyles,
        maxWidth: deviceSize === 'mobile' ? '375px' : deviceSize === 'tablet' ? '768px' : '1024px',
        minHeight: '500px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        borderRadius: '8px',
      };
    } else {
      return {
        ...baseStyles,
        maxWidth: '8.5in',
        minHeight: '11in',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        borderRadius: '4px',
        marginTop: `${state.book.formatting.marginTop}in`,
        marginBottom: `${state.book.formatting.marginBottom}in`,
        marginLeft: `${state.book.formatting.marginLeft}in`,
        marginRight: `${state.book.formatting.marginRight}in`,
      };
    }
  };

  const renderContent = () => {
    const templateStyles = getTemplateStyles();
    
    // Get chapters from manuscript structure or legacy chapters
    let chaptersToRender: Chapter[] = [];
    if (state.book.manuscript && 
        (state.book.manuscript.chapters.length > 0 || 
         state.book.manuscript.frontMatter.length > 0 || 
         state.book.manuscript.backMatter.length > 0)) {
      chaptersToRender = getAllChaptersInOrder(state.book.manuscript);
    } else if (state.book.chapters.length > 0) {
      chaptersToRender = state.book.chapters;
    }
    
    // If we have chapters, render them with chapter headers
    if (chaptersToRender.length > 0) {
      return (
        <Box>
          {state.book.title && (
            <Typography 
              variant="h3" 
              component="h1" 
              gutterBottom 
              sx={{ 
                textAlign: state.book.template === 'poetry' ? 'center' : 'center', 
                mb: 4,
                fontFamily: templateStyles.fontFamily,
              }}
            >
              {state.book.title}
            </Typography>
          )}
          
          {state.book.author && (
            <Typography 
              variant="h5" 
              component="h2" 
              gutterBottom 
              sx={{ 
                textAlign: state.book.template === 'poetry' ? 'center' : 'center', 
                mb: 4, 
                color: 'text.secondary',
                fontFamily: templateStyles.fontFamily,
              }}
            >
              by {state.book.author}
            </Typography>
          )}

          {chaptersToRender.map((chapter, chapterIndex) => {
            const chStyle = state.book.formatting.chapterHeading;
            const chapterLabel = formatChapterLabel(chapter);
            
            return (
              <Box key={chapter.id} sx={{ mb: 6, pageBreakBefore: chapter.startOnRightPage ? 'right' : 'auto' }}>
                <Box sx={{ width: `${chStyle.widthPercent}%`, mx: 'auto' }}>
                  <Typography
                    component="h2"
                    sx={{
                      fontFamily: formatFontFamily(chStyle.fontFamily),
                      fontSize: `${chStyle.sizePt}pt`,
                      textAlign: chStyle.align,
                      fontStyle: chStyle.style.includes('italic') ? 'italic' : 'normal',
                      fontWeight: chStyle.style.includes('bold') ? 700 : 400,
                      fontVariant: chStyle.style === 'small-caps' ? 'small-caps' : 'normal',
                      mb: 3,
                    }}
                  >
                    {chapterLabel}
                  </Typography>
                </Box>
                {chapter.subtitle && (
                  <Typography
                    variant="h6"
                    component="h3"
                    gutterBottom
                    sx={{
                      textAlign: 'center',
                      mb: 2,
                      fontFamily: templateStyles.fontFamily,
                      fontStyle: (state.book.formatting.chapterHeading.subtitleItalic ?? true) ? 'italic' : 'normal',
                      fontWeight: (state.book.formatting.chapterHeading.subtitleBold ?? false) ? 700 : 400,
                      color: 'text.secondary',
                    }}
                  >
                    {chapter.subtitle}
                  </Typography>
                )}
              
                <Box sx={{ whiteSpace: 'pre-wrap' }}>
                {(chapter.body || chapter.content || '').split('\n').map((paragraph, index, array) => {
                  if (paragraph.trim() === '') {
                    return <Box key={index} sx={{ height: '1em' }} />;
                  }
                  const prevNonEmpty = array.slice(0, index).reverse().find(p => p.trim() !== '');
                  const isFirstParagraph = !prevNonEmpty || prevNonEmpty.trim() === '';
                  const shouldIndent = state.book.formatting.paragraphIndent > 0 && 
                                      !isFirstParagraph && 
                                      state.book.template !== 'poetry';
                  
                  return (
                    <Typography 
                      key={index} 
                      paragraph 
                      sx={{ 
                        ...templateStyles,
                        textIndent: shouldIndent ? `${state.book.formatting.paragraphIndent}em` : '0em',
                        textAlign: state.book.template === 'poetry' ? 'center' : 'left',
                      }}
                    >
                      {paragraph}
                    </Typography>
                  );
                })}
              </Box>
            </Box>
            );
          })}
        </Box>
      );
    }
    
    // If we have imported content, show it
    if (state.book.content && state.book.content.trim()) {
      return (
        <Box>
          {state.book.title && (
            <Typography 
              variant="h3" 
              component="h1" 
              gutterBottom 
              sx={{ 
                textAlign: state.book.template === 'poetry' ? 'center' : 'center', 
                mb: 4,
                fontFamily: templateStyles.fontFamily,
              }}
            >
              {state.book.title}
            </Typography>
          )}
          
          {state.book.author && (
            <Typography 
              variant="h5" 
              component="h2" 
              gutterBottom 
              sx={{ 
                textAlign: state.book.template === 'poetry' ? 'center' : 'center', 
                mb: 4, 
                color: 'text.secondary',
                fontFamily: templateStyles.fontFamily,
              }}
            >
              by {state.book.author}
            </Typography>
          )}

          <Box sx={{ whiteSpace: 'pre-wrap' }}>
            {state.book.content.split('\n').map((paragraph, index, array) => {
              if (paragraph.trim() === '') {
                return <Box key={index} sx={{ height: '1em' }} />;
              }
              // Find previous non-empty paragraph to determine if this is first in a section
              const prevNonEmpty = array.slice(0, index).reverse().find(p => p.trim() !== '');
              const isFirstParagraph = !prevNonEmpty || prevNonEmpty.trim() === '';
              const shouldIndent = state.book.formatting.paragraphIndent > 0 && 
                                  !isFirstParagraph && 
                                  state.book.template !== 'poetry';
              
              return (
                <Typography 
                  key={index} 
                  paragraph 
                  sx={{ 
                    mb: 2,
                    ...templateStyles,
                    textAlign: state.book.template === 'poetry' ? 'center' : 'left',
                    textIndent: shouldIndent ? `${state.book.formatting.paragraphIndent}em` : '0em',
                  }}
                >
                  {paragraph}
                </Typography>
              );
            })}
          </Box>
        </Box>
      );
    }

    // Fallback to sample content if no imported content
    const template = state.book.template;
    
    if (template === 'poetry') {
      return (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography 
            variant="h4" 
            sx={{ 
              fontStyle: 'italic', 
              mb: 3,
              fontFamily: templateStyles.fontFamily,
              fontSize: templateStyles.fontSize,
            }}
          >
            Chapter One
          </Typography>
          <Box sx={{ mb: 4 }}>
            <Typography 
              variant="h6" 
              sx={{ 
                fontStyle: 'italic', 
                mb: 2,
                fontFamily: templateStyles.fontFamily,
              }}
            >
              The Journey Begins
            </Typography>
            <Typography 
              sx={{ 
                mb: 2,
                ...templateStyles,
              }}
            >
              In the quiet of the morning,<br />
              When the world is still asleep,<br />
              I find my voice in the silence,<br />
              And the words that I must keep.
            </Typography>
            <Typography 
              sx={{ 
                mb: 2,
                ...templateStyles,
              }}
            >
              The pages turn like seasons,<br />
              Each chapter a new day,<br />
              And in the rhythm of the verses,<br />
              I find my own way.
            </Typography>
          </Box>
        </Box>
      );
    }

    return (
      <Box>
        <Typography 
          variant="h3" 
          component="h1" 
          gutterBottom 
          sx={{ 
            textAlign: 'center', 
            mb: 4,
            fontFamily: templateStyles.fontFamily,
          }}
        >
          {state.book.title || 'Your Book Title'}
        </Typography>
        
        <Typography 
          variant="h5" 
          component="h2" 
          gutterBottom 
          sx={{ 
            textAlign: 'center', 
            mb: 4, 
            color: 'text.secondary',
            fontFamily: templateStyles.fontFamily,
          }}
        >
          by {state.book.author || 'Author Name'}
        </Typography>

        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography 
            variant="h4" 
            sx={{ 
              mb: 3,
              fontFamily: templateStyles.fontFamily,
            }}
          >
            Chapter One
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              mb: 4, 
              fontStyle: 'italic',
              fontFamily: templateStyles.fontFamily,
            }}
          >
            The Beginning
          </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography 
            paragraph
            sx={{
              ...templateStyles,
              textIndent: state.book.formatting.paragraphIndent > 0 ? `${state.book.formatting.paragraphIndent}em` : '0em',
            }}
          >
            It was a dark and stormy night when Sarah first discovered the ancient book in her grandmother's attic. 
            The leather binding was worn and cracked, but something about it called to her. As she carefully opened 
            the first page, a warm golden light began to emanate from within.
          </Typography>
          
          <Typography 
            paragraph
            sx={{
              ...templateStyles,
              textIndent: state.book.formatting.paragraphIndent > 0 ? `${state.book.formatting.paragraphIndent}em` : '0em',
            }}
          >
            The words seemed to dance across the page, shifting and changing as she read. It was unlike anything 
            she had ever seen before. Each sentence told a story, and each story led to another, creating an 
            intricate web of tales that spanned centuries.
          </Typography>

          <Box sx={{ textAlign: 'center', my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              * * *
            </Typography>
          </Box>

          <Typography 
            paragraph
            sx={{
              ...templateStyles,
              textIndent: state.book.formatting.paragraphIndent > 0 ? `${state.book.formatting.paragraphIndent}em` : '0em',
            }}
          >
            Hours passed as Sarah became lost in the book's pages. She read about brave knights and wise wizards, 
            about love that transcended time and magic that could change the world. When she finally looked up, 
            the sun was beginning to rise, and she knew that her life would never be the same.
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography variant="body2" color="text.secondary">
            — End of Chapter One —
          </Typography>
        </Box>
      </Box>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4, overflow: 'visible', height: 'auto', minHeight: 'auto' }}>
      <Typography
        variant={isMobile ? 'h4' : 'h3'}
        component="h1"
        gutterBottom
        textAlign="center"
        sx={{ fontWeight: 600, color: 'primary.main' }}
      >
        Preview Your Book
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        paragraph
        sx={{ mb: 4 }}
      >
        See how your book will look in different formats and devices
      </Typography>

      {/* Preview Controls */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">Preview Mode:</Typography>
            <ToggleButtonGroup
              value={previewMode}
              exclusive
              onChange={(_, value) => value && setPreviewMode(value)}
              size="small"
            >
              <ToggleButton value="ebook">
                <VisibilityIcon sx={{ mr: 1 }} />
                eBook
              </ToggleButton>
              <ToggleButton value="print">
                <PrintIcon sx={{ mr: 1 }} />
                Print
              </ToggleButton>
            </ToggleButtonGroup>

            {previewMode === 'ebook' && (
              <>
                <Typography variant="h6" sx={{ ml: 2 }}>Device:</Typography>
                <ToggleButtonGroup
                  value={deviceSize}
                  exclusive
                  onChange={(_, value) => value && setDeviceSize(value)}
                  size="small"
                >
                  <ToggleButton value="mobile">
                    <PhoneIcon sx={{ mr: 1 }} />
                    Mobile
                  </ToggleButton>
                  <ToggleButton value="tablet">
                    <TabletIcon sx={{ mr: 1 }} />
                    Tablet
                  </ToggleButton>
                  <ToggleButton value="desktop">
                    <ComputerIcon sx={{ mr: 1 }} />
                    Desktop
                  </ToggleButton>
                </ToggleButtonGroup>
              </>
            )}
          </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mt: 1 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Template</InputLabel>
            <Select
              label="Template"
              value={state.book.template}
              onChange={(e) =>
                dispatch({
                  type: 'SET_BOOK',
                  payload: { template: e.target.value as string },
                })
              }
            >
              <MenuItem value="classic">Classic</MenuItem>
              <MenuItem value="modern">Modern</MenuItem>
              <MenuItem value="minimal">Minimal</MenuItem>
              <MenuItem value="poetry">Poetry</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Font</InputLabel>
            <Select
              label="Font"
              value={state.book.formatting.fontFamily}
              onChange={(e) => updateFormatting({ fontFamily: e.target.value as string })}
            >
              <MenuItem value="Times New Roman">Times New Roman</MenuItem>
              <MenuItem value="Georgia">Georgia</MenuItem>
              <MenuItem value="Garamond">Garamond</MenuItem>
              <MenuItem value="Palatino">Palatino</MenuItem>
              <MenuItem value="Book Antiqua">Book Antiqua</MenuItem>
              <MenuItem value="Arial">Arial</MenuItem>
              <MenuItem value="Helvetica">Helvetica</MenuItem>
              <MenuItem value="Calibri">Calibri</MenuItem>
              <MenuItem value="Cambria">Cambria</MenuItem>
              <MenuItem value="Courier New">Courier New</MenuItem>
              <MenuItem value="Roboto">Roboto</MenuItem>
              <MenuItem value="Open Sans">Open Sans</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="number"
            label="Size (pt)"
            value={state.book.formatting.fontSize}
            onChange={(e) => updateFormatting({ fontSize: Number(e.target.value) })}
            inputProps={{ min: 8, max: 24, step: 0.5 }}
            sx={{ width: 110 }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 220 }}>
            <Typography variant="body2" color="text.secondary">
              Line Height
            </Typography>
            <Slider
              size="small"
              value={state.book.formatting.lineHeight}
              min={1.0}
              max={2.2}
              step={0.05}
              onChange={(_, val) => updateFormatting({ lineHeight: val as number })}
              sx={{ width: 140 }}
            />
            <Typography variant="body2" color="text.secondary">
              {state.book.formatting.lineHeight.toFixed(2)}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Chapter Heading Style */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Chapter Heading
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            {/* Font */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Heading Font</InputLabel>
              <Select
                label="Heading Font"
                value={state.book.formatting.chapterHeading.fontFamily}
                onChange={(e) => updateChapterHeading({ fontFamily: e.target.value as string })}
              >
                <MenuItem value="Times New Roman">Times New Roman</MenuItem>
                <MenuItem value="Georgia">Georgia</MenuItem>
                <MenuItem value="Garamond">Garamond</MenuItem>
                <MenuItem value="Palatino">Palatino</MenuItem>
                <MenuItem value="Book Antiqua">Book Antiqua</MenuItem>
                <MenuItem value="Arial">Arial</MenuItem>
                <MenuItem value="Helvetica">Helvetica</MenuItem>
                <MenuItem value="Calibri">Calibri</MenuItem>
                <MenuItem value="Cambria">Cambria</MenuItem>
                <MenuItem value="Roboto">Roboto</MenuItem>
                <MenuItem value="Open Sans">Open Sans</MenuItem>
              </Select>
            </FormControl>

            {/* Align */}
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Align</InputLabel>
              <Select
                label="Align"
                value={state.book.formatting.chapterHeading.align}
                onChange={(e) => updateChapterHeading({ align: e.target.value as ChapterAlign })}
              >
                <MenuItem value="left">Left</MenuItem>
                <MenuItem value="center">Center</MenuItem>
                <MenuItem value="right">Right</MenuItem>
              </Select>
            </FormControl>

            {/* Style */}
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <InputLabel>Style</InputLabel>
              <Select
                label="Style"
                value={state.book.formatting.chapterHeading.style}
                onChange={(e) => updateChapterHeading({ style: e.target.value as ChapterTextStyle })}
              >
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="italic">Italic</MenuItem>
                <MenuItem value="bold">Bold</MenuItem>
                <MenuItem value="bold-italic">Bold Italic</MenuItem>
                <MenuItem value="small-caps">Small Caps</MenuItem>
              </Select>
            </FormControl>

            {/* Size */}
            <TextField
              size="small"
              type="number"
              label="Size (pt)"
              value={state.book.formatting.chapterHeading.sizePt}
              onChange={(e) => updateChapterHeading({ sizePt: Number(e.target.value) })}
              inputProps={{ min: 10, max: 48, step: 1 }}
              sx={{ width: 120 }}
            />

            {/* Width % */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 260 }}>
              <Typography variant="body2" color="text.secondary">
                Width
              </Typography>
              <Slider
                size="small"
                value={state.book.formatting.chapterHeading.widthPercent}
                min={40}
                max={100}
                step={1}
                onChange={(_, val) => updateChapterHeading({ widthPercent: val as number })}
                sx={{ width: 140 }}
              />
              <Typography variant="body2" color="text.secondary">
                {state.book.formatting.chapterHeading.widthPercent}%
              </Typography>
            </Box>

            {/* Chapter number view */}
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Number View</InputLabel>
              <Select
                label="Number View"
                value={state.book.formatting.chapterHeading.numberView}
                onChange={(e) => updateChapterHeading({ numberView: e.target.value as ChapterNumberView })}
              >
                <MenuItem value="none">No number</MenuItem>
                <MenuItem value="number">1 (number only)</MenuItem>
                <MenuItem value="chapter-number">Chapter 1</MenuItem>
                <MenuItem value="roman">CHAPTER I</MenuItem>
                <MenuItem value="custom">Custom Prefix + #</MenuItem>
              </Select>
            </FormControl>

            {state.book.formatting.chapterHeading.numberView === 'custom' && (
              <TextField
                size="small"
                label="Custom Prefix"
                value={state.book.formatting.chapterHeading.customPrefix ?? ''}
                onChange={(e) => updateChapterHeading({ customPrefix: e.target.value })}
                sx={{ width: 220 }}
              />
            )}

            {/* Subtitle Formatting */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                Subtitle:
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={state.book.formatting.chapterHeading.subtitleItalic ?? true}
                    onChange={(e) => updateChapterHeading({ subtitleItalic: e.target.checked })}
                    size="small"
                  />
                }
                label="Italic"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={state.book.formatting.chapterHeading.subtitleBold ?? false}
                    onChange={(e) => updateChapterHeading({ subtitleBold: e.target.checked })}
                    size="small"
                  />
                }
                label="Bold"
              />
            </Box>
          </Box>

          {/* Live preview */}
          <Box
            sx={{
              mt: 2,
              p: 2,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              backgroundColor: 'background.paper',
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Preview
            </Typography>

            <Box sx={{ width: `${state.book.formatting.chapterHeading.widthPercent}%`, mx: 'auto' }}>
              <Typography
                sx={{
                  fontFamily: formatFontFamily(state.book.formatting.chapterHeading.fontFamily),
                  fontSize: `${state.book.formatting.chapterHeading.sizePt}pt`,
                  textAlign: state.book.formatting.chapterHeading.align,
                  fontStyle: state.book.formatting.chapterHeading.style.includes('italic') ? 'italic' : 'normal',
                  fontWeight: state.book.formatting.chapterHeading.style.includes('bold') ? 700 : 400,
                  fontVariant: state.book.formatting.chapterHeading.style === 'small-caps' ? 'small-caps' : 'normal',
                }}
              >
                Chapter Heading Example
              </Typography>
            </Box>
          </Box>
        </Box>
        </CardContent>
      </Card>

      {/* Hidden measurement div - must match visible page exactly */}
      {/* Measurement root: absolute position, visibility hidden, overflow visible, height auto */}
      <Box
        ref={measureDivRef}
        className="measure-page"
        sx={{
          position: 'fixed',
          top: '-10000px',
          left: '-10000px',
          visibility: 'hidden',
          pointerEvents: 'none',
          contain: 'layout paint style',
          width: state.book.pageSize?.trimSize
            ? `${state.book.pageSize.trimSize.width}in`
            : '6in',
          padding: 0,
          margin: 0,
          border: 'none',
          boxSizing: 'border-box',
          zIndex: -1,
        }}
      />

      {/* Preview Area */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
        {previewMode === 'print' && totalPages > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, width: '100%', maxWidth: state.book.pageSize?.trimSize ? `${state.book.pageSize.trimSize.width}in` : '6in', justifyContent: 'space-between' }}>
            <IconButton
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              size="large"
            >
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="body1" sx={{ minWidth: 120, textAlign: 'center' }}>
              {hasTitlePage && currentPage === 1 ? 'Title Page' : `Page ${currentPage} of ${totalPages}`}
            </Typography>
            <IconButton
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              size="large"
            >
              <ChevronRightIcon />
            </IconButton>
          </Box>
        )}

        {previewMode === 'print' ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', alignItems: 'center' }}>
            {state.book.pageSize?.trimSize && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Previewing {state.book.pageSize.trimSize.name} (scaled)
              </Typography>
            )}
            {isPaginating ? (
              <Paper
                elevation={4}
                sx={{
                  width: `${state.book.pageSize?.trimSize?.width || 6}in`,
                  height: `${state.book.pageSize?.trimSize?.height || 9}in`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fff',
                }}
              >
                <Typography
                  sx={{
                    fontStyle: 'italic',
                    color: 'text.secondary',
                  }}
                >
                  Laying out pages…
                </Typography>
              </Paper>
            ) : (
              <>
                {/* Title Page - Separate, non-paginated */}
                {(state.book.title || state.book.author) && currentPage === 1 && (
                  <Box
                    sx={{
                      width: `${state.book.pageSize?.trimSize?.width || 6}in`,
                      minWidth: `${state.book.pageSize?.trimSize?.width || 6}in`,
                      maxWidth: `${state.book.pageSize?.trimSize?.width || 6}in`,
                      display: 'flex',
                      justifyContent: 'center',
                      mb: 4,
                    }}
                  >
                    <Paper
                      elevation={4}
                      className="title-page"
                      sx={{
                        width: `${state.book.pageSize?.trimSize?.width || 6}in`,
                        minWidth: `${state.book.pageSize?.trimSize?.width || 6}in`,
                        maxWidth: `${state.book.pageSize?.trimSize?.width || 6}in`,
                        height: `${state.book.pageSize?.trimSize?.height || 9}in`,
                        minHeight: `${state.book.pageSize?.trimSize?.height || 9}in`,
                        maxHeight: `${state.book.pageSize?.trimSize?.height || 9}in`,
                        position: 'relative',
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                        backgroundColor: '#fff',
                        color: '#333',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {state.book.title && (
                        <Typography 
                          variant="h3" 
                          component="h1" 
                          sx={{ 
                            textAlign: 'center', 
                            mb: 4,
                            fontFamily: getTemplateStyles().fontFamily,
                          }}
                        >
                          {state.book.title}
                        </Typography>
                      )}
                      {state.book.author && (
                        <Typography 
                          variant="h5" 
                          component="h2" 
                          sx={{ 
                            textAlign: 'center', 
                            color: 'text.secondary',
                            fontFamily: getTemplateStyles().fontFamily,
                          }}
                        >
                          by {state.book.author}
                        </Typography>
                      )}
                    </Paper>
                  </Box>
                )}
                
                {/* Body Pages - Paginated content */}
                {splitIntoPages && splitIntoPages.length > 0 && (() => {
                  // Adjust page index for title page (if exists)
                  const titlePageOffset = (state.book.title || state.book.author) ? 1 : 0;
                  const bodyPageIndex = currentPage - 1 - titlePageOffset;
                  
                  // Show title page when currentPage === 1, body pages when currentPage > 1
                  if (titlePageOffset > 0 && currentPage === 1) {
                    return null; // Title page already rendered above
                  }
                  
                  if (bodyPageIndex < 0 || bodyPageIndex >= splitIntoPages.length) {
                    return null;
                  }
                  
                  const pageText = splitIntoPages[bodyPageIndex];
                  const displayPageNumber = bodyPageIndex + 1; // Body page numbering starts at 1
                  const trimSize = state.book.pageSize?.trimSize || { width: 6, height: 9 };
                  const PX_PER_IN = 96;
                  const currentFooterHeightPx = showFooter ? footerHeightPx : 0;
                  const currentHeaderHeightPx = showHeader ? headerHeightPx : 0;

                  return (
                    <Box
                      key={bodyPageIndex}
                      sx={{
                        width: `${trimSize.width}in`,
                        minWidth: `${trimSize.width}in`,
                        maxWidth: `${trimSize.width}in`,
                        display: 'flex',
                        justifyContent: 'center',
                        mb: 4,
                      }}
                    >
                      <Paper
                        elevation={4}
                        className="page"
                        sx={{
                          width: `${trimSize.width}in`,
                          minWidth: `${trimSize.width}in`,
                          maxWidth: `${trimSize.width}in`,
                          height: `${trimSize.height}in`,
                          minHeight: `${trimSize.height}in`,
                          maxHeight: `${trimSize.height}in`,
                          position: 'relative',
                          pageBreakAfter: 'always',
                          overflow: 'hidden',
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word',
                          boxSizing: 'border-box',
                          backgroundColor: '#fff',
                          color: '#333',
                          padding: 0,
                          margin: 0,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {/* Header Zone (if enabled) - absolutely positioned */}
                        {showHeader && currentHeaderHeightPx > 0 && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: `${state.book.formatting.marginTop}in`,
                              left: 0,
                              right: 0,
                              height: `${currentHeaderHeightPx}px`,
                              zIndex: 1,
                            }}
                          />
                        )}
                        
                        {/* Text Block Zone - paginated content */}
                        <Box
                          sx={{
                            padding: `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom + (currentFooterHeightPx / PX_PER_IN)}in ${state.book.formatting.marginLeft}in`,
                            boxSizing: 'border-box',
                            display: 'block',
                            width: '100%',
                            flex: 1,
                            overflow: 'visible',
                            // Reserve footer space structurally to prevent overlap
                            paddingBottom: `${state.book.formatting.marginBottom + (currentFooterHeightPx / PX_PER_IN)}in`,
                          }}
                        >
                          {/* Render paragraphs using raw <p> elements - EXACT match to measurement DOM */}
                          {(() => {
                            const paragraphs = typeof pageText === 'string' 
                              ? pageText.split('\n\n').filter(p => p !== null && p !== undefined)
                              : [];
                            
                            if (paragraphs.length === 0) {
                              return (
                                <p
                                  style={{
                                    margin: 0,
                                    marginBottom: `${paragraphSpacingEm}em`,
                                    fontFamily: state.book.formatting.fontFamily,
                                    fontSize: `${state.book.formatting.fontSize}pt`,
                                    lineHeight: state.book.formatting.lineHeight,
                                    textAlign: 'center',
                                    color: '#666',
                                    fontStyle: 'italic',
                                    display: 'block',
                                  }}
                                >
                                  (Empty page)
                                </p>
                              );
                            }
                            
                            return paragraphs.map((paraText, paraIndex) => {
                              const isFirstParagraph = paraIndex === 0;
                              const isLastParagraph = paraIndex === paragraphs.length - 1;
                              const shouldIndent = state.book.formatting.paragraphIndent > 0 && 
                                                  !isFirstParagraph && 
                                                  state.book.template !== 'poetry';
                              const trimmedText = paraText.trim();
                              
                              // Check if this paragraph is a chapter heading
                              const chapterForHeading = chaptersWithHeadings.get(trimmedText);
                              const isChapterHeading = !!chapterForHeading;
                              
                              // Check if this paragraph is a chapter subtitle
                              const chapterForSubtitle = chaptersWithSubtitles.get(trimmedText);
                              const isChapterSubtitle = !!chapterForSubtitle;
                              
                              // If it's a chapter heading, render with chapter heading styles
                              // MUST match createHeadingElement() in measurement
                              if (isChapterHeading) {
                                const chStyle = state.book.formatting.chapterHeading;
                                const chapterLabel = formatChapterLabel(chapterForHeading!);
                                
                                return (
                                  <div
                                    key={paraIndex}
                                    style={{
                                      width: `${chStyle.widthPercent}%`,
                                      marginLeft: 'auto',
                                      marginRight: 'auto',
                                      marginBottom: isLastParagraph ? '0px' : '24px', // same as measurement
                                    }}
                                  >
                                    <div
                                      style={{
                                        margin: 0,
                                        padding: 0,
                                        display: 'block',
                                        fontFamily: formatFontFamily(chStyle.fontFamily),
                                        fontSize: `${chStyle.sizePt}pt`,
                                        lineHeight: '1.2', // same as measurement
                                        textAlign: chStyle.align,
                                        fontStyle: chStyle.style.includes('italic') ? 'italic' : 'normal',
                                        fontWeight: chStyle.style.includes('bold') ? 700 : 400,
                                        fontVariant: chStyle.style === 'small-caps' ? 'small-caps' : 'normal',
                                        wordWrap: 'break-word',
                                        overflowWrap: 'break-word',
                                      }}
                                    >
                                      {chapterLabel}
                                    </div>
                                  </div>
                                );
                              }
                              
                              // If it's a chapter subtitle, render with subtitle styles
                              // MUST match subtitle rendering in measurement
                              if (isChapterSubtitle) {
                                const chStyle = state.book.formatting.chapterHeading;
                                return (
                                  <p
                                    key={paraIndex}
                                    style={{
                                      margin: 0,
                                      marginBottom: isLastParagraph ? '0' : `${paragraphSpacingEm}em`,
                                      fontFamily: state.book.formatting.fontFamily,
                                      fontSize: `${state.book.formatting.fontSize}pt`,
                                      lineHeight: state.book.formatting.lineHeight,
                                      textAlign: 'center',
                                      fontStyle: (chStyle.subtitleItalic ?? true) ? 'italic' : 'normal',
                                      fontWeight: (chStyle.subtitleBold ?? false) ? '700' : '400',
                                      color: '#666',
                                      whiteSpace: 'normal',
                                      display: 'block',
                                      wordWrap: 'break-word',
                                      overflowWrap: 'break-word',
                                      hyphens: 'auto',
                                    }}
                                  >
                                    {trimmedText || '\u00A0'}
                                  </p>
                                );
                              }
                              
                              // Regular paragraph rendering
                              return (
                                <p
                                  key={paraIndex} 
                                  style={{
                                    margin: 0,
                                    // Collapse paragraph spacing at page boundaries - last paragraph has no margin-bottom
                                    marginBottom: isLastParagraph ? '0' : `${paragraphSpacingEm}em`,
                                    fontFamily: state.book.formatting.fontFamily,
                                    fontSize: `${state.book.formatting.fontSize}pt`,
                                    lineHeight: state.book.formatting.lineHeight,
                                    textAlign: state.book.template === 'poetry' ? 'center' : 'left',
                                    textIndent: shouldIndent ? `${state.book.formatting.paragraphIndent}em` : '0em',
                                    whiteSpace: 'normal',
                                    display: 'block',
                                    wordWrap: 'break-word',
                                    overflowWrap: 'break-word',
                                    hyphens: 'auto',
                                  }}
                                >
                                  {trimmedText || '\u00A0'}
                                </p>
                              );
                            });
                          })()}
                        </Box>
                        
                        {/* Footer Zone - page number */}
                        {showFooter && currentFooterHeightPx > 0 && (
                          <Box
                            sx={{
                              position: 'absolute',
                              bottom: `${state.book.formatting.marginBottom}in`,
                              left: 0,
                              right: 0,
                              height: `${currentFooterHeightPx}px`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                              pointerEvents: 'none',
                              zIndex: 1,
                            }}
                          >
                            <Typography 
                              variant="body2" 
                              color="text.secondary"
                              sx={{
                                display: 'inline-block',
                              }}
                            >
                              {displayPageNumber}
                            </Typography>
                          </Box>
                        )}
                      </Paper>
                    </Box>
                  );
                })()}
              </>
            )}
          </Box>
        ) : (
        <Paper
          elevation={3}
          sx={{
            ...getPreviewStyles(),
            overflowY: 'auto',
            overflowX: 'hidden',
            maxHeight: deviceSize === 'mobile' ? '600px' : deviceSize === 'tablet' ? '800px' : '900px',
            height: deviceSize === 'mobile' ? '600px' : deviceSize === 'tablet' ? '800px' : '900px',
            minHeight: '500px',
            padding: deviceSize === 'mobile' ? '20px' : deviceSize === 'tablet' ? '30px' : '40px',
            boxSizing: 'border-box',
            // Smooth scrolling
            scrollBehavior: 'smooth',
            // Custom scrollbar styling for better UX
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: '#f1f1f1',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: '#888',
              borderRadius: '4px',
              '&:hover': {
                background: '#555',
              },
            },
          }}
        >
          {renderContent()}
        </Paper>
        )}
      </Box>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => navigate('/format')}
          size="large"
        >
          Edit Formatting
        </Button>
        <Button
          variant="contained"
          onClick={() => navigate('/export')}
          size="large"
        >
          Export Book
        </Button>
      </Box>
    </Container>
  );
};

export default Preview;
