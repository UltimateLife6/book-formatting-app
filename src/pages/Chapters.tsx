import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  Divider,
  Paper,
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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography
        variant={isMobile ? 'h4' : 'h3'}
        component="h1"
        gutterBottom
        textAlign="center"
        sx={{ fontWeight: 600, color: 'primary.main', mb: 4 }}
      >
        Manage Chapters
      </Typography>

      {autoDetectSuccess && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setAutoDetectSuccess(null)}>
          {autoDetectSuccess}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<AutoAwesomeIcon />}
          onClick={autoDetectChapters}
          disabled={!state.book.content.trim()}
        >
          Auto-Detect Chapters
        </Button>
        <Button
          variant="outlined"
          onClick={handleSplitByContent}
          disabled={!state.book.content.trim()}
        >
          Split by Sections
        </Button>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddChapter}
        >
          Add Chapter
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSaveAll}
          disabled={chapters.length === 0}
          sx={{ ml: 'auto' }}
        >
          Save All Chapters
        </Button>
      </Box>

      {chapters.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
              No chapters yet. Use "Auto-Detect Chapters" to automatically find chapters in your content,
              or click "Add Chapter" to create one manually.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Paper elevation={2}>
          <List>
            {chapters.map((chapter, index) => (
              <React.Fragment key={chapter.id}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={`${index + 1}`} size="small" color="primary" />
                        <Typography variant="h6">{chapter.title}</Typography>
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {(chapter.body || chapter.content || '').length} characters • {(chapter.body || chapter.content || '').split('\n').filter(p => p.trim()).length} paragraphs
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => handleMoveChapter(index, 'up')}
                      disabled={index === 0}
                      size="small"
                    >
                      <ArrowUpIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      onClick={() => handleMoveChapter(index, 'down')}
                      disabled={index === chapters.length - 1}
                      size="small"
                    >
                      <ArrowDownIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      onClick={() => handleEditChapter(chapter)}
                      size="small"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      onClick={() => handleDeleteChapter(chapter.id)}
                      size="small"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
                {index < chapters.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </Paper>
      )}

      {/* Chapter Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {editingChapter ? 'Edit Chapter' : 'Add New Chapter'}
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

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button onClick={() => navigate('/format')}>Back to Formatting</Button>
        <Button
          variant="contained"
          onClick={() => {
            handleSaveAll();
            navigate('/preview');
          }}
          disabled={chapters.length === 0}
        >
          Preview Book
        </Button>
      </Box>
    </Container>
  );
};

export default Chapters;

