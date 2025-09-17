import React, { useState, useEffect } from 'react';
import {
  Snackbar,
  Alert,
  AlertTitle,
  IconButton,
  Box,
  Typography,
  Button,
} from '@mui/material';
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { CustomError, ErrorType } from '../types/errors';

interface ErrorToastProps {
  error: CustomError | null;
  onClose: () => void;
  onRetry?: () => void;
  autoHideDuration?: number;
}

const ErrorToast: React.FC<ErrorToastProps> = ({
  error,
  onClose,
  onRetry,
  autoHideDuration = 6000,
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (error) {
      setOpen(true);
    }
  }, [error]);

  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
    onClose();
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
    handleClose();
  };

  if (!error) return null;

  const getSeverity = (type: ErrorType) => {
    switch (type) {
      case ErrorType.NETWORK:
      case ErrorType.AUTHENTICATION:
        return 'error';
      case ErrorType.VALIDATION:
      case ErrorType.FILE_UPLOAD:
        return 'warning';
      case ErrorType.EXPORT:
      case ErrorType.FILE_PROCESSING:
        return 'error';
      default:
        return 'error';
    }
  };

  const getIcon = (type: ErrorType) => {
    switch (type) {
      case ErrorType.NETWORK:
        return <ErrorIcon />;
      case ErrorType.VALIDATION:
      case ErrorType.FILE_UPLOAD:
        return <WarningIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const severity = getSeverity(error.type);
  const icon = getIcon(error.type);

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ mt: 8 }}
    >
      <Alert
        severity={severity}
        icon={icon}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {error.retryable && onRetry && (
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                onClick={handleRetry}
                color="inherit"
              >
                Retry
              </Button>
            )}
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleClose}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
        sx={{ minWidth: 300, maxWidth: 500 }}
      >
        <AlertTitle>
          {error.type === ErrorType.NETWORK && 'Connection Error'}
          {error.type === ErrorType.VALIDATION && 'Validation Error'}
          {error.type === ErrorType.FILE_UPLOAD && 'Upload Error'}
          {error.type === ErrorType.FILE_PROCESSING && 'Processing Error'}
          {error.type === ErrorType.EXPORT && 'Export Error'}
          {error.type === ErrorType.AUTHENTICATION && 'Authentication Error'}
          {error.type === ErrorType.PERMISSION && 'Permission Error'}
          {error.type === ErrorType.UNKNOWN && 'Error'}
        </AlertTitle>
        <Typography variant="body2">
          {error.userMessage}
        </Typography>
        {process.env.NODE_ENV === 'development' && error.details && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.7 }}>
            Details: {JSON.stringify(error.details, null, 2)}
          </Typography>
        )}
      </Alert>
    </Snackbar>
  );
};

export default ErrorToast;
