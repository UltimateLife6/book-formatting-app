import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  CircularProgress,
  Typography,
  Box,
  Alert,
  Divider,
} from '@mui/material';
import {
  Google as GoogleIcon,
  Description as DocIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { GoogleDocument, fetchGoogleDocs, isGoogleDocsConfigured } from '../utils/googleDocsService';
import { useError } from '../context/ErrorContext';
import { ErrorType, CustomError } from '../types/errors';

interface GoogleDocsPickerProps {
  open: boolean;
  onClose: () => void;
  onDocumentSelect: (document: GoogleDocument) => void;
}

const GoogleDocsPicker: React.FC<GoogleDocsPickerProps> = ({
  open,
  onClose,
  onDocumentSelect,
}) => {
  const [documents, setDocuments] = useState<GoogleDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showError } = useError();

  const loadDocuments = async () => {
    if (!isGoogleDocsConfigured()) {
      setError('Google Docs integration is not configured. Please set up Google API credentials in your environment variables.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Starting Google Docs authentication...');
      const docs = await fetchGoogleDocs();
      console.log('Successfully loaded Google Docs:', docs.length, 'documents');
      setDocuments(docs);
    } catch (err: any) {
      console.error('Google Docs error:', err);
      const errorMessage = err.message || 'Failed to load Google Docs';
      setError(errorMessage);
      const error = new CustomError(
        ErrorType.VALIDATION,
        errorMessage,
        'Failed to load Google Docs. Please try again.',
        true,
        'GOOGLE_DOCS_LOAD_ERROR',
        err
      );
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadDocuments();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDocumentSelect = (document: GoogleDocument) => {
    onDocumentSelect(document);
    onClose();
  };

  const handleRefresh = () => {
    loadDocuments();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '500px' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <GoogleIcon color="primary" />
        <Typography variant="h6">Select Google Doc</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
          size="small"
        >
          Refresh
        </Button>
      </DialogTitle>

      <DialogContent>
        {!isGoogleDocsConfigured() && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Google Docs integration is not configured. Please set up Google API credentials
            in your environment variables.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
            <Typography variant="body2" sx={{ ml: 2, alignSelf: 'center' }}>
              Loading your Google Docs...
            </Typography>
          </Box>
        )}

        {!loading && !error && documents.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <DocIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Google Docs found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Make sure you have Google Docs in your Google Drive and try refreshing.
            </Typography>
          </Box>
        )}

        {!loading && documents.length > 0 && (
          <List>
            {documents.map((doc, index) => (
              <React.Fragment key={doc.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleDocumentSelect(doc)}
                    sx={{ py: 2 }}
                  >
                    <DocIcon sx={{ mr: 2, color: 'primary.main' }} />
                    <ListItemText
                      primary={doc.title}
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            Modified: {formatDate(doc.modifiedTime)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {doc.content.length > 0 ? `${doc.content.length} characters` : 'Empty document'}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
                {index < documents.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default GoogleDocsPicker;
