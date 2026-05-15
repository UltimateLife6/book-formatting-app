import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  Typography,
  Collapse,
  Paper,
  Divider,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Button,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
  MenuBook as ChapterIcon,
  Book as PartIcon,
  Description as FrontMatterIcon,
  LibraryBooks as BackMatterIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Chapter, Part, ManuscriptStructure } from '../context/BookContext';

interface ChapterTreeProps {
  manuscript: ManuscriptStructure;
  onChapterSelect: (chapter: Chapter) => void;
  onChapterAdd: (type: 'chapter' | 'frontMatter' | 'backMatter', partId?: string) => void;
  onChapterEdit: (chapter: Chapter) => void;
  onChapterDelete: (chapterId: string) => void;
  onPartAdd: () => void;
  onPartEdit: (part: Part) => void;
  onPartDelete: (partId: string) => void;
  onReorder: (sourceIndex: number, destinationIndex: number) => void;
  onMoveToPart: (chapterId: string, partId: string | null) => void;
  selectedChapterId?: string;
}

interface SortableChapterItemProps {
  chapter: Chapter;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isSelected: boolean;
  showNumber: boolean;
}

const SortableChapterItem: React.FC<SortableChapterItemProps> = ({
  chapter,
  onSelect,
  onEdit,
  onDelete,
  isSelected,
  showNumber,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const getIcon = () => {
    switch (chapter.type) {
      case 'frontMatter':
        return <FrontMatterIcon />;
      case 'backMatter':
        return <BackMatterIcon />;
      default:
        return <ChapterIcon />;
    }
  };

  const displayTitle = showNumber && chapter.chapterNumber
    ? `${chapter.chapterNumber}. ${chapter.title}`
    : chapter.title;

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      sx={{
        pl: 2,
        pr: 1,
        py: 0.5,
        mx: 1,
        mb: 0.5,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: isSelected ? 'rgba(44, 40, 37, 0.14)' : 'transparent',
        bgcolor: isSelected ? 'rgba(44, 40, 37, 0.04)' : 'transparent',
        '&:hover': {
          bgcolor: isSelected ? 'rgba(44, 40, 37, 0.06)' : 'action.hover',
          borderColor: isSelected ? 'rgba(44, 40, 37, 0.18)' : 'rgba(44, 40, 37, 0.06)',
        },
      }}
      secondaryAction={
        <Box sx={{ display: 'flex', alignItems: 'center', pr: 0.5 }}>
          <IconButton
            edge="end"
            size="small"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            sx={{
              cursor: 'grab',
              color: 'text.disabled',
              '&:active': { cursor: 'grabbing' },
              '&:hover': { bgcolor: 'rgba(44, 40, 37, 0.06)', color: 'text.secondary' },
            }}
          >
            <DragIcon fontSize="small" />
          </IconButton>
          <IconButton
            edge="end"
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <MoreIcon fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      <ListItemButton onClick={onSelect}>
        <ListItemIcon sx={{ minWidth: 36 }}>
          {getIcon()}
        </ListItemIcon>
        <ListItemText
          primary={displayTitle}
          secondary={chapter.subtitle}
          primaryTypographyProps={{
            variant: 'body2',
            fontWeight: isSelected ? 600 : 500,
            sx: { fontFamily: 'inherit' },
          }}
          secondaryTypographyProps={{ variant: 'caption', sx: { display: 'block', mt: 0.25 } }}
        />
      </ListItemButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => { onEdit(); setAnchorEl(null); }}>
          <EditIcon sx={{ mr: 1 }} fontSize="small" />
          Edit
        </MenuItem>
        <MenuItem onClick={() => { onDelete(); setAnchorEl(null); }}>
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
          Delete
        </MenuItem>
      </Menu>
    </ListItem>
  );
};

const ChapterTree: React.FC<ChapterTreeProps> = ({
  manuscript,
  onChapterSelect,
  onChapterAdd,
  onChapterEdit,
  onChapterDelete,
  onPartAdd,
  onPartEdit,
  onPartDelete,
  onReorder,
  onMoveToPart,
  selectedChapterId,
}) => {
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [showNumbering, setShowNumbering] = useState(true);
  const [partDialogOpen, setPartDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [partTitle, setPartTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const togglePart = (partId: string) => {
    const newExpanded = new Set(expandedParts);
    if (newExpanded.has(partId)) {
      newExpanded.delete(partId);
    } else {
      newExpanded.add(partId);
    }
    setExpandedParts(newExpanded);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Get all items in order
    const allItems: Array<{ id: string; type: 'chapter' | 'part' }> = [];
    
    manuscript.frontMatter.forEach(ch => allItems.push({ id: ch.id, type: 'chapter' }));
    manuscript.parts.forEach(part => {
      allItems.push({ id: part.id, type: 'part' });
      part.chapterIds.forEach(chId => {
        const chapter = manuscript.chapters.find(c => c.id === chId);
        if (chapter) allItems.push({ id: chapter.id, type: 'chapter' });
      });
    });
    manuscript.chapters
      .filter(ch => !manuscript.parts.some(p => p.chapterIds.includes(ch.id)))
      .forEach(ch => allItems.push({ id: ch.id, type: 'chapter' }));
    manuscript.backMatter.forEach(ch => allItems.push({ id: ch.id, type: 'chapter' }));

    const oldIndex = allItems.findIndex(item => item.id === active.id);
    const newIndex = allItems.findIndex(item => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(oldIndex, newIndex);
    }
  };

  const handlePartSave = () => {
    if (!partTitle.trim()) return;

    if (editingPart) {
      onPartEdit({ ...editingPart, title: partTitle.trim() });
    } else {
      // Part creation will be handled by parent
      onPartAdd();
    }
    setPartDialogOpen(false);
    setEditingPart(null);
    setPartTitle('');
  };

  const getAllChapterIds = (): string[] => {
    const ids: string[] = [];
    manuscript.frontMatter.forEach(ch => ids.push(ch.id));
    manuscript.parts.forEach(part => ids.push(...part.chapterIds));
    manuscript.chapters
      .filter(ch => !manuscript.parts.some(p => p.chapterIds.includes(ch.id)))
      .forEach(ch => ids.push(ch.id));
    manuscript.backMatter.forEach(ch => ids.push(ch.id));
    return ids;
  };

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        overflow: 'auto',
        border: '1px solid rgba(44, 40, 37, 0.08)',
        borderRadius: 0,
        bgcolor: '#fffefb',
        boxShadow: { md: 'inset -1px 0 0 rgba(44, 40, 37, 0.04)' },
      }}
    >
      <Box sx={{ px: 2, py: 2, borderBottom: '1px solid rgba(44, 40, 37, 0.08)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
          <Box>
            <Typography variant="overline" sx={{ letterSpacing: '0.12em', color: 'text.secondary', fontWeight: 600 }}>
              Outline
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              Manuscript structure
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>
              Drag the handle to reorder. The menu holds edit and delete.
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={showNumbering}
                onChange={(e) => setShowNumbering(e.target.checked)}
                size="small"
              />
            }
            label="Chapter numbers"
            sx={{ m: 0, flexShrink: 0, '& .MuiFormControlLabel-label': { typography: 'caption' } }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <IconButton
            size="small"
            onClick={() => onChapterAdd('frontMatter')}
            title="Add Front Matter"
          >
            <FrontMatterIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onPartAdd()}
            title="Add Part"
          >
            <PartIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onChapterAdd('chapter')}
            title="Add Chapter"
          >
            <ChapterIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onChapterAdd('backMatter')}
            title="Add Back Matter"
          >
            <BackMatterIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={getAllChapterIds()}
          strategy={verticalListSortingStrategy}
        >
          <List sx={{ p: 0 }}>
            {/* Front Matter */}
            {manuscript.frontMatter.length > 0 && (
              <>
                <ListItem sx={{ py: 1, px: 2 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.14em', fontWeight: 600 }}>
                    Front matter
                  </Typography>
                </ListItem>
                {manuscript.frontMatter.map((chapter) => (
                  <SortableChapterItem
                    key={chapter.id}
                    chapter={chapter}
                    onSelect={() => onChapterSelect(chapter)}
                    onEdit={() => onChapterEdit(chapter)}
                    onDelete={() => onChapterDelete(chapter.id)}
                    isSelected={selectedChapterId === chapter.id}
                    showNumber={false}
                  />
                ))}
                <Divider sx={{ opacity: 0.6 }} />
              </>
            )}

            {/* Parts */}
            {manuscript.parts.map((part) => (
              <React.Fragment key={part.id}>
                <ListItem sx={{ py: 0.5, bgcolor: 'rgba(44, 40, 37, 0.02)' }}>
                  <ListItemButton onClick={() => togglePart(part.id)}>
                    <ListItemIcon>
                      {expandedParts.has(part.id) ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                    </ListItemIcon>
                    <ListItemText
                      primary={part.title}
                      secondary={part.subtitle}
                      primaryTypographyProps={{ variant: 'subtitle2', fontWeight: 600 }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPart(part);
                        setPartTitle(part.title);
                        setPartDialogOpen(true);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPartDelete(part.id);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemButton>
                </ListItem>
                <Collapse in={expandedParts.has(part.id)} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {part.chapterIds.map((chapterId) => {
                      const chapter = manuscript.chapters.find(c => c.id === chapterId);
                      if (!chapter) return null;
                      return (
                        <SortableChapterItem
                          key={chapter.id}
                          chapter={chapter}
                          onSelect={() => onChapterSelect(chapter)}
                          onEdit={() => onChapterEdit(chapter)}
                          onDelete={() => onChapterDelete(chapter.id)}
                          isSelected={selectedChapterId === chapter.id}
                          showNumber={showNumbering}
                        />
                      );
                    })}
                  </List>
                </Collapse>
              </React.Fragment>
            ))}

            {/* Standalone Chapters */}
            {manuscript.chapters
              .filter(ch => !manuscript.parts.some(p => p.chapterIds.includes(ch.id)))
              .map((chapter) => (
                <SortableChapterItem
                  key={chapter.id}
                  chapter={chapter}
                  onSelect={() => onChapterSelect(chapter)}
                  onEdit={() => onChapterEdit(chapter)}
                  onDelete={() => onChapterDelete(chapter.id)}
                  isSelected={selectedChapterId === chapter.id}
                  showNumber={showNumbering}
                />
              ))}

            {/* Back Matter */}
            {manuscript.backMatter.length > 0 && (
              <>
                <Divider sx={{ my: 1, opacity: 0.6 }} />
                <ListItem sx={{ py: 1, px: 2 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.14em', fontWeight: 600 }}>
                    Back matter
                  </Typography>
                </ListItem>
                {manuscript.backMatter.map((chapter) => (
                  <SortableChapterItem
                    key={chapter.id}
                    chapter={chapter}
                    onSelect={() => onChapterSelect(chapter)}
                    onEdit={() => onChapterEdit(chapter)}
                    onDelete={() => onChapterDelete(chapter.id)}
                    isSelected={selectedChapterId === chapter.id}
                    showNumber={false}
                  />
                ))}
              </>
            )}
          </List>
        </SortableContext>
      </DndContext>

      {/* Part Dialog */}
      <Dialog open={partDialogOpen} onClose={() => setPartDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPart ? 'Rename part' : 'Add part'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Part Title"
            fullWidth
            variant="outlined"
            value={partTitle}
            onChange={(e) => setPartTitle(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Subtitle (optional)"
            fullWidth
            variant="outlined"
            value={editingPart?.subtitle || ''}
            onChange={(e) => editingPart && onPartEdit({ ...editingPart, subtitle: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPartDialogOpen(false)}>Cancel</Button>
          <Button onClick={handlePartSave} variant="contained" disabled={!partTitle.trim()}>
            {editingPart ? 'Update' : 'Add'} Part
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ChapterTree;

