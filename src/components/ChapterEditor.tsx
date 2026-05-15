import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
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

export interface ChapterEditorRef {
  getCurrentChapter: () => Chapter | null;
  save: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>}
    </div>
  );
};

const ChapterEditor = forwardRef<ChapterEditorRef, ChapterEditorProps>(({
  chapter,
  onSave,
  onCancel,
}, ref) => {
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

  const getCurrentChapter = (): Chapter | null => {
    if (!chapter) return null;
    return {
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
  };

  const handleSave = () => {
    const updatedChapter = getCurrentChapter();
    if (updatedChapter) {
      onSave(updatedChapter);
    }
  };

  // Expose methods to parent via ref (must be called before any early returns)
  useImperativeHandle(ref, () => ({
    getCurrentChapter,
    save: handleSave,
  }));

  if (!chapter) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: { xs: 4, sm: 6 },
          textAlign: 'center',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(44, 40, 37, 0.08)',
          bgcolor: '#fffefb',
          boxShadow: '0 8px 32px rgba(44, 40, 37, 0.06)',
        }}
      >
        <Box sx={{ maxWidth: 360 }}>
          <Typography variant="overline" sx={{ letterSpacing: '0.14em', color: 'text.secondary', fontWeight: 600 }}>
            Waiting
          </Typography>
          <Typography variant="h6" component="p" sx={{ mt: 1, fontWeight: 600 }}>
            Choose a section from your outline
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.7 }}>
            Pick a chapter, front matter block, or back matter note on the left. Your writing opens here—calm and full
            width, like a desk, not a dashboard.
          </Typography>
        </Box>
      </Paper>
    );
  }

  const wordCount = body.trim().split(/\s+/).filter(w => w.length > 0).length;
  const characterCount = body.length;
  const paragraphCount = body.split('\n').filter(p => p.trim()).length;

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid rgba(44, 40, 37, 0.08)',
        bgcolor: '#fffefb',
        boxShadow: '0 8px 32px rgba(44, 40, 37, 0.06)',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 2, py: 2, borderBottom: '1px solid rgba(44, 40, 37, 0.08)', bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ letterSpacing: '0.12em', color: 'text.secondary', fontWeight: 600 }}>
              Writing space
            </Typography>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 0.25 }}>
              Refine this section
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>
              Save as you go—exports use what is saved here.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Chip
              label={
                chapter.type === 'frontMatter'
                  ? 'Front matter'
                  : chapter.type === 'backMatter'
                    ? 'Back matter'
                    : 'Chapter'
              }
              size="small"
              color={chapter.type === 'chapter' ? 'primary' : 'default'}
              variant={chapter.type === 'chapter' ? 'filled' : 'outlined'}
            />
            {chapter.chapterNumber && (
              <Chip label={`Chapter ${chapter.chapterNumber}`} size="small" variant="outlined" />
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} size="small">
            Save section
          </Button>
          {onCancel && (
            <Button variant="outlined" onClick={onCancel} size="small">
              Cancel
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto', bgcolor: 'rgba(44, 40, 37, 0.02)' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 1,
            bgcolor: 'background.paper',
            borderBottom: '1px solid rgba(44, 40, 37, 0.08)',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 500 },
          }}
        >
          <Tab label="Content" />
          <Tab label="Layout" />
          <Tab label="Notes" icon={<NotesIcon />} iconPosition="start" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <TextField
            fullWidth
            label="Title as it appears in the book"
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
          <Box
            sx={{
              mt: 2,
              p: { xs: 1.5, sm: 2 },
              borderRadius: 2,
              border: '1px solid rgba(44, 40, 37, 0.1)',
              bgcolor: '#fffefb',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
          >
            <TextField
              fullWidth
              label="Manuscript text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              margin="none"
              multiline
              rows={18}
              required
              variant="outlined"
              helperText={`${wordCount} words · ${characterCount} characters · ${paragraphCount} paragraphs`}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'background.paper',
                  fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
                  fontSize: { xs: '1rem', sm: '1.05rem' },
                  lineHeight: 1.75,
                },
              }}
            />
          </Box>
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
            label="Show chapter number in the book"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2, lineHeight: 1.65 }}>
            {chapter.type !== 'chapter' && 'Numbering applies to regular chapters only.'}
          </Typography>

          <Divider sx={{ my: 2 }} />

          <FormControlLabel
            control={
              <Switch checked={startOnRightPage} onChange={(e) => setStartOnRightPage(e.target.checked)} />
            }
            label="Start on a right-hand page"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, lineHeight: 1.65 }}>
            Inserts a blank verso if needed so this section begins on a recto—common in print layout.
          </Typography>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.7 }}>
            Notes never print in your book. Use them for reminders, research, or revision tracking—your readers will
            not see this tab.
          </Typography>
          <TextField
            fullWidth
            label="Author notes (private)"
            value={authorNotes}
            onChange={(e) => setAuthorNotes(e.target.value)}
            multiline
            rows={10}
            placeholder="Jot anything that helps you ship the manuscript..."
          />
        </TabPanel>
      </Box>
    </Paper>
  );
});

ChapterEditor.displayName = 'ChapterEditor';

export default ChapterEditor;

