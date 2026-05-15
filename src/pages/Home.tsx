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
  Paper,
  Stack,
} from '@mui/material';
import {
  Upload as UploadIcon,
  AutoAwesome as AutoAwesomeIcon,
  Visibility as VisibilityIcon,
  Download as DownloadIcon,
  Book as BookIcon,
  MenuBook as MenuBookIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const workflowSteps = [
  { label: 'Import', detail: 'Word, paste, or Docs' },
  { label: 'Choose style', detail: 'Genre templates' },
  { label: 'Review chapters', detail: 'Organize in order' },
  { label: 'Preview', detail: 'eBook & print pages' },
  { label: 'Export', detail: 'EPUB, PDF, Word' },
];

const Home: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const features = [
    {
      icon: <UploadIcon sx={{ fontSize: 36, color: 'primary.main' }} />,
      title: 'Bring your manuscript in',
      description: 'Drop a .docx, paste your draft, or pull from Google Docs when connected. We keep your words in order.',
      action: 'Import manuscript',
      path: '/import',
    },
    {
      icon: <AutoAwesomeIcon sx={{ fontSize: 36, color: 'secondary.main' }} />,
      title: 'Choose a book-ready look',
      description: 'Genre templates set fonts, spacing, and margins so you are not fighting styles in Word.',
      action: 'Pick a template',
      path: '/format',
    },
    {
      icon: <MenuBookIcon sx={{ fontSize: 36, color: 'info.main' }} />,
      title: 'Shape your chapters',
      description: 'Drag chapters, add front matter or parts, and edit on a clean page built for long-form reading.',
      action: 'Open manuscript',
      path: '/manuscript',
    },
    {
      icon: <VisibilityIcon sx={{ fontSize: 36, color: 'success.main' }} />,
      title: 'See real pages',
      description: 'Flip between eBook and print views so margins and page breaks look right before you publish.',
      action: 'Open preview',
      path: '/preview',
    },
    {
      icon: <DownloadIcon sx={{ fontSize: 36, color: 'warning.main' }} />,
      title: 'Download for readers',
      description: 'Export EPUB for stores, PDF for print proofs, or DOCX if your editor still lives in Word.',
      action: 'Go to export',
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
    <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 }, px: { xs: 2, sm: 3 } }}>
      {/* Hero */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1.05fr' },
          gap: { xs: 4, md: 6 },
          alignItems: 'center',
          mb: { xs: 6, md: 9 },
        }}
      >
        <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
          <Typography
            variant="overline"
            sx={{
              letterSpacing: '0.2em',
              color: 'text.secondary',
              fontWeight: 600,
              display: 'block',
              mb: 1.5,
            }}
          >
            For indie authors
          </Typography>
          <Typography
            variant={isMobile ? 'h3' : 'h2'}
            component="h1"
            sx={{
              fontWeight: 600,
              lineHeight: 1.15,
              mb: 2,
              color: 'text.primary',
            }}
          >
            Turn your manuscript into a publish-ready book
          </Typography>
          <Typography
            variant="h6"
            component="p"
            sx={{
              fontWeight: 400,
              lineHeight: 1.65,
              color: 'text.secondary',
              mb: 2,
              maxWidth: 520,
              mx: { xs: 'auto', md: 0 },
            }}
          >
            Format your book without fighting Word, margins, or weird exports. One calm workflow from draft to
            files you can actually upload.
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ justifyContent: { xs: 'center', md: 'flex-start' }, mb: 3 }}
          >
            <Button
              variant="contained"
              size="large"
              startIcon={<UploadIcon />}
              onClick={() => navigate('/import')}
              sx={{ px: 3, py: 1.5, fontWeight: 600 }}
            >
              Start with your manuscript
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<BookIcon />}
              onClick={() => navigate('/wizard')}
              sx={{ px: 3, py: 1.5, fontWeight: 600 }}
            >
              Book details first
            </Button>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            sx={{ justifyContent: { xs: 'center', md: 'flex-start' }, gap: 1 }}
          >
            {['Beginner-friendly', 'Mobile-friendly', 'No complex Word styles', 'Built for indie authors'].map(
              (t) => (
                <Chip
                  key={t}
                  label={t}
                  size="small"
                  variant="outlined"
                  sx={{
                    borderColor: 'rgba(92, 83, 76, 0.22)',
                    color: 'text.secondary',
                    fontWeight: 500,
                    bgcolor: 'rgba(255, 253, 248, 0.8)',
                  }}
                />
              )
            )}
          </Stack>
        </Box>

        {/* Before / after — book as hero */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="subtitle2" color="text.secondary" sx={{ letterSpacing: 0.08, fontWeight: 600 }}>
            From draft to shelf-ready layout
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems="stretch"
            sx={{ width: '100%', maxWidth: 520, justifyContent: 'center' }}
          >
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                minHeight: 220,
                p: 2,
                borderRadius: 2,
                bgcolor: 'grey.100',
                border: '1px dashed',
                borderColor: 'grey.400',
                maxWidth: 220,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.06 }}>
                RAW DRAFT
              </Typography>
              <Typography
                component="pre"
                sx={{
                  mt: 1.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: '0.7rem',
                  lineHeight: 1.5,
                  color: 'text.secondary',
                  whiteSpace: 'pre-wrap',
                  m: 0,
                }}
              >
                {`CHAPTER 1\n\nThe train was late again. She checked her phone—no signal.\n\n"Typical," she muttered...`}
              </Typography>
            </Paper>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.disabled',
                py: { xs: 0.5, sm: 0 },
              }}
            >
              <ArrowForwardIcon sx={{ transform: { xs: 'rotate(90deg)', sm: 'none' } }} />
            </Box>
            <Paper
              elevation={4}
              sx={{
                flex: 1,
                minHeight: 260,
                p: 2.5,
                borderRadius: 1,
                bgcolor: '#fffefb',
                border: '1px solid',
                borderColor: 'rgba(44, 40, 37, 0.08)',
                boxShadow: '0 12px 40px rgba(44, 40, 37, 0.12)',
                maxWidth: 240,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                  fontWeight: 700,
                  textAlign: 'center',
                  letterSpacing: 0.04,
                  mb: 1,
                }}
              >
                Chapter One
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: 'block', textAlign: 'center', color: 'text.secondary', mb: 2, fontStyle: 'italic' }}
              >
                The morning edition
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: '0.8rem',
                  lineHeight: 1.65,
                  textAlign: 'justify',
                  color: 'text.primary',
                  textIndent: '0.9em',
                }}
              >
                The train was late again. She checked her phone—no signal. Margins held the line; the page felt
                like a book, not a document.
              </Typography>
            </Paper>
          </Stack>
        </Box>
      </Box>

      {/* Workflow */}
      <Box
        sx={{
          mb: { xs: 6, md: 8 },
          py: { xs: 3, md: 4 },
          px: { xs: 2, md: 4 },
          borderRadius: 3,
          bgcolor: 'rgba(255, 255, 255, 0.65)',
          border: '1px solid',
          borderColor: 'rgba(44, 40, 37, 0.06)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset',
        }}
      >
        <Typography variant="h5" component="h2" textAlign="center" sx={{ fontWeight: 600, mb: 0.5 }}>
          A simple path from manuscript to export
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3, maxWidth: 640, mx: 'auto' }}>
          Import → choose style → review chapters → preview → export. Stay in one tool; skip the scary parts of Word.
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: { xs: 2, md: 1 },
            rowGap: 2,
          }}
        >
          {workflowSteps.map((step, i) => (
            <React.Fragment key={step.label}>
              {i > 0 && (
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ display: { xs: 'none', md: 'inline' }, color: 'text.disabled', alignSelf: 'center', px: 0.5 }}
                >
                  ·
                </Typography>
              )}
              <Box sx={{ flex: { xs: '1 1 45%', md: '0 1 auto' }, minWidth: { xs: '40%', md: 0 }, textAlign: 'center', px: { md: 1 } }}>
                <Typography variant="caption" color="primary" sx={{ fontWeight: 700, letterSpacing: 0.04 }}>
                  {String(i + 1).padStart(2, '0')}
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, display: 'block', mt: 0.5 }}>
                  {step.label}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {step.detail}
                </Typography>
              </Box>
            </React.Fragment>
          ))}
        </Box>
      </Box>

      {/* Features */}
      <Typography variant="h4" component="h2" textAlign="center" sx={{ fontWeight: 600, mb: 1 }}>
        Everything you need to polish the book
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        sx={{ maxWidth: 640, mx: 'auto', mb: 4 }}
      >
        Publish-ready exports, not another admin dashboard. Work the way readers will see your story.
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 8 }}>
        {features.map((feature, index) => (
          <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 12px)', md: '1 1 calc(33.333% - 16px)' } }} key={index}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'rgba(255, 253, 248, 0.92)',
                border: '1px solid rgba(44, 40, 37, 0.06)',
                boxShadow: '0 8px 30px rgba(44, 40, 37, 0.06)',
                transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 16px 40px rgba(44, 40, 37, 0.1)',
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1, p: 3 }}>
                <Box
                  sx={{
                    mb: 2,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    width: 64,
                    height: 64,
                    borderRadius: 2,
                    bgcolor: 'rgba(99, 102, 241, 0.06)',
                    border: '1px solid rgba(99, 102, 241, 0.12)',
                  }}
                >
                  {feature.icon}
                </Box>
                <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                  {feature.description}
                </Typography>
              </CardContent>
              <CardActions sx={{ justifyContent: 'flex-start', pb: 2.5, px: 3, pt: 0 }}>
                <Button variant="text" onClick={() => navigate(feature.path)} sx={{ fontWeight: 600 }}>
                  {feature.action}
                </Button>
              </CardActions>
            </Card>
          </Box>
        ))}
      </Box>

      {/* Genres */}
      <Box mb={8}>
        <Typography variant="h5" component="h2" gutterBottom textAlign="center" sx={{ fontWeight: 600 }}>
          Styles tuned for how you write
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 560, mx: 'auto', mb: 3 }}>
          Fiction, romance, fantasy, and more—each template respects genre conventions so your file looks at home next
          to traditionally published titles.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center' }}>
          {templates.map((template) => (
            <Chip
              key={template.name}
              label={template.name}
              color={template.color}
              variant="outlined"
              sx={{
                fontWeight: 500,
                px: 1,
                py: 2.5,
                height: 'auto',
                borderRadius: 2,
                borderColor: 'rgba(44, 40, 37, 0.12)',
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Trust closing */}
      <Card
        sx={{
          textAlign: 'center',
          p: { xs: 4, md: 5 },
          bgcolor: 'rgba(255, 253, 248, 0.95)',
          border: '1px solid rgba(44, 40, 37, 0.06)',
          borderRadius: 3,
          boxShadow: 'none',
        }}
      >
        <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          Finally, book formatting can feel simple
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph sx={{ maxWidth: 560, mx: 'auto', mb: 2 }}>
          No subscriptions pitch on this screen—just your manuscript, clear controls, and files you can hand to a
          printer or upload to a store. Your story stays front and center.
        </Typography>
        <Button variant="contained" size="large" onClick={() => navigate('/import')} sx={{ fontWeight: 600, px: 4 }}>
          Begin with import
        </Button>
      </Card>
    </Container>
  );
};

export default Home;
