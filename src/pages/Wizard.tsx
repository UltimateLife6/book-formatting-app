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
    'Book Details',
    'Genre & Style',
    'Metadata',
    'Review & Start',
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
            <Typography variant="h6" gutterBottom>
              Tell us about your book
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
            <Typography variant="h6" gutterBottom>
              What genre is your book?
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              This helps us suggest the best formatting template for your book.
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
            <Typography variant="h6" gutterBottom>
              Additional Information (Optional)
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Add metadata to help with publishing and distribution.
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
            <Typography variant="h6" gutterBottom>
              Review Your Book Details
            </Typography>
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  {formData.title || 'Untitled Book'}
                </Typography>
                <Typography variant="h6" color="text.secondary" gutterBottom>
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
            <Alert severity="info">
              Ready to start formatting your book! Next, you'll import your manuscript content.
            </Alert>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography
        variant={isMobile ? 'h4' : 'h3'}
        component="h1"
        gutterBottom
        textAlign="center"
        sx={{ fontWeight: 600, color: 'primary.main' }}
      >
        Book Setup Wizard
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        paragraph
        sx={{ mb: 4 }}
      >
        Let's set up your book step by step
      </Typography>

      {/* Stepper */}
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label, index) => (
          <Step key={label}>
            <StepLabel>{isMobile ? `Step ${index + 1}` : label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step Content */}
      <Card sx={{ mb: 4 }}>
        <CardContent sx={{ minHeight: 300 }}>
          {renderStepContent(activeStep)}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
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
          {activeStep === steps.length - 1 ? 'Start Formatting' : 'Next'}
        </Button>
      </Box>
    </Container>
  );
};

export default Wizard;
