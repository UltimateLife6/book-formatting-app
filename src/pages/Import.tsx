import React, { useState, useRef } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Upload as UploadIcon,
  Google as GoogleIcon,
  Description as DocIcon,
  TextFields as TextIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useBook } from '../context/BookContext';
import { useError } from '../context/ErrorContext';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { validateFileType, validateFileSize, handleFileProcessingError } from '../utils/errorUtils';
import { getAllowedFileTypes } from '../config/appConfig';
import mammoth from 'mammoth';

const Import: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useBook();
  const { showError } = useError();
  const { createFileUploadError } = useErrorHandler();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_FILE_TYPES = getAllowedFileTypes();
  const MAX_FILE_SIZE_MB = 10; // This will be updated to use config

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setSuccess(null);

    try {
      // Validate file type
      const typeError = validateFileType(file, ALLOWED_FILE_TYPES);
      if (typeError) {
        showError(typeError);
        return;
      }

      // Validate file size
      const sizeError = validateFileSize(file, MAX_FILE_SIZE_MB);
      if (sizeError) {
        showError(sizeError);
        return;
      }

      let content = '';
      
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Handle .docx files
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
        
        if (result.messages.length > 0) {
          console.warn('Mammoth warnings:', result.messages);
        }
      } else if (file.type === 'text/plain') {
        // Handle .txt files
        content = await file.text();
      } else if (file.type === 'application/msword') {
        // Handle .doc files (basic support)
        throw new Error('Legacy .doc files are not supported. Please convert to .docx format.');
      } else if (file.type === 'text/rtf') {
        // Handle .rtf files (basic support)
        content = await file.text();
      } else {
        throw new Error('Unsupported file type. Please upload a .docx, .txt, or .rtf file.');
      }

      if (!content.trim()) {
        throw new Error('The file appears to be empty or could not be read.');
      }

      dispatch({
        type: 'SET_BOOK',
        payload: {
          content,
          title: file.name.replace(/\.[^/.]+$/, ''),
        },
      });

      setSuccess('Manuscript imported successfully!');
      setTimeout(() => navigate('/format'), 1500);
    } catch (err) {
      const error = handleFileProcessingError(err, file.name);
      showError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePasteText = () => {
    if (!pastedText.trim()) {
      const error = createFileUploadError(
        'No text provided',
        'Please enter some text to import'
      );
      showError(error);
      return;
    }

    dispatch({
      type: 'SET_BOOK',
      payload: {
        content: pastedText,
        title: 'Imported Manuscript',
      },
    });

    setSuccess('Text imported successfully!');
    setTimeout(() => navigate('/format'), 1500);
  };

  const handleGoogleDocsImport = () => {
    // Placeholder for Google Docs integration
    const error = createFileUploadError(
      'Google Docs integration not available',
      'Google Docs integration coming soon! For now, please copy and paste your content.'
    );
    showError(error);
  };

  const importMethods = [
    {
      icon: <UploadIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
      title: 'Upload File',
      description: 'Upload .docx or .txt files',
      action: () => fileInputRef.current?.click(),
      buttonText: 'Choose File',
    },
    {
      icon: <GoogleIcon sx={{ fontSize: 40, color: 'error.main' }} />,
      title: 'Google Docs',
      description: 'Import directly from Google Docs',
      action: handleGoogleDocsImport,
      buttonText: 'Connect Google',
    },
    {
      icon: <TextIcon sx={{ fontSize: 40, color: 'success.main' }} />,
      title: 'Paste Text',
      description: 'Copy and paste your manuscript',
      action: () => {},
      buttonText: 'Use Text Input',
    },
  ];

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography
        variant={isMobile ? 'h4' : 'h3'}
        component="h1"
        gutterBottom
        textAlign="center"
        sx={{ fontWeight: 600, color: 'primary.main' }}
      >
        Import Your Manuscript
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        paragraph
        sx={{ mb: 4 }}
      >
        Choose how you'd like to import your book content
      </Typography>


      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      {isProcessing && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Processing your manuscript...
          </Typography>
        </Box>
      )}

      {/* Import Methods */}
      <Box sx={{ mb: 4 }}>
        {importMethods.map((method, index) => (
          <Card key={index} sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                {method.icon}
                <Box sx={{ ml: 2 }}>
                  <Typography variant="h6" component="h3">
                    {method.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {method.description}
                  </Typography>
                </Box>
              </Box>
              <Button
                variant="outlined"
                onClick={method.action}
                fullWidth
                disabled={isProcessing}
              >
                {method.buttonText}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Text Input Section */}
      <Card>
        <CardContent>
          <Typography variant="h6" component="h3" gutterBottom>
            Or paste your text directly
          </Typography>
          <TextField
            multiline
            rows={8}
            fullWidth
            placeholder="Paste your manuscript content here..."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            variant="outlined"
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            onClick={handlePasteText}
            disabled={isProcessing || !pastedText.trim()}
            fullWidth
            startIcon={<TextIcon />}
          >
            Import Pasted Text
          </Button>
        </CardContent>
      </Card>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".docx,.txt"
        style={{ display: 'none' }}
      />

      {/* Supported Formats */}
      <Card sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" component="h3" gutterBottom>
            Supported Formats
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon>
                <DocIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="Microsoft Word (.docx)"
                secondary="Full formatting support"
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemIcon>
                <TextIcon color="success" />
              </ListItemIcon>
              <ListItemText
                primary="Plain Text (.txt)"
                secondary="Basic text import"
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemIcon>
                <GoogleIcon color="error" />
              </ListItemIcon>
              <ListItemText
                primary="Google Docs"
                secondary="Coming soon - direct integration"
              />
            </ListItem>
          </List>
        </CardContent>
      </Card>
    </Container>
  );
};

export default Import;
