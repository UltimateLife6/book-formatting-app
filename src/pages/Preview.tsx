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
  Chip,
  IconButton,
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

// Fallback pagination function (word-based estimation)
const fallbackPagination = (contentText: string, formatting: BookData['formatting']): string[][] => {
  const paragraphs = contentText.split('\n').filter(p => p.trim());
  if (paragraphs.length === 0) return [[]];
  
  // Simple word-based pagination as fallback
  const fontSize = formatting.fontSize;
  const lineHeight = formatting.lineHeight;
  const wordsPerPage = Math.floor((250 * 12) / fontSize * (1.5 / lineHeight));
  
  const pages: string[][] = [];
  let currentPageContent: string[] = [];
  let currentPageWords = 0;

  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    if (currentPageWords + wordCount > wordsPerPage && currentPageContent.length > 0) {
      pages.push([...currentPageContent]);
      currentPageContent = [paragraph];
      currentPageWords = wordCount;
    } else {
      currentPageContent.push(paragraph);
      currentPageWords += wordCount;
    }
  });

  if (currentPageContent.length > 0) {
    pages.push(currentPageContent);
  }

  return pages.length > 0 ? pages : [[]];
};

const Preview: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useBook();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [previewMode, setPreviewMode] = useState<'ebook' | 'print'>('ebook');
  const [deviceSize, setDeviceSize] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [currentPage, setCurrentPage] = useState(1);
  const measureDivRef = useRef<HTMLDivElement>(null);

  // Reset to page 1 when switching modes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [previewMode]);

  // Measurement-based pagination using hidden div
  const [measuredPages, setMeasuredPages] = useState<string[][]>([]);
  
  // Track pagination run ID to invalidate stale async operations
  const paginationRunIdRef = useRef(0);

  // Measure content and split into pages
  useEffect(() => {
    if (previewMode !== 'print') {
      setMeasuredPages([]);
      return;
    }

    // Increment run ID to invalidate any stale async operations
    paginationRunIdRef.current += 1;
    const runId = paginationRunIdRef.current;
    let timeoutId: NodeJS.Timeout | null = null;

    const measureAndPaginate = async () => {
      try {
        // Check if this run is still valid - guard at start
        if (runId !== paginationRunIdRef.current) {
          return; // Stale run, ignore
        }

        // Use manuscript structure if available, otherwise fall back to legacy chapters/content
        let contentText = '';
        let chapters: Chapter[] = [];
        
        if (state.book.manuscript && 
            (state.book.manuscript.chapters.length > 0 || 
             state.book.manuscript.frontMatter.length > 0 || 
             state.book.manuscript.backMatter.length > 0)) {
          chapters = getAllChaptersInOrder(state.book.manuscript);
          contentText = chapters.map(ch => ch.body || ch.content || '').join('\n\n');
        } else if (state.book.chapters.length > 0) {
          chapters = state.book.chapters;
          contentText = chapters.map(ch => ch.body || ch.content || '').join('\n\n');
        } else {
          contentText = state.book.content || '';
        }
        
        if (!contentText.trim()) {
          const sampleText = `It was a dark and stormy night when Sarah first discovered the ancient book in her grandmother's attic. The leather binding was worn and cracked, but something about it called to her. As she carefully opened the first page, a warm golden light began to emanate from within.

The words seemed to dance across the page, shifting and changing as she read. It was unlike anything she had ever seen before. Each sentence told a story, and each story led to another, creating an intricate web of tales that spanned centuries.

Hours passed as Sarah became lost in the book's pages. She read about brave knights and wise wizards, about love that transcended time and magic that could change the world. When she finally looked up, the sun was beginning to rise, and she knew that her life would never be the same.`;
          // Guard state update with run ID check
          if (runId !== paginationRunIdRef.current) return;
          if (timeoutId) clearTimeout(timeoutId);
          setMeasuredPages([sampleText.split('\n\n').filter(p => p.trim())]);
          return;
        }

        // Set timeout to fall back to word-based pagination if measurement takes too long
        // Guarded with run ID to prevent stale runs from overwriting state
        timeoutId = setTimeout(() => {
          // Guard: only execute if this is still the current run
          if (runId !== paginationRunIdRef.current) return;
          console.warn('Pagination measurement taking too long, using fallback');
          setMeasuredPages(fallbackPagination(contentText, state.book.formatting));
        }, 5000); // Increased timeout to 5 seconds

        // Wait for measureDiv to be available
        if (!measureDivRef.current) {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (!measureDivRef.current) {
            // Guard state update with run ID check
            if (runId !== paginationRunIdRef.current) return;
            if (timeoutId) clearTimeout(timeoutId);
            // Fallback to word-based pagination if measurement div not available
            setMeasuredPages(fallbackPagination(contentText, state.book.formatting));
            return;
          }
        }
        
        // Check again if run is still valid
        if (runId !== paginationRunIdRef.current) {
          if (timeoutId) clearTimeout(timeoutId);
          return; // Stale run, ignore
        }

      const paragraphs = contentText.split('\n').filter(p => p.trim());
      const measureDiv = measureDivRef.current;

      const pages: string[][] = [];
      let currentPageContent: string[] = [];

      // Clear and setup measurement div - MUST be block-based, NOT flex
      measureDiv.innerHTML = '';
      measureDiv.style.width = '8.5in';
      measureDiv.style.height = '11in'; // Full page height
      measureDiv.style.padding = '0';
      measureDiv.style.margin = '0';
      measureDiv.style.border = 'none';
      measureDiv.style.boxSizing = 'border-box';
      measureDiv.style.overflow = 'visible'; // Changed from 'hidden'
      measureDiv.style.position = 'absolute';
      measureDiv.style.top = '0';
      measureDiv.style.left = '0';
      measureDiv.style.display = 'block'; // Changed from 'flex' - MUST be block
      measureDiv.style.visibility = 'hidden';
      
      // Create inner content div - MUST be block-based, NOT flex
      const contentDiv = document.createElement('div');
      contentDiv.style.display = 'block'; // Changed from 'flex' - MUST be block
      contentDiv.style.height = 'auto'; // Auto height
      contentDiv.style.overflow = 'visible'; // Visible overflow
      contentDiv.style.padding = `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`;
      contentDiv.style.paddingBottom = `calc(${state.book.formatting.marginBottom}in + 1.5em)`; // Reserve space for page number
      contentDiv.style.width = '100%';
      contentDiv.style.maxWidth = '100%';
      contentDiv.style.boxSizing = 'border-box';
      contentDiv.style.wordWrap = 'break-word';
      contentDiv.style.overflowWrap = 'break-word';
      contentDiv.style.fontFamily = state.book.formatting.fontFamily;
      contentDiv.style.fontSize = `${state.book.formatting.fontSize}pt`;
      contentDiv.style.lineHeight = `${state.book.formatting.lineHeight}`;
      measureDiv.appendChild(contentDiv);

      // Wait for initial render to get accurate measurements
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => requestAnimationFrame(resolve)); // Double frame for stability
      
      // Verify contentDiv exists
      if (!contentDiv || !measureDiv.contains(contentDiv)) {
        // Guard state update with run ID check
        if (runId !== paginationRunIdRef.current) return;
        if (timeoutId) clearTimeout(timeoutId);
        setMeasuredPages(fallbackPagination(contentText, state.book.formatting));
        return;
      }
      
      // Check again if run is still valid
      if (runId !== paginationRunIdRef.current) {
        if (timeoutId) clearTimeout(timeoutId);
        return; // Stale run, ignore
      }
      
      // Calculate page height using getBoundingClientRect for accurate pixel value
      // DO NOT use clientHeight from flex containers - use fixed pixel calculation
      const measureDivRect = measureDiv.getBoundingClientRect();
      let PAGE_HEIGHT_PX = measureDivRect.height;
      
      // If measurement div height is 0 or invalid, use fixed 11in = 1056px at 96 DPI
      if (!PAGE_HEIGHT_PX || PAGE_HEIGHT_PX < 100) {
        PAGE_HEIGHT_PX = 11 * 96; // 11 inches at 96 DPI = 1056px
      }
      
      // Calculate footer space (page number area)
      const FOOTER_SPACE_PX = parseFloat(getComputedStyle(contentDiv).paddingBottom) || 0;
      
      // Threshold = page height - footer space - larger buffer
      // scrollHeight includes padding, so we compare directly to available height
      const buffer = 100; // Larger buffer to allow more content per page
      const threshold = PAGE_HEIGHT_PX - FOOTER_SPACE_PX - buffer;

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

        // Wait for browser to render - ensure accurate measurement
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve)); // Double frame for accuracy

        // Measure content height - scrollHeight includes padding and content
        // scrollHeight gives us the total height needed (content + padding)
        // We compare scrollHeight to pageHeightPx (11in) to see if it fits
        const contentHeight = contentDiv.scrollHeight;

        // Check if run is still valid before continuing
        if (runId !== paginationRunIdRef.current) {
          if (timeoutId) clearTimeout(timeoutId);
          return; // Stale run, ignore
        }

        // Pagination rule: if content exceeds threshold AND page is not empty, start new page
        // Never break on first paragraph unless it's extremely long
        if (contentHeight > threshold && currentPageContent.length > 0) {
          // Rollback: Remove the paragraph that caused overflow
          contentDiv.removeChild(testP);
          
          // Save current page (without the overflowing paragraph)
          pages.push([...currentPageContent]);
          currentPageContent = [];
          
          // Re-add paragraph to new page
          const newTestP = document.createElement('p');
          newTestP.textContent = paragraph;
          newTestP.style.marginBottom = '16px';
          newTestP.style.marginTop = '0px';
          newTestP.style.wordWrap = 'break-word';
          newTestP.style.overflowWrap = 'break-word';
          newTestP.style.whiteSpace = 'normal';
          newTestP.style.fontFamily = state.book.formatting.fontFamily;
          newTestP.style.fontSize = `${state.book.formatting.fontSize}pt`;
          newTestP.style.lineHeight = `${state.book.formatting.lineHeight}`;
          newTestP.style.width = '100%';
          newTestP.style.maxWidth = '100%';
          newTestP.style.boxSizing = 'border-box';
          newTestP.style.textAlign = state.book.template === 'poetry' ? 'center' : 'left';
          newTestP.style.display = 'block';
          newTestP.style.textIndent = '0em'; // First paragraph on new page has no indent
          
          contentDiv.innerHTML = ''; // Clear for new page
          contentDiv.appendChild(newTestP);
          await new Promise(resolve => requestAnimationFrame(resolve));
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

      // Guard success path: only update if this is still the current run
      if (runId !== paginationRunIdRef.current) {
        if (timeoutId) clearTimeout(timeoutId);
        return; // Stale run, ignore
      }

      // Cancel timeout and set pages
      if (timeoutId) clearTimeout(timeoutId);
      setMeasuredPages(pages);
      } catch (error) {
        console.error('Error during pagination measurement:', error);
        // Guard error path: only update if this is still the current run
        if (runId !== paginationRunIdRef.current) {
          if (timeoutId) clearTimeout(timeoutId);
          return; // Stale run, ignore
        }
        if (timeoutId) clearTimeout(timeoutId);
        const contentText = state.book.content || '';
        setMeasuredPages(fallbackPagination(contentText, state.book.formatting));
      }
    };

    measureAndPaginate();
    
    // Cleanup function: invalidate all previous runs instantly
    return () => {
      // Increment run ID to invalidate ALL in-flight async operations from this effect run
      // This ensures any async operations (timeouts, promises) are ignored
      paginationRunIdRef.current += 1;
    };
  }, [previewMode, state.book.content, state.book.chapters, state.book.formatting, state.book.template, state.book.manuscript]);

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

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip label={`Template: ${state.book.template}`} color="primary" variant="outlined" />
            <Chip label={`Font: ${state.book.formatting.fontFamily}`} color="secondary" variant="outlined" />
            <Chip label={`Size: ${state.book.formatting.fontSize}pt`} color="success" variant="outlined" />
            <Chip label={`Line Height: ${state.book.formatting.lineHeight}`} color="info" variant="outlined" />
          </Box>
        </CardContent>
      </Card>

      {/* Hidden measurement div - must match visible page exactly */}
      {/* Structure: measureDiv (Paper) > contentDiv (Box with flex: 1 1 auto) */}
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
          padding: 0, // No padding on outer div - matches Paper
          margin: 0,
          border: 'none',
          overflow: 'hidden',
          boxSizing: 'border-box',
          display: 'flex', // Flex container like Paper
          flexDirection: 'column', // Column layout like Paper
          // Font styles will be set on inner contentDiv in pagination logic
        }}
      />

      {/* Preview Area */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
        {previewMode === 'print' && totalPages > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, width: '100%', maxWidth: '8.5in', justifyContent: 'space-between' }}>
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
            {splitIntoPages && splitIntoPages.length > 0 ? (
              splitIntoPages.map((pageContent, pageIndex) => {
                const pageNumber = pageIndex + 1;
                if (pageNumber !== currentPage) return null;

              return (
                <Paper
                  key={pageIndex}
                  elevation={4}
                  className="page"
                  sx={{
                    width: '8.5in',
                    height: 'auto',
                    minHeight: '11in',
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
                    height: 'auto',
                    minHeight: 'auto',
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    overflow: 'visible',
                    overflowX: 'visible',
                    overflowY: 'visible',
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
                    <Box sx={{ 
                      flex: '1 1 auto', 
                      overflow: 'visible',
                      overflowX: 'visible',
                      overflowY: 'visible',
                      height: 'auto',
                      minHeight: 'auto',
                      width: '100%',
                      maxWidth: '100%',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      hyphens: 'auto',
                      boxSizing: 'border-box',
                    }}>
                      {pageContent.length > 0 ? (
                        pageContent.map((paragraph, paraIndex) => {
                          if (paragraph.trim() === '') {
                            return <Box key={paraIndex} sx={{ height: '1em' }} />;
                          }
                          const templateStyles = getTemplateStyles();
                          const prevPara = pageContent[paraIndex - 1];
                          const isFirstParagraph = !prevPara || prevPara.trim() === '';
                          const shouldIndent = state.book.formatting.paragraphIndent > 0 && 
                                              !isFirstParagraph && 
                                              state.book.template !== 'poetry';
                          
                          return (
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
                          );
                        })
                      ) : (
                        <Typography 
                          paragraph 
                          sx={{ 
                            ...getTemplateStyles(),
                            textAlign: 'center',
                            color: 'text.secondary',
                            fontStyle: 'italic',
                          }}
                        >
                          (Empty page)
                        </Typography>
                      )}
                    </Box>
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
              );
            })
            ) : (
              // Fallback: Show at least one empty page if pagination hasn't completed yet
              <Paper
                elevation={4}
                className="page"
                sx={{
                  width: '8.5in',
                  height: 'auto',
                  minHeight: '11in',
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
