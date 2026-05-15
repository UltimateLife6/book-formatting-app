import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  AutoAwesome as AutoAwesomeIcon,
  Save as SaveIcon,
  MenuBook as MenuBookIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useBook, Chapter } from '../context/BookContext';

const Chapters: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useBook();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [chapters, setChapters] = useState<Chapter[]>(state.book.chapters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [autoDetectSuccess, setAutoDetectSuccess] = useState<string | null>(null);

  useEffect(() => {
    setChapters(state.book.chapters);
  }, [state.book.chapters]);

  // Auto-detect chapters from content
  const autoDetectChapters = () => {
    const content = state.book.content;
    if (!content.trim()) {
      return;
    }

    // Common chapter markers
    const chapterPatterns = [
      /^Chapter\s+\d+[.:\s]/gmi,
      /^CHAPTER\s+\d+[.:\s]/gmi,
      /^Chapter\s+[IVX]+[.:\s]/gmi,
      /^CHAPTER\s+[IVX]+[.:\s]/gmi,
      /^Chapter\s+One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten/gmi,
      /^\d+[.:\s]/gmi, // Just numbers at start of line
    ];

    const detectedChapters: Chapter[] = [];
    let lastIndex = 0;
    let chapterNumber = 1;

    // Find all chapter markers
    const matches: Array<{ index: number; text: string }> = [];
    
    chapterPatterns.forEach(pattern => {
      const regex = new RegExp(pattern.source, 'gmi');
      let match;
      while ((match = regex.exec(content)) !== null) {
        matches.push({ index: match.index, text: match[0] });
      }
    });

    // Sort by index and remove duplicates
    matches.sort((a, b) => a.index - b.index);
    const uniqueMatches = matches.filter((match, index, arr) => 
      index === 0 || match.index !== arr[index - 1].index
    );

    if (uniqueMatches.length === 0) {
      // No chapters detected, create one chapter with all content
      const newChapter: Chapter = {
        id: `chapter-1`,
        title: 'Chapter 1',
        body: content.trim(),
        content: content.trim(), // Legacy support
        isNumbered: true,
        startOnRightPage: false,
        type: 'chapter',
      };
      detectedChapters.push(newChapter);
    } else {
      // Create chapters based on detected markers
      uniqueMatches.forEach((match, index) => {
        const startIndex = match.index;
        const endIndex = index < uniqueMatches.length - 1 
          ? uniqueMatches[index + 1].index 
          : content.length;
        
        const chapterContent = content.substring(lastIndex, startIndex).trim();
        const chapterTitle = match.text.trim().replace(/[.:]$/, '');
        
        if (chapterContent || index === 0) {
          const chapterBody = chapterContent || content.substring(startIndex, endIndex).trim();
          const newChapter: Chapter = {
            id: `chapter-${chapterNumber}`,
            title: chapterTitle || `Chapter ${chapterNumber}`,
            body: chapterBody,
            content: chapterBody, // Legacy support
            isNumbered: true,
            startOnRightPage: false,
            type: 'chapter',
          };
          detectedChapters.push(newChapter);
          chapterNumber++;
        }
        
        lastIndex = startIndex;
      });

      // Add remaining content as last chapter if any
      if (lastIndex < content.length) {
        const remainingContent = content.substring(lastIndex).trim();
        if (remainingContent) {
          detectedChapters.push({
            id: `chapter-${chapterNumber}`,
            title: `Chapter ${chapterNumber}`,
            body: remainingContent,
            content: remainingContent, // Legacy support
            isNumbered: true,
            startOnRightPage: false,
            type: 'chapter',
          });
        }
      }
    }

    if (detectedChapters.length > 0) {
      setChapters(detectedChapters);
      setAutoDetectSuccess(`Detected ${detectedChapters.length} chapter${detectedChapters.length > 1 ? 's' : ''}`);
      setTimeout(() => setAutoDetectSuccess(null), 3000);
    }
  };

  const handleAddChapter = () => {
    setEditingChapter(null);
    setChapterTitle('');
    setChapterContent('');
    setDialogOpen(true);
  };

  const handleEditChapter = (chapter: Chapter) => {
    setEditingChapter(chapter);
    setChapterTitle(chapter.title);
    setChapterContent(chapter.body || chapter.content || '');
    setDialogOpen(true);
  };

  const handleDeleteChapter = (id: string) => {
    dispatch({ type: 'REMOVE_CHAPTER', payload: id });
    setChapters(chapters.filter(ch => ch.id !== id));
  };

  const handleMoveChapter = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === chapters.length - 1)
    ) {
      return;
    }

    const newChapters = [...chapters];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newChapters[index], newChapters[targetIndex]] = [newChapters[targetIndex], newChapters[index]];
    setChapters(newChapters);
  };

  const handleSaveChapter = () => {
    if (!chapterTitle.trim() || !chapterContent.trim()) {
      return;
    }

    if (editingChapter) {
      dispatch({
        type: 'UPDATE_CHAPTER',
        payload: {
          id: editingChapter.id,
          updates: {
            title: chapterTitle.trim(),
            body: chapterContent.trim(),
            content: chapterContent.trim(), // Legacy support
          },
        },
      });
    } else {
      const newChapter: Chapter = {
        id: `chapter-${Date.now()}`,
        title: chapterTitle.trim(),
        body: chapterContent.trim(),
        content: chapterContent.trim(), // Legacy support
        isNumbered: true,
        startOnRightPage: false,
        type: 'chapter',
      };
      dispatch({ type: 'ADD_CHAPTER', payload: newChapter });
      setChapters([...chapters, newChapter]);
    }

    setDialogOpen(false);
    setEditingChapter(null);
    setChapterTitle('');
    setChapterContent('');
  };

  const handleSaveAll = () => {
    // Update all chapters in context
    chapters.forEach((chapter, index) => {
      dispatch({
        type: 'UPDATE_CHAPTER',
        payload: {
          id: chapter.id,
          updates: chapter,
        },
      });
    });

    // Also update the main content to be the combined chapters
    const combinedContent = chapters.map(ch => ch.body || ch.content || '').join('\n\n');
    dispatch({
      type: 'SET_BOOK',
      payload: { content: combinedContent },
    });
  };

  const handleSplitByContent = () => {
    // Split existing content into chapters by double line breaks or manual markers
    const content = state.book.content;
    if (!content.trim()) return;

    // Split by double line breaks (common chapter separator)
    const sections = content.split(/\n\n\n+/);
    
    if (sections.length > 1) {
      const newChapters: Chapter[] = sections.map((section, index) => ({
        id: `chapter-${index + 1}`,
        title: `Chapter ${index + 1}`,
        body: section.trim(),
        content: section.trim(), // Legacy support
        isNumbered: true,
        startOnRightPage: false,
        type: 'chapter',
      }));
      setChapters(newChapters);
      setAutoDetectSuccess(`Split content into ${newChapters.length} chapters`);
      setTimeout(() => setAutoDetectSuccess(null), 3000);
    }
  };

  const cardBorder = '1px solid rgba(44, 40, 37, 0.06)';

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 }, px: { xs: 2, sm: 3 } }}>
      <Box sx={{ textAlign: 'center', mb: 4, maxWidth: 720, mx: 'auto' }}>
        <Typography variant="overline" sx={{ letterSpacing: '0.16em', color: 'text.secondary', fontWeight: 600 }}>
          Step three · Manuscript structure
        </Typography>
        <Typography
          variant={isMobile ? 'h4' : 'h3'}
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, color: 'text.primary', mt: 1 }}
        >
          Organize your chapters
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
          Review how your manuscript is divided, fine-tune chapter breaks before formatting, and reorder sections so the
          story reads the way you intend. Drag handles and arrows only change order—your words stay intact.
        </Typography>
      </Box>

      {autoDetectSuccess && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setAutoDetectSuccess(null)}>
          {autoDetectSuccess}
        </Alert>
      )}

      <Card sx={{ mb: 4, border: cardBorder, boxShadow: '0 8px 28px rgba(44, 40, 37, 0.05)' }}>
        <CardContent sx={{ py: { xs: 2, sm: 2.5 } }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
            Tools for structuring your draft—pick what matches how you already write.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              onClick={autoDetectChapters}
              disabled={!state.book.content.trim()}
            >
              Suggest chapters from text
            </Button>
            <Button variant="outlined" onClick={handleSplitByContent} disabled={!state.book.content.trim()}>
              Split by blank sections
            </Button>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddChapter}>
              Add chapter by hand
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveAll}
              disabled={chapters.length === 0}
              sx={{ ml: { xs: 0, md: 'auto' }, width: { xs: '100%', md: 'auto' } }}
            >
              Save all to manuscript
            </Button>
          </Box>
        </CardContent>
      </Card>

      {chapters.length === 0 ? (
        <Card sx={{ border: cardBorder, boxShadow: '0 8px 32px rgba(44, 40, 37, 0.06)' }}>
          <CardContent sx={{ py: { xs: 5, sm: 6 }, px: { xs: 2, sm: 4 } }}>
            <Box sx={{ maxWidth: 480, mx: 'auto', textAlign: 'center' }}>
              <MenuBookIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.85, mb: 2 }} />
              <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
                No chapters yet
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, mb: 2 }}>
                When your manuscript is in the app, try <strong>suggest chapters from text</strong> to pick up
                headings—or <strong>add chapter by hand</strong> if you prefer full control.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                This step is about order and breaks, not rewriting. Take your time.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {chapters.map((chapter, index) => (
            <Card
              key={chapter.id}
              sx={{
                border: cardBorder,
                borderRadius: 2,
                boxShadow: '0 4px 20px rgba(44, 40, 37, 0.05)',
                transition: 'box-shadow 0.2s ease',
                '&:hover': { boxShadow: '0 8px 28px rgba(44, 40, 37, 0.08)' },
              }}
            >
              <CardContent sx={{ py: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'flex-start' },
                    gap: 2,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
                      <Chip label={`Section ${index + 1}`} size="small" variant="outlined" color="primary" />
                      <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
                        {chapter.title}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                      About {(chapter.body || chapter.content || '').split(/\s+/).filter(Boolean).length} words ·{' '}
                      {(chapter.body || chapter.content || '').split('\n').filter((p) => p.trim()).length} paragraphs
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: { xs: 'flex-end', sm: 'flex-end' },
                      gap: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    <IconButton
                      aria-label="Move section up"
                      onClick={() => handleMoveChapter(index, 'up')}
                      disabled={index === 0}
                      size="small"
                      sx={{ bgcolor: 'action.hover' }}
                    >
                      <ArrowUpIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label="Move section down"
                      onClick={() => handleMoveChapter(index, 'down')}
                      disabled={index === chapters.length - 1}
                      size="small"
                      sx={{ bgcolor: 'action.hover' }}
                    >
                      <ArrowDownIcon fontSize="small" />
                    </IconButton>
                    <IconButton aria-label="Edit section" onClick={() => handleEditChapter(chapter)} size="small" color="primary">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label="Remove section"
                      onClick={() => handleDeleteChapter(chapter.id)}
                      size="small"
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Chapter Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle component="div">
          <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
            {editingChapter ? 'Edit this section' : 'Add a new section'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 400 }}>
            Title and body are what readers see in exports once formatting is applied.
          </Typography>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Chapter Title"
            fullWidth
            variant="outlined"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Chapter Content"
            fullWidth
            multiline
            rows={12}
            variant="outlined"
            value={chapterContent}
            onChange={(e) => setChapterContent(e.target.value)}
            placeholder="Enter the chapter content here..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveChapter}
            variant="contained"
            disabled={!chapterTitle.trim() || !chapterContent.trim()}
          >
            {editingChapter ? 'Update' : 'Add'} Chapter
          </Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 5, gap: 2, flexWrap: 'wrap' }}>
        <Button onClick={() => navigate('/format')} variant="text" color="inherit">
          Back to style & templates
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            handleSaveAll();
            navigate('/preview');
          }}
          disabled={chapters.length === 0}
        >
          Continue to book preview
        </Button>
      </Box>
    </Container>
  );
};

export default Chapters;

