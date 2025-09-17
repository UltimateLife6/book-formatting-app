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
    <Container maxWidth="lg" sx={{ py: 8 }}>
      {/* Hero Section */}
      <Box textAlign="center" mb={8}>
        <Typography
          variant={isMobile ? 'h3' : 'h2'}
          component="h1"
          gutterBottom
          sx={{ 
            fontWeight: 800, 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 3
          }}
        >
          Format Your Book Like a Pro
        </Typography>
        <Typography
          variant="h5"
          color="text.secondary"
          paragraph
          sx={{ 
            maxWidth: 700, 
            mx: 'auto',
            fontWeight: 400,
            lineHeight: 1.6,
            mb: 4
          }}
        >
          Create professional eBooks and print-ready files with our modern, intuitive platform.
          No technical skills required.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mb: 6 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<UploadIcon />}
            onClick={() => navigate('/import')}
            sx={{ 
              px: 4, 
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 600
            }}
          >
            Start Formatting
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<BookIcon />}
            onClick={() => navigate('/wizard')}
            sx={{ 
              px: 4, 
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 600
            }}
          >
            Quick Start Guide
          </Button>
        </Box>
      </Box>

      {/* Features Grid */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, mb: 8 }}>
        {features.map((feature, index) => (
          <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 16px)', md: '1 1 calc(25% - 24px)' } }} key={index}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                  background: 'rgba(255, 255, 255, 1)',
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1, textAlign: 'center', p: 4 }}>
                <Box sx={{ 
                  mb: 3,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: 80,
                  height: 80,
                  mx: 'auto',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.2)'
                }}>
                  {feature.icon}
                </Box>
                <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph sx={{ lineHeight: 1.6 }}>
                  {feature.description}
                </Typography>
              </CardContent>
              <CardActions sx={{ justifyContent: 'center', pb: 3, px: 3 }}>
                <Button
                  variant="outlined"
                  onClick={() => navigate(feature.path)}
                  fullWidth
                  sx={{ 
                    fontWeight: 600,
                    py: 1.5,
                    borderRadius: 2
                  }}
                >
                  {feature.action}
                </Button>
              </CardActions>
            </Card>
          </Box>
        ))}
      </Box>

      {/* Templates Section */}
      <Box mb={8}>
        <Typography variant="h4" component="h2" gutterBottom textAlign="center" sx={{ fontWeight: 700, mb: 2 }}>
          Professional Templates
        </Typography>
        <Typography
          variant="h6"
          color="text.secondary"
          textAlign="center"
          paragraph
          sx={{ maxWidth: 600, mx: 'auto', mb: 4 }}
        >
          Choose from genre-specific templates designed by publishing professionals
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            justifyContent: 'center',
            mt: 4,
          }}
        >
          {templates.map((template) => (
            <Chip
              key={template.name}
              label={template.name}
              color={template.color}
              variant="outlined"
              sx={{ 
                fontSize: '0.875rem',
                fontWeight: 500,
                px: 2,
                py: 1,
                height: 'auto',
                borderRadius: 3,
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                },
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Pricing Section */}
      <Card sx={{ 
        textAlign: 'center', 
        p: 6,
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        borderRadius: 4
      }}>
        <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
          Affordable for Every Author
        </Typography>
        <Typography variant="h6" color="text.secondary" paragraph sx={{ mb: 4 }}>
          Start free, upgrade when you need more features
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: 6, 
          mt: 4,
          flexWrap: 'wrap'
        }}>
          <Box sx={{ 
            p: 3, 
            borderRadius: 3,
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            minWidth: 200
          }}>
            <Typography variant="h3" color="primary.main" sx={{ fontWeight: 800, mb: 1 }}>
              Free
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
              Basic templates & exports
            </Typography>
          </Box>
          <Box sx={{ 
            p: 3, 
            borderRadius: 3,
            background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(219, 39, 119, 0.1) 100%)',
            border: '1px solid rgba(236, 72, 153, 0.2)',
            minWidth: 200
          }}>
            <Typography variant="h3" color="secondary.main" sx={{ fontWeight: 800, mb: 1 }}>
              $9.99
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
              Pro templates & unlimited exports
            </Typography>
          </Box>
        </Box>
      </Card>
    </Container>
  );
};

export default Home;
