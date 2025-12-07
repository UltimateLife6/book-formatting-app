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

  // Measure content and split into pages
  useEffect(() => {
    if (previewMode !== 'print') {
      setMeasuredPages([]);
      return;
    }

    const measureAndPaginate = async () => {
      // Wait for measureDiv to be available
      if (!measureDivRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!measureDivRef.current) return;
      }

      const contentText = state.book.content || '';
      
      if (!contentText.trim()) {
        const sampleText = `It was a dark and stormy night when Sarah first discovered the ancient book in her grandmother's attic. The leather binding was worn and cracked, but something about it called to her. As she carefully opened the first page, a warm golden light began to emanate from within.

The words seemed to dance across the page, shifting and changing as she read. It was unlike anything she had ever seen before. Each sentence told a story, and each story led to another, creating an intricate web of tales that spanned centuries.

Hours passed as Sarah became lost in the book's pages. She read about brave knights and wise wizards, about love that transcended time and magic that could change the world. When she finally looked up, the sun was beginning to rise, and she knew that her life would never be the same.`;
        setMeasuredPages([sampleText.split('\n\n').filter(p => p.trim())]);
        return;
      }

      const paragraphs = contentText.split('\n').filter(p => p.trim());
      const measureDiv = measureDivRef.current;

      const pages: string[][] = [];
      let currentPageContent: string[] = [];

      // Clear and setup measurement div to match visible page exactly
      measureDiv.innerHTML = '';
      measureDiv.style.width = '8.5in';
      measureDiv.style.height = '11in'; // Full page height
      measureDiv.style.padding = `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`;
      measureDiv.style.paddingBottom = `calc(${state.book.formatting.marginBottom}in + 1.5em)`; // Reserve space for page number
      measureDiv.style.fontFamily = state.book.formatting.fontFamily;
      measureDiv.style.fontSize = `${state.book.formatting.fontSize}pt`;
      measureDiv.style.lineHeight = `${state.book.formatting.lineHeight}`;
      measureDiv.style.boxSizing = 'border-box';
      measureDiv.style.overflow = 'hidden'; // Prevent scroll
      measureDiv.style.position = 'absolute';
      measureDiv.style.top = '0';
      measureDiv.style.left = '0';

      // Calculate max content height (page height - padding - page number space)
      // Wait for initial render to get accurate measurements
      await new Promise(resolve => requestAnimationFrame(resolve));
      const pageHeightPx = measureDiv.clientHeight; // 11in in pixels
      const paddingTopPx = parseFloat(getComputedStyle(measureDiv).paddingTop);
      const paddingBottomPx = parseFloat(getComputedStyle(measureDiv).paddingBottom);
      const maxContentHeight = pageHeightPx - paddingTopPx - paddingBottomPx;
      const buffer = 10; // 10px buffer to prevent premature breaks
      const threshold = maxContentHeight - buffer;

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

        // Add to measurement div
        measureDiv.appendChild(testP);

        // Wait for browser to render - critical for accurate measurement
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve)); // Double frame for accuracy

        // Measure content height (scrollHeight gives us the actual content height)
        const contentHeight = measureDiv.scrollHeight - paddingTopPx;

        // If adding this paragraph exceeds threshold, start new page
        if (contentHeight > threshold && currentPageContent.length > 0) {
          // Save current page and start new one
          pages.push([...currentPageContent]);
          currentPageContent = [];
          
          // Clear and reset for new page
          measureDiv.innerHTML = '';
          
          // Re-create the paragraph element for new page
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
          newTestP.style.textIndent = (state.book.formatting.paragraphIndent > 0 && currentPageContent.length > 0 && state.book.template !== 'poetry')
            ? `${state.book.formatting.paragraphIndent}em`
            : '0em';
          
          measureDiv.appendChild(newTestP);
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

      setMeasuredPages(pages);
    };

    measureAndPaginate();
  }, [previewMode, state.book.content, state.book.formatting.fontSize, state.book.formatting.lineHeight, state.book.formatting.fontFamily, state.book.formatting.marginTop, state.book.formatting.marginBottom, state.book.formatting.marginLeft, state.book.formatting.marginRight, state.book.formatting.paragraphIndent, state.book.template]);

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
    <Container maxWidth="xl" sx={{ py: 4 }}>
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
            {splitIntoPages && splitIntoPages.map((pageContent, pageIndex) => {
              const pageNumber = pageIndex + 1;
              if (pageNumber !== currentPage) return null;

              return (
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
                      minHeight: 0,
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
            })}
          </Box>
        ) : (
        <Paper
          elevation={3}
          sx={{
            ...getPreviewStyles(),
            overflow: 'auto',
            maxHeight: '80vh',
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
