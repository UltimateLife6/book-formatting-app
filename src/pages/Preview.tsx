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
import { useBook } from '../context/BookContext';
import { BookData, Chapter } from '../context/BookContext';

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

  // Reset to page 1 when switching modes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [previewMode]);

  // Measurement-based pagination using hidden div
  // Pages are stored as strings (paragraphs separated by '\n\n')
  const [measuredPages, setMeasuredPages] = useState<string[]>([]);
  const [isPaginating, setIsPaginating] = useState(false);
  
  // Prepare content as token stream for token-based flow pagination
  // Tokens are words + paragraph break markers ("\n\n")
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
        const title = ch.title?.trim();
        if (title) {
          parts.push(title);
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
        const title = ch.title?.trim();
        if (title) {
          parts.push(title);
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
    
    // Parse into paragraphs using single newline
    const paragraphs = toParagraphs(fullText);
    
    if (paragraphs.length === 0) {
      return [];
    }
    
    // Convert paragraphs to tokens: words + paragraph break markers
    const tokens: string[] = [];
    
    paragraphs.forEach((para) => {
      // Preserve empty paragraphs - don't filter
      if (para.length > 0) {
        // Split paragraph into words (split on whitespace)
        const words = para.split(/\s+/).filter(w => w.length > 0);
        tokens.push(...words);
      }
      // Add paragraph break marker after each paragraph (including empty ones)
      // This preserves blank lines and creates proper paragraph spacing
      tokens.push('\n\n');
    });
    
    return tokens;
  }, [state.book.manuscript, state.book.chapters, state.book.content]);

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

    // Fixed numeric content height (single source of truth) - used ONLY for comparison
    const PX_PER_IN = 96;
    const FOOTER_PX = 24;
    const trim = state.book.pageSize?.trimSize ?? { width: 6, height: 9 };
    const PAGE_HEIGHT_PX = trim.height * PX_PER_IN;
        const marginTopPx = (state.book.formatting.marginTop ?? 0) * PX_PER_IN;
        const marginBottomPx = (state.book.formatting.marginBottom ?? 0) * PX_PER_IN;
    
    const CONTENT_HEIGHT_PX = Math.max(
      0,
      PAGE_HEIGHT_PX - marginTopPx - marginBottomPx - FOOTER_PX
    );

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
    const content = document.createElement('div');
    content.style.width = `${trim.width}in`;
    content.style.padding = `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`;
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
    const createParagraphElement = (): HTMLParagraphElement => {
          const p = document.createElement('p');
      p.style.margin = '0';
      p.style.marginBottom = `${Math.max(0, state.book.formatting.lineHeight - 1)}em`;
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

    // Token-based pagination algorithm with batching and binary search
    const paginate = async () => {
      try {
        const CHUNK_SIZE = 40; // words per batch
        const pages: string[] = [];
        let currentPageParagraphs: string[] = [];
        let currentParagraphTokens: string[] = [];
        
        // Helper to get current page text
        const getCurrentPageText = () => currentPageParagraphs.join('\n\n');
        
        // Helper to rebuild DOM from current state
        const rebuildDOM = (paragraphTokens: string[] = currentParagraphTokens) => {
          content.innerHTML = '';
          currentPageParagraphs.forEach(paraText => {
            const p = createParagraphElement();
            p.textContent = paraText.trim() || ' ';
            content.appendChild(p);
          });
          if (paragraphTokens.length > 0) {
            const p = createParagraphElement();
            p.textContent = paragraphTokens.join(' ').trim() || ' ';
            content.appendChild(p);
          }
          // Single rAF is sufficient for layout - no need for double
          return new Promise(resolve => requestAnimationFrame(resolve));
        };

        // Binary search for exact cutoff point
        const findCutoff = async (tokens: string[]): Promise<number> => {
          let low = 0;
          let high = tokens.length;
          
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            const testTokens = tokens.slice(0, mid);
            await rebuildDOM(testTokens);
            
            // Wait for layout to settle
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            const scrollHeight = content.scrollHeight;
            
            if (scrollHeight <= CONTENT_HEIGHT_PX) {
              low = mid;
            } else {
              high = mid - 1;
            }
          }
          
          return low;
        };

        let tokenIndex = 0;
        
        while (tokenIndex < tokens.length) {
          const token = tokens[tokenIndex];
          
          if (token === '\n\n') {
            // Commit current paragraph
            if (currentParagraphTokens.length > 0) {
              currentPageParagraphs.push(currentParagraphTokens.join(' ').trim());
              currentParagraphTokens = [];
            }
            
            await rebuildDOM();
            
            // Check if page is full
            if (content.scrollHeight > CONTENT_HEIGHT_PX && currentPageParagraphs.length > 0) {
              // Rollback last paragraph if we just added it
              if (currentPageParagraphs.length > 1) {
                currentPageParagraphs.pop();
              }
              
              // Commit current page
              pages.push(getCurrentPageText());
              
              // Start new page with the paragraph break
              currentPageParagraphs = [''];
              await rebuildDOM();
            }
            
            tokenIndex++;
          } else {
            // Batch regular word tokens
            let batchEnd = tokenIndex;
            const batchTokens: string[] = [];
            
            // Collect a batch of tokens
            while (batchEnd < tokens.length && tokens[batchEnd] !== '\n\n' && batchTokens.length < CHUNK_SIZE) {
              batchTokens.push(tokens[batchEnd]);
              batchEnd++;
            }
            
            // Try adding the batch
            currentParagraphTokens.push(...batchTokens);
            await rebuildDOM();
            
            // Check if page is full
            if (content.scrollHeight > CONTENT_HEIGHT_PX && 
                (currentPageParagraphs.length > 0 || currentParagraphTokens.length > CHUNK_SIZE)) {
              
              // Use binary search to find exact cutoff
              const cutoff = await findCutoff(currentParagraphTokens);
              
              if (cutoff > 0) {
                // Commit tokens that fit
                const fittingTokens = currentParagraphTokens.slice(0, cutoff);
                currentPageParagraphs.push(fittingTokens.join(' ').trim());
                
                // Remaining tokens go to next page
                currentParagraphTokens = currentParagraphTokens.slice(cutoff);
              } else {
                // Nothing fits on current page
                currentParagraphTokens = [];
              }
              
              // Commit current page if it has content
              if (currentPageParagraphs.length > 0) {
                pages.push(getCurrentPageText());
                currentPageParagraphs = [];
              }
              
              // Start new page with remaining tokens
              if (currentParagraphTokens.length > 0) {
                await rebuildDOM();
              }
            }
            
            tokenIndex = batchEnd;
          }
        }
        
        // Commit final paragraph and page
        if (currentParagraphTokens.length > 0) {
          currentPageParagraphs.push(currentParagraphTokens.join(' ').trim());
        }
        if (currentPageParagraphs.length > 0 || pages.length === 0) {
          pages.push(getCurrentPageText());
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

    // Debounce pagination to prevent reflow storms when dragging sliders
    setIsPaginating(true);
    const timeoutId = setTimeout(() => {
      paginate();
    }, 120);
    
    return () => {
      clearTimeout(timeoutId);
      // If we cancel, we need to check if we should reset the flag
      // Only reset if we're still waiting (pagination hasn't completed)
      // The paginate function will set it to false when done
    };
  }, [
    previewMode,
    contentTokens,
    state.book.formatting,
    state.book.template,
    state.book.pageSize?.trimSize
  ]);
  // Use measured pages for print mode, null for ebook
  const splitIntoPages = previewMode === 'print' ? measuredPages : null;

  const totalPages = splitIntoPages ? splitIntoPages.length : 1;

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
            // Determine chapter title display
            const chapterTitle = chapter.isNumbered && chapter.chapterNumber
              ? `${chapter.chapterNumber}. ${chapter.title}`
              : chapter.title;
            
            return (
              <Box key={chapter.id} sx={{ mb: 6, pageBreakBefore: chapter.startOnRightPage ? 'right' : 'auto' }}>
                <Typography
                  variant="h4"
                  component="h2"
                  gutterBottom
                  sx={{
                    textAlign: 'center',
                    mb: 3,
                    fontFamily: templateStyles.fontFamily,
                    fontWeight: 600,
                  }}
                >
                  {chapterTitle}
                </Typography>
                {chapter.subtitle && (
                  <Typography
                    variant="h6"
                    component="h3"
                    gutterBottom
                    sx={{
                      textAlign: 'center',
                      mb: 2,
                      fontFamily: templateStyles.fontFamily,
                      fontStyle: 'italic',
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
              Page {currentPage} of {totalPages}
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
            ) : splitIntoPages && splitIntoPages.length > 0 ? (
              splitIntoPages.map((pageText, pageIndex) => {
                const pageNumber = pageIndex + 1;
                if (pageNumber !== currentPage) return null;

                // Fixed page size (no scaling) to fit exactly in its container
                const trimSize = state.book.pageSize?.trimSize || { width: 6, height: 9 };

              return (
                <Box
                  key={pageIndex}
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
                    height: `${trimSize.height}in`, // Fixed height - Paper is the only clipping boundary
                    minHeight: `${trimSize.height}in`,
                    maxHeight: `${trimSize.height}in`,
                    position: 'relative',
                    pageBreakAfter: 'always',
                    overflow: 'hidden', // Page is the sole clipping boundary
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    boxSizing: 'border-box',
                    backgroundColor: '#fff',
                    color: '#333',
                    padding: 0,
                    margin: 0,
                  }}
                >
                  {/* Content wrapper - NO height, NO overflow, NO maxHeight - pure flow */}
                  <Box sx={{ 
                    padding: `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`,
                    boxSizing: 'border-box',
                    display: 'block',
                    width: '100%',
                  }}>
                    {pageIndex === 0 && (state.book.title || !state.book.content) && (
                      <Typography 
                        variant="h3" 
                        component="h1" 
                        gutterBottom 
                        sx={{ 
                          textAlign: 'center', 
                          mb: 4,
                          fontFamily: getTemplateStyles().fontFamily,
                        }}
                      >
                        {state.book.title || 'Your Book Title'}
                      </Typography>
                    )}
                    {pageIndex === 0 && (state.book.author || !state.book.content) && (
                      <Typography 
                        variant="h5" 
                        component="h2" 
                        gutterBottom 
                        sx={{ 
                          textAlign: 'center', 
                          mb: 4, 
                          color: 'text.secondary',
                          fontFamily: getTemplateStyles().fontFamily,
                        }}
                      >
                        by {state.book.author || 'Author Name'}
                      </Typography>
                    )}
                    {/* Render paragraphs using raw <p> elements - EXACT match to measurement DOM */}
                    {(() => {
                      // Parse page text: paragraphs separated by '\n\n'
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
                          const shouldIndent = state.book.formatting.paragraphIndent > 0 && 
                                              !isFirstParagraph && 
                                              state.book.template !== 'poetry';
                        const trimmedText = paraText.trim();
                          
                          return (
                          <p
                              key={paraIndex} 
                            style={{
                                margin: 0,
                                marginBottom: `${paragraphSpacingEm}em`,
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
                  {/* Page number footer - absolutely positioned at bottom, outside content flow */}
                  <Box sx={{ 
                    position: 'absolute', 
                    bottom: `${state.book.formatting.marginBottom}in`,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    pointerEvents: 'none', // Don't interfere with content
                    zIndex: 1,
                  }}>
                    <Typography 
                      variant="body2" 
                      color="text.secondary"
                      sx={{
                        display: 'inline-block',
                      }}
                    >
                      {pageNumber}
                    </Typography>
                  </Box>
                </Paper>
                </Box>
              );
            })
            ) : (
              // Fallback: Show at least one empty page if pagination hasn't completed yet
              (() => {
                const trimSize = state.book.pageSize?.trimSize || { width: 6, height: 9 };
                const maxPageWidth = isMobile ? '95vw' : 'min(90vw, 800px)';
                
                return (
                  <Box
                    sx={{
                      width: '100%',
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
                      maxWidth: maxPageWidth,
                      height: 'auto',
                      minHeight: `${trimSize.height}in`,
                      aspectRatio: `${trimSize.width} / ${trimSize.height}`,
                  position: 'relative',
                  overflow: 'visible',
                  display: 'flex',
                  flexDirection: 'column',
                  boxSizing: 'border-box',
                  backgroundColor: '#fff',
                  color: '#333',
                  padding: 0,
                  margin: '0 auto',
                }}
              >
                <Box sx={{ 
                  flex: '1 1 auto',
                  display: 'flex', 
                  flexDirection: 'column',
                  padding: `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`,
                  paddingBottom: `calc(${state.book.formatting.marginBottom}in + 1.5em)`,
                }}>
                  <Typography 
                    paragraph 
                    sx={{ 
                      ...getTemplateStyles(),
                      textAlign: 'center',
                      color: 'text.secondary',
                      fontStyle: 'italic',
                    }}
                  >
                    Loading pages...
                  </Typography>
                </Box>
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
                    1
                  </Typography>
                </Box>
              </Paper>
                  </Box>
                );
              })()
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
