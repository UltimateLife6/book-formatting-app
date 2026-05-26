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
  Alert,
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
import { useBook, type Chapter, type ChapterHeadingStyle, type ChapterTitleStyle, type ChapterSubtitleStyle, type ChapterAlign, type ChapterTextStyle, type ChapterNumberView } from '../context/BookContext';
import { getAllChaptersInOrder } from '../utils/manuscriptOrder';
import { runTokenPagination } from '../pagination/runTokenPagination';
import { buildTokensForChapter, hashString } from '../utils/manuscriptChapterTokens';
import { yieldToMain } from '../utils/scheduling';
import {
  buildPreviewSpreads,
  findSpreadIndexForPage,
  formatSpreadLabel,
  primaryPageInSpread,
} from '../utils/previewSpreads';
import {
  PrintPreviewBlankPage,
  renderPrintPageByNumber,
  type PrintPreviewPageContext,
} from '../components/PrintPreviewPage';

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
  const isNarrowScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [previewMode, setPreviewMode] = useState<'ebook' | 'print'>('ebook');
  const [previewLayout, setPreviewLayout] = useState<'single' | 'spread'>('single');
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);
  const [deviceSize, setDeviceSize] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [currentPage, setCurrentPage] = useState(1);
  const measureDivRef = useRef<HTMLDivElement>(null);
  /** Per-chapter print pagination cache: avoids re-measuring unchanged chapters in Preview. */
  const chapterPaginationCacheRef = useRef<Map<string, { key: string; pages: string[] }>>(new Map());
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

  const updateChapterTitle = (updates: Partial<ChapterTitleStyle>) => {
    dispatch({
      type: 'SET_BOOK',
      payload: {
        formatting: {
          ...state.book.formatting,
          chapterTitle: {
            ...state.book.formatting.chapterTitle,
            ...updates,
          },
        },
      },
    });
  };

  const updateChapterSubtitle = (updates: Partial<ChapterSubtitleStyle>) => {
    dispatch({
      type: 'SET_BOOK',
      payload: {
        formatting: {
          ...state.book.formatting,
          chapterSubtitle: {
            ...state.book.formatting.chapterSubtitle,
            ...updates,
          },
        },
      },
    });
  };

  // Reset to page 1 when switching modes
  React.useEffect(() => {
    setCurrentPage(1);
    setCurrentSpreadIndex(0);
  }, [previewMode]);

  React.useEffect(() => {
    if (previewMode !== 'print' || isNarrowScreen) {
      setPreviewLayout('single');
    }
  }, [previewMode, isNarrowScreen]);

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

  // Format chapter header (number/prefix only) based on chapterHeading style settings
  const formatChapterHeader = React.useCallback((chapter: Chapter): string | null => {
    const chStyle = state.book.formatting.chapterHeading;
    const n = chapter.chapterNumber ?? 0;

    if (!chapter.isNumbered || !n || chStyle.numberView === 'none') {
      return null;
    }

    if (chStyle.numberView === 'number') return `${n}.`;
    if (chStyle.numberView === 'chapter-number') return `Chapter ${n}`;
    if (chStyle.numberView === 'roman') return `CHAPTER ${toRoman(n)}`;
    if (chStyle.numberView === 'custom') {
      const prefix = (chStyle.customPrefix ?? 'Chapter').trim();
      return `${prefix} ${n}`;
    }

    return null;
  }, [state.book.formatting.chapterHeading]);


  const chapterContentHash = React.useCallback((ch: Chapter) => {
    return hashString(
      [ch.id, ch.title, ch.subtitle ?? '', ch.body ?? '', ch.content ?? '', String(ch.isNumbered)].join('\x1e')
    );
  }, []);

  // Create a map of chapter IDs to chapters for atomic token lookup
  const chaptersById = React.useMemo(() => {
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
    
    const idMap = new Map<string, Chapter>();
    chapters.forEach(ch => {
      idMap.set(ch.id, ch);
    });
    
    return idMap;
  }, [state.book.manuscript, state.book.chapters]);

  // Measurement-based pagination using hidden div
  // Pages are stored as strings (paragraphs separated by '\n\n')
  const [measuredPages, setMeasuredPages] = useState<string[]>([]);
  const [isPaginating, setIsPaginating] = useState(false);
  const [paginationProgress, setPaginationProgress] = useState<{
    totalChapters: number;
    chaptersReady: number;
    workingChapterTitle: string;
    chapterFormattingComplete: boolean;
  }>({
    totalChapters: 0,
    chaptersReady: 0,
    workingChapterTitle: '',
    chapterFormattingComplete: true,
  });
  
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
        // Add chapter header (number/prefix) as atomic token if it exists
        const chapterHeader = formatChapterHeader(ch);
        if (chapterHeader) {
          parts.push(`__HEADER__${ch.id}`);
          parts.push('\n'); // Separate atomic tokens so they don't concatenate
        }
        // Add chapter title as atomic token if it exists
        if (ch.title?.trim()) {
          parts.push(`__TITLE__${ch.id}`);
          parts.push('\n'); // Separate atomic tokens so they don't concatenate
        }
        // Add subtitle as atomic token if it exists
        if (ch.subtitle?.trim()) {
          parts.push(`__SUBTITLE__${ch.id}`);
          parts.push('\n'); // Separate atomic tokens so they don't concatenate
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
        // Add chapter header (number/prefix) as atomic token if it exists
        const chapterHeader = formatChapterHeader(ch);
        if (chapterHeader) {
          parts.push(`__HEADER__${ch.id}`);
          parts.push('\n'); // Separate atomic tokens so they don't concatenate
        }
        // Add chapter title as atomic token if it exists
        if (ch.title?.trim()) {
          parts.push(`__TITLE__${ch.id}`);
          parts.push('\n'); // Separate atomic tokens so they don't concatenate
        }
        // Add subtitle as atomic token if it exists
        if (ch.subtitle?.trim()) {
          parts.push(`__SUBTITLE__${ch.id}`);
          parts.push('\n'); // Separate atomic tokens so they don't concatenate
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
    
    // Convert to flat token stream: words + paragraph markers + atomic block tokens
    const tokens: string[] = [];
    
    paragraphs.forEach((para, idx) => {
      if (para.length > 0) {
        // Check if this is an atomic block token (header, title, or subtitle)
        if (para.startsWith('__HEADER__') || para.startsWith('__TITLE__') || para.startsWith('__SUBTITLE__')) {
          // Atomic token - add as single unit, never split
          // Headers control spacing via marginBottom, no paragraph break needed
          tokens.push(para);
        } else {
          // Regular paragraph - split into words
          const words = para.split(/\s+/).filter(Boolean);
          tokens.push(...words);
          // Only add paragraph break after real text paragraphs
          tokens.push('\n\n');
        }
      }
      // Empty paragraphs are ignored - do not create visual spacing
    });
    
    return tokens;
  }, [state.book.manuscript, state.book.chapters, state.book.content, formatChapterHeader]);

  const orderedChaptersForPagination = React.useMemo(() => {
    if (
      state.book.manuscript &&
      (state.book.manuscript.chapters.length > 0 ||
        state.book.manuscript.frontMatter.length > 0 ||
        state.book.manuscript.backMatter.length > 0)
    ) {
      return getAllChaptersInOrder(state.book.manuscript);
    }
    if (state.book.chapters.length > 0) {
      return state.book.chapters;
    }
    return [];
  }, [state.book.manuscript, state.book.chapters]);

  const formatPaginationKey = React.useMemo(
    () =>
      hashString(
        JSON.stringify({
          formatting: state.book.formatting,
          template: state.book.template,
          trimId: state.book.pageSize?.trimSize?.id,
          trimW: state.book.pageSize?.trimSize?.width,
          trimH: state.book.pageSize?.trimSize?.height,
        })
      ),
    [state.book.formatting, state.book.template, state.book.pageSize?.trimSize]
  );

  React.useEffect(() => {
    chapterPaginationCacheRef.current.clear();
  }, [formatPaginationKey]);

  // Token-based flow pagination (Google Docs style).
  // Performance strategy: when the book is split into chapters, paginate each chapter independently,
  // merge pages in manuscript order, cache unchanged chapters, and yield to the browser between chapters
  // so typing/navigation stay responsive. Plain `content` (no chapter list) still uses one token stream.
  useEffect(() => {
    if (previewMode !== 'print') {
      setMeasuredPages([]);
      setIsPaginating(false);
      setPaginationProgress((p) => ({ ...p, chapterFormattingComplete: true }));
      return;
    }

    if (!measureDivRef.current) {
      setIsPaginating(false);
      return;
    }

    const measureDiv = measureDivRef.current;
    const trim = state.book.pageSize?.trimSize ?? { width: 6, height: 9 };
    const cancelled = { current: false };
    const ordered = orderedChaptersForPagination;

    const runOpts = {
      formatting: state.book.formatting,
      template: state.book.template,
      trim,
      showHeader,
      showFooter,
      headerHeightPx,
      footerHeightPx,
      chaptersById,
      formatChapterHeader,
    };

    setIsPaginating(true);
    setPaginationProgress({
      totalChapters: ordered.length > 0 ? ordered.length : contentTokens.length ? 1 : 0,
      chaptersReady: 0,
      workingChapterTitle: '',
      chapterFormattingComplete: false,
    });

    const run = async () => {
      try {
        const validIds = new Set(ordered.map((c) => c.id));
        for (const id of Array.from(chapterPaginationCacheRef.current.keys())) {
          if (!validIds.has(id)) {
            chapterPaginationCacheRef.current.delete(id);
          }
        }

        if (ordered.length > 0) {
          const pagesDone = new Map<string, string[]>();
          for (let i = 0; i < ordered.length; i++) {
            if (cancelled.current) {
              return;
            }
            const ch = ordered[i];
            const cacheKey = `${formatPaginationKey}|${chapterContentHash(ch)}`;
            const cached = chapterPaginationCacheRef.current.get(ch.id);
            let pages: string[];

            setPaginationProgress({
              totalChapters: ordered.length,
              chaptersReady: i,
              workingChapterTitle: ch.title,
              chapterFormattingComplete: false,
            });

            if (cached?.key === cacheKey) {
              pages = cached.pages;
            } else {
              const tokens = buildTokensForChapter(ch, formatChapterHeader);
              pages = await runTokenPagination(tokens, measureDiv, {
                ...runOpts,
                onPagesUpdate: async (partial) => {
                  if (cancelled.current) {
                    return;
                  }
                  const prefix = ordered
                    .slice(0, i)
                    .flatMap((c) => pagesDone.get(c.id) ?? []);
                  setMeasuredPages([...prefix, ...partial]);
                },
                shouldCancel: () => cancelled.current,
              });
              chapterPaginationCacheRef.current.set(ch.id, { key: cacheKey, pages });
            }

            pagesDone.set(ch.id, pages);
            const merged = ordered.slice(0, i + 1).flatMap((c) => pagesDone.get(c.id) ?? []);
            setMeasuredPages(merged.length ? merged : ['']);
            setPaginationProgress({
              totalChapters: ordered.length,
              chaptersReady: i + 1,
              workingChapterTitle: ch.title,
              chapterFormattingComplete: i + 1 === ordered.length,
            });
            await yieldToMain();
          }
          if (!cancelled.current) {
            setIsPaginating(false);
          }
        } else {
          if (!contentTokens.length) {
            setMeasuredPages(['']);
            setIsPaginating(false);
            setPaginationProgress({
              totalChapters: 0,
              chaptersReady: 0,
              workingChapterTitle: '',
              chapterFormattingComplete: true,
            });
            return;
          }
          setPaginationProgress({
            totalChapters: 1,
            chaptersReady: 0,
            workingChapterTitle: 'Manuscript',
            chapterFormattingComplete: false,
          });
          const pages = await runTokenPagination(contentTokens, measureDiv, {
            ...runOpts,
            onPagesUpdate: async (partial) => {
              if (cancelled.current) {
                return;
              }
              setMeasuredPages(partial.length ? partial : ['']);
              await yieldToMain();
            },
            shouldCancel: () => cancelled.current,
          });
          if (!cancelled.current) {
            setMeasuredPages(pages);
            setPaginationProgress({
              totalChapters: 1,
              chaptersReady: 1,
              workingChapterTitle: '',
              chapterFormattingComplete: true,
            });
            setIsPaginating(false);
          }
        }
      } catch (error) {
        console.error('Pagination error:', error);
        if (!cancelled.current) {
          setMeasuredPages(['']);
          setIsPaginating(false);
        }
      }
    };

    void run();
    return () => {
      cancelled.current = true;
      setIsPaginating(false);
    };
  }, [
    previewMode,
    contentTokens,
    orderedChaptersForPagination,
    formatPaginationKey,
    chapterContentHash,
    state.book.formatting,
    state.book.template,
    state.book.pageSize?.trimSize,
    showHeader,
    showFooter,
    chaptersById,
    formatChapterHeader,
  ]);
  // Use measured pages for print mode, null for ebook
  const splitIntoPages = previewMode === 'print' ? measuredPages : null;

  // Total pages includes title page (if exists) + body pages
  const hasTitlePage = (state.book.title || state.book.author);
  const bodyPageCount = splitIntoPages ? splitIntoPages.length : 0;
  const totalPages = hasTitlePage ? 1 + bodyPageCount : bodyPageCount;
  const previewSpreads = React.useMemo(() => buildPreviewSpreads(totalPages), [totalPages]);
  const effectivePreviewLayout =
    previewMode === 'print' && previewLayout === 'spread' && !isNarrowScreen ? 'spread' : 'single';
  const trimSize = state.book.pageSize?.trimSize || { width: 6, height: 9 };

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
            const headerStyle = state.book.formatting.chapterHeading;
            const titleStyle = state.book.formatting.chapterTitle;
            const subtitleStyle = state.book.formatting.chapterSubtitle;
            const chapterHeader = formatChapterHeader(chapter);
            
            return (
              <Box key={chapter.id} sx={{ mb: 6, pageBreakBefore: chapter.startOnRightPage ? 'right' : 'auto' }}>
                {/* Chapter Header (number/prefix) */}
                {chapterHeader && (
                  <Box sx={{ width: `${headerStyle.widthPercent}%`, mx: 'auto' }}>
                    <Typography
                      component="h2"
                      sx={{
                        fontFamily: formatFontFamily(headerStyle.fontFamily),
                        fontSize: `${headerStyle.sizePt}pt`,
                        textAlign: headerStyle.align,
                        fontStyle: headerStyle.style.includes('italic') ? 'italic' : 'normal',
                        fontWeight: headerStyle.style.includes('bold') ? 700 : 400,
                        fontVariant: headerStyle.style === 'small-caps' ? 'small-caps' : 'normal',
                        mb: 2,
                      }}
                    >
                      {chapterHeader}
                    </Typography>
                  </Box>
                )}
                {/* Chapter Title */}
                {chapter.title?.trim() && (
                  <Box sx={{ width: `${titleStyle.widthPercent}%`, mx: 'auto' }}>
                    <Typography
                      component="h2"
                      sx={{
                        fontFamily: formatFontFamily(titleStyle.fontFamily),
                        fontSize: `${titleStyle.sizePt}pt`,
                        textAlign: titleStyle.align,
                        fontStyle: titleStyle.style.includes('italic') ? 'italic' : 'normal',
                        fontWeight: titleStyle.style.includes('bold') ? 700 : 400,
                        fontVariant: titleStyle.style === 'small-caps' ? 'small-caps' : 'normal',
                        mb: 3,
                      }}
                    >
                      {chapter.title}
                    </Typography>
                  </Box>
                )}
                {/* Chapter Subtitle */}
                {chapter.subtitle && (
                  <Box sx={{ width: `${subtitleStyle.widthPercent}%`, mx: 'auto' }}>
                    <Typography
                      variant="h6"
                      component="h3"
                      gutterBottom
                      sx={{
                        textAlign: subtitleStyle.align,
                        mb: 2,
                        fontFamily: formatFontFamily(subtitleStyle.fontFamily),
                        fontSize: `${subtitleStyle.sizePt}pt`,
                        fontStyle: subtitleStyle.style.includes('italic') ? 'italic' : 'normal',
                        fontWeight: subtitleStyle.style.includes('bold') ? 700 : 400,
                        fontVariant: subtitleStyle.style === 'small-caps' ? 'small-caps' : 'normal',
                        color: 'text.secondary',
                      }}
                    >
                      {chapter.subtitle}
                    </Typography>
                  </Box>
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

  const printPageContext = React.useMemo(
    (): PrintPreviewPageContext => ({
      title: state.book.title,
      author: state.book.author,
      template: state.book.template,
      templateFontFamily: state.book.formatting.fontFamily,
      formatting: state.book.formatting,
      chaptersById,
      formatChapterHeader,
      paragraphSpacingEm,
      showHeader,
      showFooter,
      headerHeightPx,
      footerHeightPx,
      trimSize,
    }),
    [
      state.book.title,
      state.book.author,
      state.book.template,
      state.book.formatting,
      chaptersById,
      formatChapterHeader,
      paragraphSpacingEm,
      showHeader,
      showFooter,
      headerHeightPx,
      footerHeightPx,
      trimSize,
    ]
  );

  const showPrintNavigation =
    previewMode === 'print' &&
    totalPages > 0 &&
    (effectivePreviewLayout === 'spread' ? previewSpreads.length > 1 : totalPages > 1);

  const handlePreviewLayoutChange = (_: React.MouseEvent<HTMLElement>, value: 'single' | 'spread' | null) => {
    if (!value || isNarrowScreen) return;
    if (value === 'spread') {
      setCurrentSpreadIndex(findSpreadIndexForPage(previewSpreads, currentPage));
    } else {
      setCurrentPage(primaryPageInSpread(previewSpreads[currentSpreadIndex]));
    }
    setPreviewLayout(value);
  };

  const handlePrintNavPrevious = () => {
    if (effectivePreviewLayout === 'spread') {
      setCurrentSpreadIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handlePrintNavNext = () => {
    if (effectivePreviewLayout === 'spread') {
      setCurrentSpreadIndex((prev) => Math.min(previewSpreads.length - 1, prev + 1));
      return;
    }
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const printNavigationLabel =
    effectivePreviewLayout === 'spread'
      ? formatSpreadLabel(
          previewSpreads[currentSpreadIndex] ?? [null, 1],
          currentSpreadIndex,
          previewSpreads.length,
          !!hasTitlePage
        )
      : hasTitlePage && currentPage === 1
        ? 'Title page'
        : `Page ${currentPage} of ${totalPages}`;

  const printNavPreviousDisabled =
    effectivePreviewLayout === 'spread' ? currentSpreadIndex === 0 : currentPage === 1;

  const printNavNextDisabled =
    effectivePreviewLayout === 'spread'
      ? currentSpreadIndex >= previewSpreads.length - 1
      : currentPage === totalPages;

  const renderSpreadSide = (pageNumber: number | null, sideClassName: string, key: string) => {
    if (pageNumber === null) {
      return (
        <PrintPreviewBlankPage
          key={key}
          ctx={printPageContext}
          sideClassName={sideClassName}
          wrapMarginBottom={0}
        />
      );
    }

    return renderPrintPageByNumber(
      pageNumber,
      splitIntoPages,
      !!hasTitlePage,
      paginationProgress.chapterFormattingComplete,
      printPageContext,
      sideClassName,
      0
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 6 }, px: { xs: 2, sm: 3 }, overflow: 'visible', height: 'auto', minHeight: 'auto' }}>
      <Box sx={{ textAlign: 'center', maxWidth: 720, mx: 'auto', mb: 3 }}>
        <Typography variant="overline" sx={{ letterSpacing: '0.16em', color: 'text.secondary', fontWeight: 600 }}>
          Step four · See the pages
        </Typography>
        <Typography
          variant={isMobile ? 'h4' : 'h3'}
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, color: 'text.primary', mt: 1 }}
        >
          Flip through your book before you export
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, mb: 0 }}>
          Compare eBook and print layouts on phone, tablet, or desktop. Adjust chapter titles and numbers here and
          watch the page reflow—no guesswork in Word.
        </Typography>
      </Box>

      {previewMode === 'print' &&
        (isPaginating || !paginationProgress.chapterFormattingComplete) && (
          <Alert severity="info" sx={{ mb: 2 }} variant="outlined">
            {paginationProgress.totalChapters <= 1
              ? 'Formatting manuscript… Laying out pages in the background. You can keep editing; pagination yields to the browser so the UI stays responsive.'
              : `Formatting manuscript… Imported ${paginationProgress.totalChapters} chapters. ${
                  paginationProgress.workingChapterTitle
                    ? `Working on: ${paginationProgress.workingChapterTitle}. `
                    : ''
                }${paginationProgress.chaptersReady} / ${paginationProgress.totalChapters} chapters ready for print preview.`}
          </Alert>
        )}

      {/* Preview Controls */}
      <Card sx={{ mb: 4, border: '1px solid rgba(44, 40, 37, 0.06)' }}>
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

            {previewMode === 'print' && (
              <>
                <Typography variant="h6" sx={{ ml: { xs: 0, md: 2 } }}>
                  Layout:
                </Typography>
                <ToggleButtonGroup
                  value={effectivePreviewLayout}
                  exclusive
                  onChange={handlePreviewLayoutChange}
                  size="small"
                  disabled={isNarrowScreen || totalPages <= 1}
                >
                  <ToggleButton value="single">Single page</ToggleButton>
                  <ToggleButton value="spread">Two-page spread</ToggleButton>
                </ToggleButtonGroup>
                {isNarrowScreen && (
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    Spread view on wider screens
                  </Typography>
                )}
              </>
            )}

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

        {/* Chapter Number Style */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Chapter Number
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            {/* Font */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Number Font</InputLabel>
              <Select
                label="Number Font"
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
                Chapter Number Example
              </Typography>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Chapter Title Style */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Chapter Title
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            {/* Font */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Title Font</InputLabel>
              <Select
                label="Title Font"
                value={state.book.formatting.chapterTitle.fontFamily}
                onChange={(e) => updateChapterTitle({ fontFamily: e.target.value as string })}
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
                value={state.book.formatting.chapterTitle.align}
                onChange={(e) => updateChapterTitle({ align: e.target.value as ChapterAlign })}
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
                value={state.book.formatting.chapterTitle.style}
                onChange={(e) => updateChapterTitle({ style: e.target.value as ChapterTextStyle })}
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
              value={state.book.formatting.chapterTitle.sizePt}
              onChange={(e) => updateChapterTitle({ sizePt: Number(e.target.value) })}
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
                value={state.book.formatting.chapterTitle.widthPercent}
                min={40}
                max={100}
                step={1}
                onChange={(_, val) => updateChapterTitle({ widthPercent: val as number })}
                sx={{ width: 140 }}
              />
              <Typography variant="body2" color="text.secondary">
                {state.book.formatting.chapterTitle.widthPercent}%
              </Typography>
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

            <Box sx={{ width: `${state.book.formatting.chapterTitle.widthPercent}%`, mx: 'auto' }}>
              <Typography
                sx={{
                  fontFamily: formatFontFamily(state.book.formatting.chapterTitle.fontFamily),
                  fontSize: `${state.book.formatting.chapterTitle.sizePt}pt`,
                  textAlign: state.book.formatting.chapterTitle.align,
                  fontStyle: state.book.formatting.chapterTitle.style.includes('italic') ? 'italic' : 'normal',
                  fontWeight: state.book.formatting.chapterTitle.style.includes('bold') ? 700 : 400,
                  fontVariant: state.book.formatting.chapterTitle.style === 'small-caps' ? 'small-caps' : 'normal',
                }}
              >
                Chapter Title Example
              </Typography>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Chapter Subtitle Style */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Chapter Subtitle
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            {/* Font */}
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Subtitle Font</InputLabel>
              <Select
                label="Subtitle Font"
                value={state.book.formatting.chapterSubtitle.fontFamily}
                onChange={(e) => updateChapterSubtitle({ fontFamily: e.target.value as string })}
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
                value={state.book.formatting.chapterSubtitle.align}
                onChange={(e) => updateChapterSubtitle({ align: e.target.value as ChapterAlign })}
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
                value={state.book.formatting.chapterSubtitle.style}
                onChange={(e) => updateChapterSubtitle({ style: e.target.value as ChapterTextStyle })}
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
              value={state.book.formatting.chapterSubtitle.sizePt}
              onChange={(e) => updateChapterSubtitle({ sizePt: Number(e.target.value) })}
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
                value={state.book.formatting.chapterSubtitle.widthPercent}
                min={40}
                max={100}
                step={1}
                onChange={(_, val) => updateChapterSubtitle({ widthPercent: val as number })}
                sx={{ width: 140 }}
              />
              <Typography variant="body2" color="text.secondary">
                {state.book.formatting.chapterSubtitle.widthPercent}%
              </Typography>
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

            <Box sx={{ width: `${state.book.formatting.chapterSubtitle.widthPercent}%`, mx: 'auto' }}>
              <Typography
                sx={{
                  fontFamily: formatFontFamily(state.book.formatting.chapterSubtitle.fontFamily),
                  fontSize: `${state.book.formatting.chapterSubtitle.sizePt}pt`,
                  textAlign: state.book.formatting.chapterSubtitle.align,
                  fontStyle: state.book.formatting.chapterSubtitle.style.includes('italic') ? 'italic' : 'normal',
                  fontWeight: state.book.formatting.chapterSubtitle.style.includes('bold') ? 700 : 400,
                  fontVariant: state.book.formatting.chapterSubtitle.style === 'small-caps' ? 'small-caps' : 'normal',
                }}
              >
                Chapter Subtitle Example
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
        {showPrintNavigation && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mb: 3,
              width: '100%',
              maxWidth:
                effectivePreviewLayout === 'spread'
                  ? `calc(${trimSize.width * 2}in + 14px)`
                  : `${trimSize.width}in`,
              justifyContent: 'space-between',
              px: { xs: 0, sm: 1 },
            }}
          >
            <IconButton
              onClick={handlePrintNavPrevious}
              disabled={printNavPreviousDisabled}
              size="large"
              aria-label={effectivePreviewLayout === 'spread' ? 'Previous spread' : 'Previous page'}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="body1" sx={{ minWidth: 120, textAlign: 'center' }}>
              {printNavigationLabel}
            </Typography>
            <IconButton
              onClick={handlePrintNavNext}
              disabled={printNavNextDisabled}
              size="large"
              aria-label={effectivePreviewLayout === 'spread' ? 'Next spread' : 'Next page'}
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
                {effectivePreviewLayout === 'spread' ? ' · open book spread' : ''}
              </Typography>
            )}
            {isPaginating ? (
              <Paper
                elevation={4}
                sx={{
                  width: `${trimSize.width}in`,
                  height: `${trimSize.height}in`,
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
            ) : effectivePreviewLayout === 'spread' && previewSpreads.length > 0 ? (
              <Box
                sx={{
                  width: '100%',
                  overflowX: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                  pb: 1,
                }}
              >
                <Box className="preview-spread">
                  {(() => {
                    const [leftPage, rightPage] = previewSpreads[currentSpreadIndex] ?? [null, 1];
                    return (
                      <>
                        {renderSpreadSide(leftPage, 'preview-page-left', `spread-left-${currentSpreadIndex}`)}
                        <Box className="preview-gutter" aria-hidden="true" />
                        {renderSpreadSide(rightPage, 'preview-page-right', `spread-right-${currentSpreadIndex}`)}
                      </>
                    );
                  })()}
                </Box>
              </Box>
            ) : (
              totalPages > 0 &&
              renderPrintPageByNumber(
                currentPage,
                splitIntoPages,
                !!hasTitlePage,
                paginationProgress.chapterFormattingComplete,
                printPageContext,
                'preview-page-right',
                4
              )
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
