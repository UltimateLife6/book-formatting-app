import React, { useState, useCallback } from 'react';
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
} from '@mui/material';
import { useBook } from '../context/BookContext';
import ChapterTree from '../components/ChapterTree';
import ChapterEditor from '../components/ChapterEditor';
import { Chapter, Part } from '../context/BookContext';

const Manuscript: React.FC = () => {
  const { state, dispatch } = useBook();
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [newChapterDialogOpen, setNewChapterDialogOpen] = useState(false);
  const [newChapterType, setNewChapterType] = useState<'chapter' | 'frontMatter' | 'backMatter'>('chapter');
  const [newPartDialogOpen, setNewPartDialogOpen] = useState(false);
  const [newPartTitle, setNewPartTitle] = useState('');

  const manuscript = state.book.manuscript;

  const handleChapterSelect = useCallback((chapter: Chapter) => {
    setSelectedChapter(chapter);
  }, []);

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
  }, [state.book.chapters, manuscript, dispatch]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="h5" component="h1">
          Manuscript Editor
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Organize and edit your book chapters
        </Typography>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex' }}>
        <Box sx={{ width: { xs: '100%', md: '33.333%' }, borderRight: { md: 1 }, borderColor: 'divider', height: '100%', overflow: 'hidden', display: { xs: selectedChapter ? 'none' : 'block', md: 'block' } }}>
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

        <Box sx={{ width: { xs: '100%', md: '66.666%' }, height: '100%', overflow: 'hidden', display: { xs: selectedChapter ? 'block' : 'none', md: 'block' } }}>
          <ChapterEditor
            chapter={selectedChapter}
            onSave={handleChapterSave}
          />
        </Box>
      </Box>

      {/* New Chapter Dialog */}
      <Dialog open={newChapterDialogOpen} onClose={() => setNewChapterDialogOpen(false)}>
        <DialogTitle>Create New Chapter</DialogTitle>
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
        <DialogTitle>Create New Part</DialogTitle>
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

