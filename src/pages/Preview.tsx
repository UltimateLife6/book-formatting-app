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
  const [measuredPages, setMeasuredPages] = useState<string[][]>([]);

  // Prepare plain-text paragraphs for pagination (no chapter logic inside paginator)
  const paragraphsForPagination = React.useMemo(() => {
    const toParagraphs = (raw: string) =>
      raw
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean);

    // Prefer manuscript, then legacy chapters, else raw content
    if (state.book.manuscript && (
      state.book.manuscript.chapters.length > 0 ||
      state.book.manuscript.frontMatter.length > 0 ||
      state.book.manuscript.backMatter.length > 0
    )) {
      const chapters = getAllChaptersInOrder(state.book.manuscript);
      const collected: string[] = [];
      chapters.forEach((ch, idx) => {
        const title = ch.title?.trim();
        if (title) {
          if (collected.length > 0) collected.push(''); // spacer before new chapter
          collected.push(title);
          collected.push(''); // spacer after title
        } else if (collected.length > 0) {
          collected.push(''); // spacer even if no title to separate chapters
        }
        const body = ch.body || ch.content || '';
        collected.push(...toParagraphs(body));
      });
      return collected;
    }

    if (state.book.chapters.length > 0) {
      const collected: string[] = [];
      state.book.chapters.forEach((ch, idx) => {
        const title = ch.title?.trim();
        if (title) {
          if (collected.length > 0) collected.push('');
          collected.push(title);
          collected.push('');
        } else if (collected.length > 0) {
          collected.push('');
        }
        const body = ch.body || ch.content || '';
        collected.push(...toParagraphs(body));
      });
      return collected;
    }

    const raw = state.book.content || '';
    return toParagraphs(raw);
  }, [state.book.manuscript, state.book.chapters, state.book.content]);

  // Measure content and split into pages
  useEffect(() => {
    if (previewMode !== 'print') {
      setMeasuredPages([]);
      return;
    }

    if (!measureDivRef.current) return;

    const measureDiv = measureDivRef.current;
    measureDiv.innerHTML = '';

    const PX_PER_IN = 96;
    const trim = state.book.pageSize?.trimSize ?? { width: 6, height: 9 };
    const marginTop = (state.book.formatting.marginTop ?? 0) * PX_PER_IN;
    const marginBottom = (state.book.formatting.marginBottom ?? 0) * PX_PER_IN;

    const pageHeightPx = Math.max(
      0,
      trim.height * PX_PER_IN - marginTop - marginBottom - 24 // footer reserve
    );

    // Keep the measurement root consistent with the visible page box
    measureDiv.style.position = 'absolute';
    measureDiv.style.visibility = 'hidden';
    measureDiv.style.width = `${trim.width}in`;
    measureDiv.style.height = 'auto';
    measureDiv.style.padding = '0';
    measureDiv.style.margin = '0';
    measureDiv.style.boxSizing = 'border-box';
    measureDiv.style.overflow = 'visible';

    // 🔑 MEASUREMENT CONTAINER (NO HEIGHT LIMIT)
    const content = document.createElement('div');
    content.style.width = `${trim.width}in`;
    content.style.padding = `
      ${state.book.formatting.marginTop}in
      ${state.book.formatting.marginRight}in
      ${state.book.formatting.marginBottom}in
      ${state.book.formatting.marginLeft}in
    `;
    content.style.fontFamily = state.book.formatting.fontFamily;
    content.style.fontSize = `${state.book.formatting.fontSize}pt`;
    content.style.lineHeight = `${state.book.formatting.lineHeight}`;
    content.style.boxSizing = 'border-box';
    content.style.position = 'absolute';
    content.style.visibility = 'hidden';
    content.style.overflow = 'visible';

    measureDiv.appendChild(content);

    const paragraphs = paragraphsForPagination;

    const pages: string[][] = [];
    let currentPage: string[] = [];

    const makeParagraph = (text: string) => {
      const p = document.createElement('p');
      p.textContent = text;
      p.style.margin = `0 0 ${Math.max(0, state.book.formatting.lineHeight - 1)}em 0`;
      p.style.whiteSpace = 'normal';
      return p;
    };

    for (const para of paragraphs) {
      const node = makeParagraph(para);
      content.appendChild(node);

      if (content.scrollHeight > pageHeightPx) {
        // rollback
        content.removeChild(node);
        pages.push([...currentPage]);

        // start new page
        content.innerHTML = '';
        currentPage = [];

        content.appendChild(makeParagraph(para));
        currentPage.push(para);
      } else {
        currentPage.push(para);
      }
    }

    if (currentPage.length) pages.push(currentPage);
    if (pages.length === 0) pages.push([]);

    measureDiv.innerHTML = '';
    setMeasuredPages(pages);
  }, [
    previewMode,
    paragraphsForPagination,
    state.book.formatting,
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
          width: state.book.pageSize?.trimSize ? `${state.book.pageSize.trimSize.width}in` : '6in',
          height: state.book.pageSize?.trimSize ? `${state.book.pageSize.trimSize.height}in` : '9in',
          padding: 0, // No padding on outer div - matches Paper
          margin: 0,
          border: 'none',
          overflow: 'hidden',
          boxSizing: 'border-box',
          display: 'block', // Use block to avoid flex height quirks
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
            {splitIntoPages && splitIntoPages.length > 0 ? (
              splitIntoPages.map((pageText, pageIndex) => {
                const pageNumber = pageIndex + 1;
                if (pageNumber !== currentPage) return null;

                // Fixed page size (no scaling) to fit exactly in its container
                const trimSize = state.book.pageSize?.trimSize || { width: 6, height: 9 };
                const marginTop = state.book.formatting.marginTop ?? 0;
                const marginBottom = state.book.formatting.marginBottom ?? 0;
                const contentHeightIn = Math.max(trimSize.height - marginTop - marginBottom - (24 / 96), 0);

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
                    height: `${trimSize.height}in`, // Fixed height like Google Docs
                    minHeight: `${trimSize.height}in`,
                    maxHeight: `${trimSize.height}in`,
                    position: 'relative',
                    pageBreakAfter: 'always',
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                    overflow: 'hidden', // Page is the sole clipping boundary
                    display: 'flex',
                    flexDirection: 'column',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    boxSizing: 'border-box',
                    backgroundColor: '#fff',
                    color: '#333',
                    padding: 0,
                    margin: 0,
                  }}
                >
                  {/* Content area - clipped only by page shell */}
                  <Box sx={{ 
                    padding: `${state.book.formatting.marginTop}in ${state.book.formatting.marginRight}in ${state.book.formatting.marginBottom}in ${state.book.formatting.marginLeft}in`,
                    paddingBottom: `${state.book.formatting.marginBottom}in`,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    display: 'block',
                    width: '100%',
                    maxWidth: '100%',
                    height: `${contentHeightIn}in`,
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
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
                      width: '100%',
                      maxWidth: '100%',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    hyphens: 'auto',
                    boxSizing: 'border-box',
                    overflow: 'visible',
                    display: 'block',
                  }}>
                      {pageText && pageText.length > 0 ? (
                        pageText.map((paragraph, paraIndex) => {
                          const templateStyles = getTemplateStyles();
                          const isFirstParagraph = paraIndex === 0;
                          const shouldIndent = state.book.formatting.paragraphIndent > 0 && 
                                              !isFirstParagraph && 
                                              state.book.template !== 'poetry';
                          
                          return (
                            <Typography 
                              key={paraIndex} 
                              component="p"
                              className="page-paragraph"
                              sx={{ 
                                ...templateStyles,
                                margin: 0,
                                marginBottom: `${paragraphSpacingEm}em`,
                                lineHeight: state.book.formatting.lineHeight,
                                textAlign: state.book.template === 'poetry' ? 'center' : 'left',
                                textIndent: shouldIndent ? `${state.book.formatting.paragraphIndent}em` : '0em',
                                wordWrap: 'break-word',
                                overflowWrap: 'break-word',
                                wordBreak: 'normal',
                                hyphens: 'auto',
                                width: '100%',
                                maxWidth: '100%',
                                whiteSpace: 'normal',
                                display: 'block',
                                boxSizing: 'border-box',
                                minWidth: 0,
                              }}
                            >
                              {paragraph}
                            </Typography>
                          );
                        })
                      ) : (
                        <Typography 
                          component="p"
                          sx={{ 
                            ...getTemplateStyles(),
                            margin: 0,
                            lineHeight: state.book.formatting.lineHeight,
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
