import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Button,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Download as DownloadIcon,
  PictureAsPdf as PdfIcon,
  Description as DocIcon,
  MenuBook as EpubIcon,
  CloudDownload as CloudIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useBook } from '../context/BookContext';
import { useError } from '../context/ErrorContext';
import { handleExportError } from '../utils/errorUtils';
import html2pdf from 'html2pdf.js';

const Export: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useBook();
  const { showError } = useError();
  // const { } = useErrorHandler(); // Removed unused destructuring
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const exportOptions = [
    {
      id: 'epub',
      name: 'ePub 3.0',
      description: 'Industry standard for eBooks',
      icon: <EpubIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
      features: ['Kindle compatible', 'iBooks compatible', 'Universal format'],
      color: 'primary' as const,
      free: true,
    },
    {
      id: 'pdf',
      name: 'PDF (Print Ready)',
      description: 'High-quality print formatting',
      icon: <PdfIcon sx={{ fontSize: 40, color: 'error.main' }} />,
      features: ['Print quality', 'Custom trim sizes', 'Professional layout'],
      color: 'error' as const,
      free: true,
    },
    {
      id: 'docx',
      name: 'Microsoft Word',
      description: 'Editable document format',
      icon: <DocIcon sx={{ fontSize: 40, color: 'info.main' }} />,
      features: ['Fully editable', 'Track changes', 'Collaboration ready'],
      color: 'info' as const,
      free: true,
    },
  ];

  const handleExport = async (format: string) => {
    setIsExporting(true);
    setExportStatus(`Preparing ${format.toUpperCase()} export...`);

    try {
      // Simulate export process
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (format === 'pdf') {
        await exportToPDF();
      } else if (format === 'epub') {
        await exportToEPUB();
      } else if (format === 'docx') {
        await exportToDOCX();
      }

      setExportStatus(`${format.toUpperCase()} exported successfully!`);
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      const error = handleExportError(err, format.toUpperCase());
      showError(error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    try {
      const element = document.createElement('div');
      element.innerHTML = `
        <div style="font-family: ${state.book.formatting.fontFamily}; font-size: ${state.book.formatting.fontSize}pt; line-height: ${state.book.formatting.lineHeight}; padding: 20px;">
          <h1 style="text-align: center; margin-bottom: 2em;">${state.book.title || 'Your Book Title'}</h1>
          <h2 style="text-align: center; margin-bottom: 3em; color: #666;">by ${state.book.author || 'Author Name'}</h2>
          <div style="margin-top: 4em;">
            ${state.book.content || 'Your book content will appear here...'}
          </div>
        </div>
      `;

      const opt = {
        margin: [state.book.formatting.marginTop, state.book.formatting.marginRight, state.book.formatting.marginBottom, state.book.formatting.marginLeft] as [number, number, number, number],
        filename: `${state.book.title || 'book'}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      const error = handleExportError(err, 'PDF');
      showError(error);
    }
  };

  const exportToEPUB = async () => {
    try {
      // Simulate EPUB export
      const blob = new Blob(['ePub content would be generated here'], { type: 'application/epub+zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.book.title || 'book'}.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = handleExportError(err, 'EPUB');
      showError(error);
    }
  };

  const exportToDOCX = async () => {
    try {
      // Simulate DOCX export
      const blob = new Blob(['DOCX content would be generated here'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.book.title || 'book'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = handleExportError(err, 'DOCX');
      showError(error);
    }
  };

  const downloadAll = async () => {
    setIsExporting(true);
    
    try {
      for (const option of exportOptions) {
        setExportStatus(`Exporting ${option.name}...`);
        await handleExport(option.id);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setExportStatus('All formats exported successfully!');
    } catch (err) {
      const error = handleExportError(err, 'Multiple formats');
      showError(error);
    } finally {
      setIsExporting(false);
    }
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
        Export Your Book
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        paragraph
        sx={{ mb: 4 }}
      >
        Choose your preferred format and download your professionally formatted book
      </Typography>


      {exportStatus && (
        <Alert 
          severity={exportStatus.includes('successfully') ? 'success' : 'info'} 
          sx={{ mb: 3 }}
        >
          {exportStatus}
        </Alert>
      )}

      {isExporting && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {exportStatus || 'Exporting...'}
          </Typography>
        </Box>
      )}

      {/* Export Options */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
        {exportOptions.map((option) => (
          <Box sx={{ flex: { xs: '1 1 100%', md: '1 1 calc(33.333% - 16px)' } }} key={option.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ textAlign: 'center', mb: 2 }}>
                  {option.icon}
                  {option.free && (
                    <Chip
                      label="FREE"
                      color="success"
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  )}
                </Box>
                <Typography variant="h6" component="h3" gutterBottom>
                  {option.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {option.description}
                </Typography>
                <List dense>
                  {option.features.map((feature, index) => (
                    <ListItem key={index} sx={{ py: 0.5, px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={feature}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
              <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
                <Button
                  variant="contained"
                  color={option.color}
                  startIcon={<DownloadIcon />}
                  onClick={() => handleExport(option.id)}
                  disabled={isExporting}
                  fullWidth
                >
                  Export {option.name}
                </Button>
              </CardActions>
            </Card>
          </Box>
        ))}
      </Box>

      {/* Download All Button */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Button
          variant="outlined"
          size="large"
          startIcon={<CloudIcon />}
          onClick={downloadAll}
          disabled={isExporting}
          sx={{ mr: 2, mb: 2 }}
        >
          Download All Formats
        </Button>
      </Box>

      {/* Publishing Tips */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" component="h3" gutterBottom>
            Publishing Tips
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon>
                <CheckIcon color="success" />
              </ListItemIcon>
              <ListItemText
                primary="ePub files work on all major eBook platforms"
                secondary="Kindle, Apple Books, Google Play Books, Kobo, and more"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckIcon color="success" />
              </ListItemIcon>
              <ListItemText
                primary="PDF files are perfect for print-on-demand services"
                secondary="Amazon KDP, IngramSpark, and other print services"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckIcon color="success" />
              </ListItemIcon>
              <ListItemText
                primary="Word documents allow for easy editing and collaboration"
                secondary="Perfect for working with editors or making quick changes"
              />
            </ListItem>
          </List>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          onClick={() => navigate('/preview')}
          size="large"
        >
          Back to Preview
        </Button>
        <Button
          variant="contained"
          onClick={() => navigate('/')}
          size="large"
        >
          Start New Book
        </Button>
      </Box>
    </Container>
  );
};

export default Export;
