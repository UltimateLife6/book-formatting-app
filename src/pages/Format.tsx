import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Switch,
  FormControlLabel,
  Chip,
  useMediaQuery,
  useTheme,
  Paper,
  Divider,
} from '@mui/material';
import {
  AutoAwesome as AutoAwesomeIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useBook } from '../context/BookContext';

const Format: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useBook();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [selectedTemplate, setSelectedTemplate] = useState(state.book.template);
  const [formatting, setFormatting] = useState(state.book.formatting);

  // Sync local state with context state when it changes
  useEffect(() => {
    setSelectedTemplate(state.book.template);
    setFormatting(state.book.formatting);
  }, [state.book.template, state.book.formatting]);

  const templates = [
    {
      id: 'classic',
      name: 'Classic Fiction',
      description: 'Traditional novel formatting with serif fonts',
      genre: 'Fiction',
      color: 'primary' as const,
      features: ['Drop caps', 'Scene breaks', 'Chapter headers'],
    },
    {
      id: 'romance',
      name: 'Romance',
      description: 'Elegant formatting perfect for romance novels',
      genre: 'Romance',
      color: 'secondary' as const,
      features: ['Decorative elements', 'Soft fonts', 'Heart motifs'],
    },
    {
      id: 'fantasy',
      name: 'Fantasy',
      description: 'Epic fantasy with dramatic typography',
      genre: 'Fantasy',
      color: 'success' as const,
      features: ['Ornate headers', 'Map integration', 'Character lists'],
    },
    {
      id: 'nonfiction',
      name: 'Non-Fiction',
      description: 'Clean, professional layout for informational books',
      genre: 'Non-Fiction',
      color: 'info' as const,
      features: ['Sidebars', 'Callouts', 'Reference formatting'],
    },
    {
      id: 'poetry',
      name: 'Poetry',
      description: 'Centered, artistic layout for poetry collections',
      genre: 'Poetry',
      color: 'warning' as const,
      features: ['Centered text', 'White space', 'Verse breaks'],
    },
    {
      id: 'academic',
      name: 'Academic',
      description: 'Scholarly formatting with citations and references',
      genre: 'Academic',
      color: 'default' as const,
      features: ['Footnotes', 'Bibliography', 'Research formatting'],
    },
  ];

  const fontFamilies = [
    'Times New Roman',
    'Georgia',
    'Garamond',
    'Palatino',
    'Book Antiqua',
    'Arial',
    'Helvetica',
    'Calibri',
  ];

  // Template presets with specific formatting
  const templatePresets: Record<string, typeof formatting> = {
    classic: {
      fontSize: 12,
      lineHeight: 1.6,
      fontFamily: 'Times New Roman',
      marginTop: 1,
      marginBottom: 1,
      marginLeft: 1.25,
      marginRight: 1.25,
      paragraphIndent: 0.5,
    },
    romance: {
      fontSize: 11,
      lineHeight: 1.7,
      fontFamily: 'Georgia',
      marginTop: 0.75,
      marginBottom: 0.75,
      marginLeft: 1,
      marginRight: 1,
      paragraphIndent: 0.5,
    },
    fantasy: {
      fontSize: 12,
      lineHeight: 1.65,
      fontFamily: 'Garamond',
      marginTop: 1,
      marginBottom: 1,
      marginLeft: 1.5,
      marginRight: 1.5,
      paragraphIndent: 0.5,
    },
    nonfiction: {
      fontSize: 11,
      lineHeight: 1.5,
      fontFamily: 'Arial',
      marginTop: 1,
      marginBottom: 1,
      marginLeft: 1,
      marginRight: 1,
      paragraphIndent: 0,
    },
    poetry: {
      fontSize: 13,
      lineHeight: 1.8,
      fontFamily: 'Palatino',
      marginTop: 1.5,
      marginBottom: 1.5,
      marginLeft: 1.5,
      marginRight: 1.5,
      paragraphIndent: 0,
    },
    academic: {
      fontSize: 12,
      lineHeight: 1.5,
      fontFamily: 'Times New Roman',
      marginTop: 1,
      marginBottom: 1,
      marginLeft: 1.5,
      marginRight: 1,
      paragraphIndent: 0.5,
    },
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const preset = templatePresets[templateId] || templatePresets.classic;
    
    // Apply template preset formatting
    setFormatting(preset);
    dispatch({
      type: 'SET_BOOK',
      payload: { 
        template: templateId,
        formatting: preset,
      },
    });
  };

  const handleFormattingChange = (field: string, value: any) => {
    const newFormatting = { ...formatting, [field]: value };
    setFormatting(newFormatting);
    dispatch({
      type: 'SET_BOOK',
      payload: { formatting: newFormatting },
    });
  };

  const handleSaveAndContinue = () => {
    navigate('/export');
  };

  // Get template styles for preview
  const getTemplateStyles = () => {
    const template = selectedTemplate;
    const baseStyles: Record<string, any> = {
      fontFamily: formatting.fontFamily,
      fontSize: `${formatting.fontSize}pt`,
      lineHeight: formatting.lineHeight,
    };

    switch (template) {
      case 'poetry':
        return { ...baseStyles, textAlign: 'center', fontStyle: 'italic' };
      case 'romance':
        return { ...baseStyles, letterSpacing: '0.5px' };
      case 'fantasy':
        return { ...baseStyles, fontWeight: 500, letterSpacing: '0.3px' };
      case 'academic':
        return { ...baseStyles, textAlign: 'justify' };
      default:
        return baseStyles;
    }
  };

  // Render preview content
  const renderPreviewContent = () => {
    const templateStyles = getTemplateStyles();
    
    if (state.book.content && state.book.content.trim()) {
      return (
        <Box>
          {state.book.title && (
            <Typography 
              variant="h4" 
              component="h1" 
              gutterBottom 
              sx={{ 
                textAlign: 'center', 
                mb: 2,
                fontFamily: templateStyles.fontFamily,
              }}
            >
              {state.book.title}
            </Typography>
          )}
          
          {state.book.author && (
            <Typography 
              variant="h6" 
              component="h2" 
              gutterBottom 
              sx={{ 
                textAlign: 'center', 
                mb: 3, 
                color: 'text.secondary',
                fontFamily: templateStyles.fontFamily,
              }}
            >
              by {state.book.author}
            </Typography>
          )}

          <Box sx={{ whiteSpace: 'pre-wrap' }}>
            {state.book.content.split('\n').slice(0, 10).map((paragraph, index) => {
              if (paragraph.trim() === '') {
                return <Box key={index} sx={{ height: '1em' }} />;
              }
              const prevPara = state.book.content.split('\n')[index - 1];
              const isFirstParagraph = !prevPara || prevPara.trim() === '';
              const shouldIndent = formatting.paragraphIndent > 0 && 
                                  !isFirstParagraph && 
                                  selectedTemplate !== 'poetry';
              
              return (
                <Typography 
                  key={index} 
                  paragraph 
                  sx={{ 
                    mb: 1.5,
                    ...templateStyles,
                    textAlign: selectedTemplate === 'poetry' ? 'center' : 'left',
                    textIndent: shouldIndent ? `${formatting.paragraphIndent}em` : '0em',
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

    // Sample content
    return (
      <Box>
        <Typography 
          variant="h4" 
          component="h1" 
          gutterBottom 
          sx={{ 
            textAlign: 'center', 
            mb: 2,
            fontFamily: templateStyles.fontFamily,
          }}
        >
          {state.book.title || 'Your Book Title'}
        </Typography>
        
        <Typography 
          variant="h6" 
          component="h2" 
          gutterBottom 
          sx={{ 
            textAlign: 'center', 
            mb: 3, 
            color: 'text.secondary',
            fontFamily: templateStyles.fontFamily,
          }}
        >
          by {state.book.author || 'Author Name'}
        </Typography>

        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h5" sx={{ mb: 2, fontFamily: templateStyles.fontFamily }}>
            Chapter One
          </Typography>
        </Box>

        <Typography 
          paragraph
          sx={{
            ...templateStyles,
            textIndent: formatting.paragraphIndent > 0 ? `${formatting.paragraphIndent}em` : '0em',
          }}
        >
          It was a dark and stormy night when Sarah first discovered the ancient book in her grandmother's attic. 
          The leather binding was worn and cracked, but something about it called to her.
        </Typography>
        
        <Typography 
          paragraph
          sx={{
            ...templateStyles,
            textIndent: formatting.paragraphIndent > 0 ? `${formatting.paragraphIndent}em` : '0em',
          }}
        >
          The words seemed to dance across the page, shifting and changing as she read. It was unlike anything 
          she had ever seen before. Each sentence told a story, and each story led to another.
        </Typography>
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
        sx={{ fontWeight: 600, color: 'primary.main', mb: 4 }}
      >
        Format & Preview
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
        {/* Left Column - Formatting Controls */}
        <Box sx={{ flex: { xs: '1 1 100%', md: '0 0 40%' }, maxWidth: { md: '500px' } }}>
          <Card sx={{ mb: 3, position: 'sticky', top: 100, maxHeight: 'calc(100vh - 120px)', overflow: 'auto' }}>
            <CardContent>
              <Typography variant="h5" component="h2" gutterBottom sx={{ mb: 3 }}>
                Template & Formatting
              </Typography>

              {/* Template Selection */}
              <Box sx={{ mb: 4 }}>
                <Typography variant="h6" component="h3" gutterBottom>
                  Genre Templates
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {templates.map((template) => (
                    <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 8px)' } }} key={template.id}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          border: selectedTemplate === template.id ? 2 : 1,
                          borderColor: selectedTemplate === template.id ? 'primary.main' : 'divider',
                          transition: 'all 0.2s',
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: 2,
                          },
                        }}
                        onClick={() => handleTemplateSelect(template.id)}
                      >
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <Chip
                              label={template.genre}
                              color={template.color}
                              size="small"
                              sx={{ mr: 1 }}
                            />
                            {selectedTemplate === template.id && (
                              <AutoAwesomeIcon color="primary" sx={{ ml: 'auto', fontSize: 20 }} />
                            )}
                          </Box>
                          <Typography variant="subtitle1" component="h4" gutterBottom>
                            {template.name}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />

              {/* Formatting Options */}
              <Typography variant="h6" component="h3" gutterBottom>
                Customize Formatting
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Font Family</InputLabel>
                <Select
                  value={formatting.fontFamily}
                  onChange={(e) => handleFormattingChange('fontFamily', e.target.value)}
                  label="Font Family"
                >
                  {fontFamilies.map((font) => (
                    <MenuItem key={font} value={font} sx={{ fontFamily: font }}>
                      {font}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>
                  Font Size: {formatting.fontSize}pt
                </Typography>
                <Slider
                  value={formatting.fontSize}
                  onChange={(_, value) => handleFormattingChange('fontSize', value)}
                  min={8}
                  max={18}
                  step={0.5}
                  marks={[
                    { value: 8, label: '8pt' },
                    { value: 12, label: '12pt' },
                    { value: 16, label: '16pt' },
                    { value: 18, label: '18pt' },
                  ]}
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>
                  Line Height: {formatting.lineHeight}
                </Typography>
                <Slider
                  value={formatting.lineHeight}
                  onChange={(_, value) => handleFormattingChange('lineHeight', value)}
                  min={1}
                  max={2.5}
                  step={0.1}
                  marks={[
                    { value: 1, label: '1.0' },
                    { value: 1.5, label: '1.5' },
                    { value: 2, label: '2.0' },
                    { value: 2.5, label: '2.5' },
                  ]}
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>
                  Paragraph Indent: {formatting.paragraphIndent}em
                </Typography>
                <Slider
                  value={formatting.paragraphIndent}
                  onChange={(_, value) => handleFormattingChange('paragraphIndent', value)}
                  min={0}
                  max={2}
                  step={0.1}
                  marks={[
                    { value: 0, label: '0em' },
                    { value: 0.5, label: '0.5em' },
                    { value: 1, label: '1em' },
                    { value: 1.5, label: '1.5em' },
                    { value: 2, label: '2em' },
                  ]}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  First line indent for paragraphs (0 = no indent)
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Margins (inches)
                </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <TextField
                      label="Top"
                      type="number"
                      value={formatting.marginTop}
                      onChange={(e) => handleFormattingChange('marginTop', parseFloat(e.target.value))}
                      inputProps={{ step: 0.1, min: 0.5, max: 2 }}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="Bottom"
                      type="number"
                      value={formatting.marginBottom}
                      onChange={(e) => handleFormattingChange('marginBottom', parseFloat(e.target.value))}
                      inputProps={{ step: 0.1, min: 0.5, max: 2 }}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="Left"
                      type="number"
                      value={formatting.marginLeft}
                      onChange={(e) => handleFormattingChange('marginLeft', parseFloat(e.target.value))}
                      inputProps={{ step: 0.1, min: 0.5, max: 2 }}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="Right"
                      type="number"
                      value={formatting.marginRight}
                      onChange={(e) => handleFormattingChange('marginRight', parseFloat(e.target.value))}
                      inputProps={{ step: 0.1, min: 0.5, max: 2 }}
                      fullWidth
                      size="small"
                    />
                  </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={() => navigate('/preview')}
                    fullWidth
                  >
                    Full Preview
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveAndContinue}
                    fullWidth
                  >
                    Export
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Right Column - Live Preview */}
        <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 60%' } }}>
          <Card sx={{ position: 'sticky', top: 100, maxHeight: 'calc(100vh - 120px)', overflow: 'auto' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <VisibilityIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h5" component="h2">
                  Live Preview
                </Typography>
              </Box>
              <Divider sx={{ mb: 3 }} />
              <Paper
                elevation={2}
                sx={{
                  p: 4,
                  minHeight: '400px',
                  backgroundColor: '#fff',
                  fontFamily: formatting.fontFamily,
                  fontSize: `${formatting.fontSize}pt`,
                  lineHeight: formatting.lineHeight,
                }}
              >
                {renderPreviewContent()}
              </Paper>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Container>
  );
};

export default Format;
