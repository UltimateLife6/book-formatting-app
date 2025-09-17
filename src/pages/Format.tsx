import React, { useState } from 'react';
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
} from '@mui/material';
import {
  AutoAwesome as AutoAwesomeIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
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

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    dispatch({
      type: 'SET_BOOK',
      payload: { template: templateId },
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
    navigate('/preview');
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography
        variant={isMobile ? 'h4' : 'h3'}
        component="h1"
        gutterBottom
        textAlign="center"
        sx={{ fontWeight: 600, color: 'primary.main' }}
      >
        Choose Your Template
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        paragraph
        sx={{ mb: 4 }}
      >
        Select a professional template that matches your book's genre
      </Typography>

      {/* Template Selection */}
      <Box sx={{ mb: 6 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Genre Templates
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {templates.map((template) => (
            <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 12px)', md: '1 1 calc(33.333% - 16px)' } }} key={template.id}>
              <Card
                sx={{
                  height: '100%',
                  cursor: 'pointer',
                  border: selectedTemplate === template.id ? 2 : 1,
                  borderColor: selectedTemplate === template.id ? 'primary.main' : 'divider',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 4,
                  },
                }}
                onClick={() => handleTemplateSelect(template.id)}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Chip
                      label={template.genre}
                      color={template.color}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    {selectedTemplate === template.id && (
                      <AutoAwesomeIcon color="primary" sx={{ ml: 'auto' }} />
                    )}
                  </Box>
                  <Typography variant="h6" component="h3" gutterBottom>
                    {template.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {template.description}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    {template.features.map((feature, index) => (
                      <Chip
                        key={index}
                        label={feature}
                        size="small"
                        variant="outlined"
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Formatting Options */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h5" component="h2" gutterBottom>
            Customize Formatting
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 calc(50% - 12px)' } }}>
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
            </Box>

            <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 calc(50% - 12px)' } }}>
              <Typography variant="h6" gutterBottom>
                Margins (inches)
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ flex: '1 1 calc(50% - 8px)' }}>
                  <TextField
                    label="Top"
                    type="number"
                    value={formatting.marginTop}
                    onChange={(e) => handleFormattingChange('marginTop', parseFloat(e.target.value))}
                    inputProps={{ step: 0.1, min: 0.5, max: 2 }}
                    fullWidth
                    size="small"
                  />
                </Box>
                <Box sx={{ flex: '1 1 calc(50% - 8px)' }}>
                  <TextField
                    label="Bottom"
                    type="number"
                    value={formatting.marginBottom}
                    onChange={(e) => handleFormattingChange('marginBottom', parseFloat(e.target.value))}
                    inputProps={{ step: 0.1, min: 0.5, max: 2 }}
                    fullWidth
                    size="small"
                  />
                </Box>
                <Box sx={{ flex: '1 1 calc(50% - 8px)' }}>
                  <TextField
                    label="Left"
                    type="number"
                    value={formatting.marginLeft}
                    onChange={(e) => handleFormattingChange('marginLeft', parseFloat(e.target.value))}
                    inputProps={{ step: 0.1, min: 0.5, max: 2 }}
                    fullWidth
                    size="small"
                  />
                </Box>
                <Box sx={{ flex: '1 1 calc(50% - 8px)' }}>
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

              <Box sx={{ mt: 3 }}>
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Drop caps for chapter starts"
                />
              </Box>
              <Box>
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label="Scene break indicators"
                />
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
        <Button
          variant="outlined"
          startIcon={<PreviewIcon />}
          onClick={() => navigate('/preview')}
          size="large"
        >
          Preview
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSaveAndContinue}
          size="large"
        >
          Save & Continue
        </Button>
      </Box>
    </Container>
  );
};

export default Format;
