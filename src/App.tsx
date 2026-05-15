import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import Header from './components/Header';
import Home from './pages/Home';
import Import from './pages/Import';
import Format from './pages/Format';
import Preview from './pages/Preview';
import Export from './pages/Export';
import Wizard from './pages/Wizard';
import Chapters from './pages/Chapters';
import Manuscript from './pages/Manuscript';
import { BookProvider } from './context/BookContext';
import { ErrorProvider } from './context/ErrorContext';
import ErrorBoundary from './components/ErrorBoundary';

const fontSans =
  '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif';
const fontSerif = '"Cormorant Garamond", "Libre Baskerville", Georgia, "Times New Roman", serif';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#5a58c8',
      light: '#7c7ad4',
      dark: '#4543a8',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#c45d6a',
      light: '#d47a85',
      dark: '#a84856',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f5f1ea',
      paper: '#fffdf8',
    },
    text: {
      primary: '#2c2825',
      secondary: '#5c534c',
    },
    grey: {
      50: '#faf8f5',
      100: '#f0ebe3',
      200: '#e2dcd2',
      300: '#cbc4b8',
      400: '#9a9288',
      500: '#7a7268',
      600: '#5c534c',
      700: '#454039',
      800: '#2c2825',
      900: '#1a1816',
    },
  },
  typography: {
    fontFamily: fontSans,
    h1: {
      fontFamily: fontSerif,
      fontSize: '3.25rem',
      fontWeight: 600,
      lineHeight: 1.12,
      letterSpacing: '-0.01em',
    },
    h2: {
      fontFamily: fontSerif,
      fontSize: '2.35rem',
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontFamily: fontSerif,
      fontSize: '1.85rem',
      fontWeight: 600,
      lineHeight: 1.28,
    },
    h4: {
      fontFamily: fontSerif,
      fontSize: '1.45rem',
      fontWeight: 600,
      lineHeight: 1.35,
    },
    h5: {
      fontFamily: fontSerif,
      fontSize: '1.2rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontFamily: fontSerif,
      fontSize: '1.05rem',
      fontWeight: 600,
      lineHeight: 1.45,
    },
    subtitle1: {
      fontFamily: fontSans,
      fontWeight: 600,
    },
    subtitle2: {
      fontFamily: fontSans,
      fontWeight: 600,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.65,
      fontWeight: 400,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.65,
      fontWeight: 400,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 600,
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 16,
  },
  shadows: [
    'none',
    '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 12,
          padding: '12px 24px',
          fontWeight: 600,
          fontSize: '0.875rem',
          boxShadow: 'none',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #5a58c8 0%, #7c6fd4 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #4543a8 0%, #6358b8 100%)',
          },
        },
        outlined: {
          borderWidth: '2px',
          '&:hover': {
            borderWidth: '2px',
            backgroundColor: 'rgba(90, 88, 200, 0.06)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          border: '1px solid rgba(44, 40, 37, 0.06)',
          background: 'rgba(255, 253, 248, 0.92)',
          backdropFilter: 'blur(12px)',
          transition: 'box-shadow 0.25s ease, transform 0.25s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 12px 28px rgba(44, 40, 37, 0.08)',
            background: 'rgba(255, 253, 248, 0.98)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
            },
            '&.Mui-focused': {
              backgroundColor: 'rgba(255, 255, 255, 1)',
              boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.1)',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          fontSize: '0.75rem',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backdropFilter: 'blur(10px)',
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorProvider>
        <ErrorBoundary>
          <BookProvider>
            <Router>
              <Box sx={{ 
                minHeight: '100vh', 
                background: 'linear-gradient(165deg, #faf6ef 0%, #f0e8dc 45%, #ebe4d8 100%)',
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(90, 88, 200, 0.06), transparent 55%)',
                  zIndex: 0,
                }
              }}>
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                  <Header />
                  <Box sx={{ pt: 8, pb: 2 }}>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/import" element={<Import />} />
                      <Route path="/wizard" element={<Wizard />} />
                      <Route path="/format" element={<Format />} />
                      <Route path="/chapters" element={<Chapters />} />
                      <Route path="/manuscript" element={<Manuscript />} />
                      <Route path="/preview" element={<Preview />} />
                      <Route path="/export" element={<Export />} />
                    </Routes>
                  </Box>
                </Box>
              </Box>
            </Router>
          </BookProvider>
        </ErrorBoundary>
      </ErrorProvider>
    </ThemeProvider>
  );
}

export default App;