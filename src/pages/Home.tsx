import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Upload as UploadIcon,
  AutoAwesome as AutoAwesomeIcon,
  Visibility as VisibilityIcon,
  Download as DownloadIcon,
  Book as BookIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const features = [
    {
      icon: <UploadIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
      title: 'Import Manuscript',
      description: 'Upload from Google Docs, Word, or paste text directly',
      action: 'Start Import',
      path: '/import',
    },
    {
      icon: <AutoAwesomeIcon sx={{ fontSize: 40, color: 'secondary.main' }} />,
      title: 'Smart Formatting',
      description: 'Professional templates for every genre',
      action: 'Choose Template',
      path: '/format',
    },
    {
      icon: <VisibilityIcon sx={{ fontSize: 40, color: 'success.main' }} />,
      title: 'Live Preview',
      description: 'See your book in eBook and print formats',
      action: 'Preview',
      path: '/preview',
    },
    {
      icon: <DownloadIcon sx={{ fontSize: 40, color: 'warning.main' }} />,
      title: 'Export & Publish',
      description: 'Generate ePub, PDF, and more',
      action: 'Export',
      path: '/export',
    },
  ];

  const templates = [
    { name: 'Fiction', color: 'primary' as const },
    { name: 'Romance', color: 'secondary' as const },
    { name: 'Fantasy', color: 'success' as const },
    { name: 'Non-fiction', color: 'info' as const },
    { name: 'Poetry', color: 'warning' as const },
    { name: 'Academic', color: 'default' as const },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Hero Section */}
      <Box textAlign="center" mb={6}>
        <Typography
          variant={isMobile ? 'h4' : 'h3'}
          component="h1"
          gutterBottom
          sx={{ fontWeight: 700, color: 'primary.main' }}
        >
          Format Your Book Like a Pro
        </Typography>
        <Typography
          variant={isMobile ? 'h6' : 'h5'}
          color="text.secondary"
          paragraph
          sx={{ maxWidth: 600, mx: 'auto' }}
        >
          Create professional eBooks and print-ready files on your phone or tablet.
          No technical skills required.
        </Typography>
        <Box sx={{ mt: 4 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<BookIcon />}
            onClick={() => navigate('/wizard')}
            sx={{ mr: 2, mb: 2 }}
          >
            Start New Book
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<UploadIcon />}
            onClick={() => navigate('/import')}
            sx={{ mb: 2 }}
          >
            Import Manuscript
          </Button>
        </Box>
      </Box>

      {/* Features Grid */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 6 }}>
        {features.map((feature, index) => (
          <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 12px)', md: '1 1 calc(25% - 18px)' } }} key={index}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
                <Box sx={{ mb: 2 }}>{feature.icon}</Box>
                <Typography variant="h6" component="h3" gutterBottom>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {feature.description}
                </Typography>
              </CardContent>
              <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => navigate(feature.path)}
                  fullWidth
                >
                  {feature.action}
                </Button>
              </CardActions>
            </Card>
          </Box>
        ))}
      </Box>

      {/* Templates Section */}
      <Box mb={6}>
        <Typography variant="h5" component="h2" gutterBottom textAlign="center">
          Professional Templates
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          textAlign="center"
          paragraph
        >
          Choose from genre-specific templates designed by publishing professionals
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            justifyContent: 'center',
            mt: 3,
          }}
        >
          {templates.map((template) => (
            <Chip
              key={template.name}
              label={template.name}
              color={template.color}
              variant="outlined"
              sx={{ fontSize: '0.875rem' }}
            />
          ))}
        </Box>
      </Box>

      {/* Pricing Section */}
      <Card sx={{ textAlign: 'center', p: 4 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Affordable for Every Author
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Start free, upgrade when you need more features
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4, mt: 3 }}>
          <Box>
            <Typography variant="h4" color="primary.main">
              Free
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Basic templates & exports
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" color="secondary.main">
              $9.99
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pro templates & unlimited exports
            </Typography>
          </Box>
        </Box>
      </Card>
    </Container>
  );
};

export default Home;
