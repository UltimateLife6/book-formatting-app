import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Collapse,
  Divider,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useBook } from '../context/BookContext';
import ChapterTree from '../components/ChapterTree';
import ChapterEditor, { ChapterEditorRef } from '../components/ChapterEditor';
import TrimSizeSelector from '../components/TrimSizeSelector';
import { Chapter, Part } from '../context/BookContext';
import { getAllChaptersInOrder } from '../utils/manuscriptOrder';

const Manuscript: React.FC = () => {
  const { state, dispatch } = useBook();
  const navigate = useNavigate();
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const chapterEditorRef = React.useRef<ChapterEditorRef>(null);
  const [newChapterDialogOpen, setNewChapterDialogOpen] = useState(false);
  const [newChapterType, setNewChapterType] = useState<'chapter' | 'frontMatter' | 'backMatter'>('chapter');
  const [newPartDialogOpen, setNewPartDialogOpen] = useState(false);
  const [newPartTitle, setNewPartTitle] = useState('');
  const [showTrimSizeWarning, setShowTrimSizeWarning] = useState(false);
  const [showPageSizeSettings, setShowPageSizeSettings] = useState(false);
  const [hasFormattedContent] = useState(
    !!(
      state.book.content ||
      state.book.manuscript.chapters.length > 0 ||
      state.book.manuscript.frontMatter.length > 0 ||
      state.book.manuscript.backMatter.length > 0
    )
  );

  const manuscript = state.book.manuscript;

  const handleChapterSelect = useCallback(
    (chapter: Chapter) => {
      setSelectedChapter(chapter);
      dispatch({
        type: 'SET_BOOK',
        payload: {
          manuscriptUi: { selectedChapterId: chapter.id },
        },
      });
    },
    [dispatch]
  );

  // After import, `manuscriptUi.selectedChapterId` drives chapter tree + editor focus.
  useEffect(() => {
    const ordered = getAllChaptersInOrder(manuscript);
    if (ordered.length === 0) {
      setSelectedChapter(null);
      return;
    }
    const id = state.book.manuscriptUi?.selectedChapterId;
    if (id) {
      const found = ordered.find((c) => c.id === id);
      if (found) {
        setSelectedChapter((prev) => (prev?.id === found.id ? prev : found));
        return;
      }
    }
    const first = ordered[0];
    setSelectedChapter(first);
    dispatch({
      type: 'SET_BOOK',
      payload: { manuscriptUi: { selectedChapterId: first.id } },
    });
  }, [manuscript, state.book.manuscriptUi?.selectedChapterId, dispatch]);

  const handleChapterAdd = useCallback((type: 'chapter' | 'frontMatter' | 'backMatter', partId?: string) => {
    setNewChapterType(type);
    setNewChapterDialogOpen(true);
  }, []);

  const handleChapterSave = useCallback((chapter: Chapter) => {
    dispatch({
      type: 'UPDATE_CHAPTER',
      payload: {
        id: chapter.id,
        updates: chapter,
      },
    });
    setSelectedChapter(chapter);
  }, [dispatch]);

  const handleChapterDelete = useCallback((chapterId: string) => {
    if (selectedChapter?.id === chapterId) {
      setSelectedChapter(null);
    }
    dispatch({ type: 'REMOVE_CHAPTER', payload: chapterId });
  }, [dispatch, selectedChapter]);

  const handlePartAdd = useCallback(() => {
    setNewPartDialogOpen(true);
  }, []);

  const handlePartEdit = useCallback((part: Part) => {
    dispatch({
      type: 'UPDATE_PART',
      payload: {
        id: part.id,
        updates: part,
      },
    });
  }, [dispatch]);

  const handlePartDelete = useCallback((partId: string) => {
    dispatch({ type: 'REMOVE_PART', payload: partId });
  }, [dispatch]);

  const handleReorder = useCallback((sourceIndex: number, destinationIndex: number) => {
    dispatch({
      type: 'REORDER_CHAPTERS',
      payload: { sourceIndex, destinationIndex },
    });
  }, [dispatch]);

  const handleMoveToPart = useCallback((chapterId: string, partId: string | null) => {
    dispatch({
      type: 'MOVE_CHAPTER_TO_PART',
      payload: { chapterId, partId },
    });
  }, [dispatch]);

  const handlePageSizeChange = useCallback((pageSize: typeof state.book.pageSize) => {
    // Show warning if content has been formatted
    const currentTrimSizeId = state.book.pageSize.trimSize?.id;
    const newTrimSizeId = pageSize.trimSize?.id;
    if (hasFormattedContent && currentTrimSizeId !== newTrimSizeId) {
      setShowTrimSizeWarning(true);
    }

    dispatch({
      type: 'SET_BOOK',
      payload: { pageSize },
    });
  }, [dispatch, hasFormattedContent, state]);

  const handleMarginsChange = useCallback((margins: {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    gutter: number;
  }) => {
    // Auto-update margins when trim size changes
    dispatch({
      type: 'SET_BOOK',
      payload: {
        formatting: {
          ...state.book.formatting,
          marginTop: margins.marginTop,
          marginBottom: margins.marginBottom,
          marginLeft: margins.marginLeft,
          marginRight: margins.marginRight,
        },
        pageSize: {
          ...state.book.pageSize,
          gutter: margins.gutter,
        },
      },
    });
  }, [dispatch, state]);

  const handleCreateNewChapter = () => {
    const newChapter: Chapter = {
      id: `chapter-${Date.now()}`,
      title: 'Untitled Chapter',
      body: '',
      content: '', // Legacy support
      isNumbered: newChapterType === 'chapter',
      startOnRightPage: false,
      type: newChapterType,
      metadata: {
        createdAt: new Date().toISOString(),
      },
    };

    dispatch({ type: 'ADD_CHAPTER', payload: newChapter });
    setSelectedChapter(newChapter);
    setNewChapterDialogOpen(false);
  };

  const handleCreateNewPart = () => {
    if (!newPartTitle.trim()) return;

    const newPart: Part = {
      id: `part-${Date.now()}`,
      title: newPartTitle.trim(),
      chapterIds: [],
    };

    dispatch({ type: 'ADD_PART', payload: newPart });
    setNewPartTitle('');
    setNewPartDialogOpen(false);
  };

  // Migrate legacy chapters to manuscript structure if needed
  React.useEffect(() => {
    if (state.book.chapters.length > 0 && 
        manuscript.chapters.length === 0 && 
        manuscript.frontMatter.length === 0 && 
        manuscript.backMatter.length === 0) {
      // Migrate legacy chapters
      const migratedChapters = state.book.chapters.map(ch => ({
        ...ch,
        body: ch.body || ch.content || '',
        type: 'chapter' as const,
        isNumbered: ch.isNumbered ?? true,
        startOnRightPage: ch.startOnRightPage ?? false,
      }));

      dispatch({
        type: 'SET_MANUSCRIPT_STRUCTURE',
        payload: {
          ...manuscript,
          chapters: migratedChapters,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.book.chapters, state.book.manuscript, dispatch]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: { xs: 2, sm: 2.5 },
          borderBottom: '1px solid rgba(44, 40, 37, 0.08)',
          bgcolor: '#fffefb',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'flex-start' },
            gap: 2,
            mb: 1,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ letterSpacing: '0.14em', color: 'text.secondary', fontWeight: 600 }}>
              Your manuscript
            </Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 600, mt: 0.5 }}>
              This is becoming a real book
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.65, maxWidth: 560 }}>
              Choose a section on the left, write or refine on the right, and save as you go. When you are ready, open
              preview to see pages—not a spreadsheet.
            </Typography>
          </Box>
          <Tooltip title="Open formatted preview (saves the open section first)">
            <IconButton
              color="primary"
              onClick={() => {
                // Save current chapter if one is selected and being edited
                if (chapterEditorRef.current && selectedChapter) {
                  const currentChapter = chapterEditorRef.current.getCurrentChapter();
                  if (currentChapter) {
                    handleChapterSave(currentChapter);
                  }
                }
                navigate('/preview');
              }}
              sx={{
                alignSelf: { xs: 'flex-end', sm: 'flex-start' },
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': {
                  bgcolor: 'primary.dark',
                },
                transition: 'background-color 0.2s ease',
              }}
              aria-label="Open preview"
            >
              <VisibilityIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Page Size Settings - Collapsible */}
        <Card
          variant="outlined"
          sx={{
            mt: 2,
            border: '1px solid rgba(44, 40, 37, 0.08)',
            boxShadow: 'none',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1.5,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
            onClick={() => setShowPageSizeSettings(!showPageSizeSettings)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SettingsIcon fontSize="small" color="action" />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Print trim & margins
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Optional—set the physical page your print export should match
                </Typography>
              </Box>
            </Box>
            {showPageSizeSettings ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </Box>
          <Collapse in={showPageSizeSettings}>
            <Divider />
            <CardContent>
              <TrimSizeSelector
                pageSize={state.book.pageSize}
                genre={state.book.genre}
                onPageSizeChange={handlePageSizeChange}
                onMarginsChange={handleMarginsChange}
                showWarning={showTrimSizeWarning}
                onWarningAcknowledge={() => setShowTrimSizeWarning(false)}
              />
            </CardContent>
          </Collapse>
        </Card>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', bgcolor: 'rgba(44, 40, 37, 0.02)' }}>
        <Box
          sx={{
            width: { xs: '100%', md: '33.333%' },
            borderRight: { md: '1px solid rgba(44, 40, 37, 0.08)' },
            height: '100%',
            overflow: 'hidden',
            display: { xs: selectedChapter ? 'none' : 'block', md: 'block' },
            bgcolor: '#fffefb',
          }}
        >
          <ChapterTree
            manuscript={manuscript}
            onChapterSelect={handleChapterSelect}
            onChapterAdd={handleChapterAdd}
            onChapterEdit={handleChapterSelect}
            onChapterDelete={handleChapterDelete}
            onPartAdd={handlePartAdd}
            onPartEdit={handlePartEdit}
            onPartDelete={handlePartDelete}
            onReorder={handleReorder}
            onMoveToPart={handleMoveToPart}
            selectedChapterId={selectedChapter?.id}
          />
        </Box>

        <Box
          sx={{
            width: { xs: '100%', md: '66.666%' },
            height: '100%',
            overflow: 'hidden',
            display: { xs: selectedChapter ? 'block' : 'none', md: 'block' },
            p: { xs: 1, md: 1.5 },
            bgcolor: { md: 'transparent' },
          }}
        >
          <ChapterEditor
            ref={chapterEditorRef}
            chapter={selectedChapter}
            onSave={handleChapterSave}
          />
        </Box>
      </Box>

      {/* New Chapter Dialog */}
      <Dialog open={newChapterDialogOpen} onClose={() => setNewChapterDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add to manuscript</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Chapter Type</InputLabel>
            <Select
              value={newChapterType}
              onChange={(e) => setNewChapterType(e.target.value as typeof newChapterType)}
              label="Chapter Type"
            >
              <MenuItem value="frontMatter">Front Matter</MenuItem>
              <MenuItem value="chapter">Chapter</MenuItem>
              <MenuItem value="backMatter">Back Matter</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewChapterDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateNewChapter} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* New Part Dialog */}
      <Dialog open={newPartDialogOpen} onClose={() => setNewPartDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Name this part</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Part Title"
            fullWidth
            variant="outlined"
            value={newPartTitle}
            onChange={(e) => setNewPartTitle(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewPartDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateNewPart}
            variant="contained"
            disabled={!newPartTitle.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Manuscript;

