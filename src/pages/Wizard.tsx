import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useBook } from '../context/BookContext';

const Wizard: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useBook();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    title: state.book.title,
    author: state.book.author,
    genre: state.book.genre,
    description: state.book.metadata.description || '',
    isbn: state.book.metadata.isbn || '',
    publisher: state.book.metadata.publisher || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const steps = [
    'Your book',
    'Genre & tone',
    'Optional details',
    'Ready to import',
  ];

  const genres = [
    { value: 'fiction', label: 'Fiction' },
    { value: 'romance', label: 'Romance' },
    { value: 'fantasy', label: 'Fantasy' },
    { value: 'mystery', label: 'Mystery' },
    { value: 'thriller', label: 'Thriller' },
    { value: 'sci-fi', label: 'Science Fiction' },
    { value: 'nonfiction', label: 'Non-Fiction' },
    { value: 'biography', label: 'Biography' },
    { value: 'poetry', label: 'Poetry' },
    { value: 'academic', label: 'Academic' },
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0:
        if (!formData.title.trim()) newErrors.title = 'Title is required';
        if (!formData.author.trim()) newErrors.author = 'Author name is required';
        break;
      case 1:
        if (!formData.genre) newErrors.genre = 'Please select a genre';
        break;
      case 2:
        // Optional fields, no validation needed
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(activeStep)) {
      if (activeStep === steps.length - 1) {
        // Save all data and proceed
        dispatch({
          type: 'SET_BOOK',
          payload: {
            title: formData.title,
            author: formData.author,
            genre: formData.genre,
            metadata: {
              description: formData.description,
              isbn: formData.isbn,
              publisher: formData.publisher,
            },
          },
        });
        navigate('/import');
      } else {
        setActiveStep(prev => prev + 1);
      }
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
              Start with the basics
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.7 }}>
              Your title and name appear on the cover, title page, and exports. You can change them later.
            </Typography>
            <TextField
              fullWidth
              label="Book Title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              error={!!errors.title}
              helperText={errors.title}
              sx={{ mb: 3 }}
            />
            <TextField
              fullWidth
              label="Author Name"
              value={formData.author}
              onChange={(e) => handleInputChange('author', e.target.value)}
              error={!!errors.author}
              helperText={errors.author}
            />
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
              What kind of book is this?
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph sx={{ lineHeight: 1.7 }}>
              Genre nudges trim size and template suggestions so your pages feel right for readers—not a rigid box.
            </Typography>
            <FormControl fullWidth error={!!errors.genre}>
              <InputLabel>Genre</InputLabel>
              <Select
                value={formData.genre}
                onChange={(e) => handleInputChange('genre', e.target.value)}
                label="Genre"
              >
                {genres.map((genre) => (
                  <MenuItem key={genre.value} value={genre.value}>
                    {genre.label}
                  </MenuItem>
                ))}
              </Select>
              {errors.genre && (
                <Typography variant="caption" color="error" sx={{ mt: 1, ml: 2 }}>
                  {errors.genre}
                </Typography>
              )}
            </FormControl>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
              Publishing details (optional)
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph sx={{ lineHeight: 1.7 }}>
              Add a blurb, ISBN, or imprint when you have them. Skip anything you do not need yet—this is all optional.
            </Typography>
            <TextField
              fullWidth
              label="Book Description"
              multiline
              rows={4}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              sx={{ mb: 3 }}
              helperText="A brief summary of your book"
            />
            <TextField
              fullWidth
              label="ISBN (if you have one)"
              value={formData.isbn}
              onChange={(e) => handleInputChange('isbn', e.target.value)}
              sx={{ mb: 3 }}
              helperText="International Standard Book Number"
            />
            <TextField
              fullWidth
              label="Publisher"
              value={formData.publisher}
              onChange={(e) => handleInputChange('publisher', e.target.value)}
              helperText="Your publishing company or self-published"
            />
          </Box>
        );

      case 3:
        return (
          <Box>
            <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
              Quick check before you continue
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.7 }}>
              When this looks right, you will head to import—where your manuscript becomes something you can shape into a real book.
            </Typography>
            <Card
              variant="outlined"
              sx={{ mb: 3, border: '1px solid rgba(44, 40, 37, 0.08)', bgcolor: '#fffefb', boxShadow: '0 8px 28px rgba(44, 40, 37, 0.06)' }}
            >
              <CardContent>
                <Typography variant="h5" component="p" gutterBottom sx={{ fontWeight: 600 }}>
                  {formData.title || 'Untitled Book'}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary" gutterBottom sx={{ fontStyle: 'italic' }}>
                  by {formData.author || 'Unknown Author'}
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Genre: {genres.find(g => g.value === formData.genre)?.label || 'Not selected'}
                </Typography>
                {formData.description && (
                  <Typography variant="body2" paragraph>
                    {formData.description}
                  </Typography>
                )}
                {formData.isbn && (
                  <Typography variant="body2" color="text.secondary">
                    ISBN: {formData.isbn}
                  </Typography>
                )}
                {formData.publisher && (
                  <Typography variant="body2" color="text.secondary">
                    Publisher: {formData.publisher}
                  </Typography>
                )}
              </CardContent>
            </Card>
            <Alert severity="info" sx={{ borderRadius: 2, '& .MuiAlert-message': { lineHeight: 1.7 } }}>
              You are ready for the next step: bring in your manuscript. There is no rush—import when you feel prepared.
            </Alert>
          </Box>
        );

      default:
        return null;
    }
  };

  const cardBorder = '1px solid rgba(44, 40, 37, 0.06)';

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 }, px: { xs: 2, sm: 3 } }}>
      <Box sx={{ textAlign: 'center', mb: 5, maxWidth: 560, mx: 'auto' }}>
        <Typography variant="overline" sx={{ letterSpacing: '0.16em', color: 'text.secondary', fontWeight: 600 }}>
          Guided setup
        </Typography>
        <Typography
          variant={isMobile ? 'h4' : 'h3'}
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, color: 'text.primary', mt: 1 }}
        >
          Let&apos;s turn your manuscript into a publish-ready book
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
          A few calm steps: who the book is for on the cover, what genre it lives in, optional publishing notes, then a
          quick review. Nothing here is final—you can adjust anytime.
        </Typography>
      </Box>

      <Stepper
        activeStep={activeStep}
        alternativeLabel={!isMobile}
        sx={{
          mb: { xs: 3, sm: 5 },
          '& .MuiStepLabel-label': { typography: 'caption', fontWeight: 500 },
          '& .MuiStepIcon-root.Mui-active': { color: 'primary.main' },
          '& .MuiStepIcon-root.Mui-completed': { color: 'secondary.main' },
        }}
      >
        {steps.map((label, index) => (
          <Step key={label}>
            <StepLabel>{isMobile ? `Step ${index + 1}` : label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Card sx={{ mb: 4, border: cardBorder, boxShadow: '0 8px 32px rgba(44, 40, 37, 0.06)' }}>
        <CardContent sx={{ minHeight: 320, py: { xs: 3, sm: 4 }, px: { xs: 2.5, sm: 3 } }}>
          {renderStepContent(activeStep)}
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
          startIcon={<ArrowBackIcon />}
          size="large"
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={handleNext}
          endIcon={activeStep === steps.length - 1 ? <CheckIcon /> : <ArrowForwardIcon />}
          size="large"
        >
          {activeStep === steps.length - 1 ? 'Continue to import' : 'Next'}
        </Button>
      </Box>
    </Container>
  );
};

export default Wizard;
