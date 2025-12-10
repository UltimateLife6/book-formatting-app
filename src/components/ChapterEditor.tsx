import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
  Button,
  Tabs,
  Tab,
  Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Notes as NotesIcon,
} from '@mui/icons-material';
import { Chapter } from '../context/BookContext';

interface ChapterEditorProps {
  chapter: Chapter | null;
  onSave: (chapter: Chapter) => void;
  onCancel?: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
};

const ChapterEditor: React.FC<ChapterEditorProps> = ({
  chapter,
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [isNumbered, setIsNumbered] = useState(true);
  const [startOnRightPage, setStartOnRightPage] = useState(false);
  const [authorNotes, setAuthorNotes] = useState('');
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title);
      setSubtitle(chapter.subtitle || '');
      setBody(chapter.body || chapter.content || '');
      setIsNumbered(chapter.isNumbered ?? true);
      setStartOnRightPage(chapter.startOnRightPage ?? false);
      setAuthorNotes(chapter.metadata?.authorNotes || '');
    } else {
      // Reset form
      setTitle('');
      setSubtitle('');
      setBody('');
      setIsNumbered(true);
      setStartOnRightPage(false);
      setAuthorNotes('');
    }
  }, [chapter]);

  if (!chapter) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Select a chapter to edit
        </Typography>
      </Paper>
    );
  }

  const handleSave = () => {
    const updatedChapter: Chapter = {
      ...chapter,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      body: body.trim(),
      content: body.trim(), // Legacy support
      isNumbered,
      startOnRightPage,
      metadata: {
        ...chapter.metadata,
        authorNotes: authorNotes.trim() || undefined,
        updatedAt: new Date().toISOString(),
      },
    };
    onSave(updatedChapter);
  };

  const wordCount = body.trim().split(/\s+/).filter(w => w.length > 0).length;
  const characterCount = body.length;
  const paragraphCount = body.split('\n').filter(p => p.trim()).length;

  return (
    <Paper elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">Chapter Editor</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label={chapter.type === 'frontMatter' ? 'Front Matter' : chapter.type === 'backMatter' ? 'Back Matter' : 'Chapter'}
              size="small"
              color={chapter.type === 'chapter' ? 'primary' : 'default'}
            />
            {chapter.chapterNumber && (
              <Chip
                label={`Chapter ${chapter.chapterNumber}`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            size="small"
          >
            Save
          </Button>
          {onCancel && (
            <Button
              variant="outlined"
              onClick={onCancel}
              size="small"
            >
              Cancel
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label="Content" />
          <Tab label="Settings" />
          <Tab label="Notes" icon={<NotesIcon />} iconPosition="start" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <TextField
            fullWidth
            label="Chapter Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Subtitle (optional)"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Chapter Content"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            margin="normal"
            multiline
            rows={20}
            required
            sx={{ mt: 2 }}
            helperText={`${wordCount} words • ${characterCount} characters • ${paragraphCount} paragraphs`}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <FormControlLabel
            control={
              <Switch
                checked={isNumbered}
                onChange={(e) => setIsNumbered(e.target.checked)}
                disabled={chapter.type !== 'chapter'}
              />
            }
            label="Show Chapter Number"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
            {chapter.type !== 'chapter' && 'Only chapters can be numbered'}
          </Typography>

          <Divider sx={{ my: 2 }} />

          <FormControlLabel
            control={
              <Switch
                checked={startOnRightPage}
                onChange={(e) => setStartOnRightPage(e.target.checked)}
              />
            }
            label="Start on Right Page"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
            Adds a blank page if needed to start on the right-hand page
          </Typography>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Author notes are not included in the exported book. Use this space for reminders, research notes, or version tracking.
          </Typography>
          <TextField
            fullWidth
            label="Author Notes"
            value={authorNotes}
            onChange={(e) => setAuthorNotes(e.target.value)}
            multiline
            rows={10}
            placeholder="Add your notes here..."
          />
        </TabPanel>
      </Box>
    </Paper>
  );
};

export default ChapterEditor;

