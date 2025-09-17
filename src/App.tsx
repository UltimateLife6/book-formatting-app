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
import { BookProvider } from './context/BookContext';
import { ErrorProvider } from './context/ErrorContext';
import ErrorBoundary from './components/ErrorBoundary';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          padding: '8px 16px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
              <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
                <Header />
                <Box sx={{ pt: 8, pb: 2 }}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/import" element={<Import />} />
                    <Route path="/wizard" element={<Wizard />} />
                    <Route path="/format" element={<Format />} />
                    <Route path="/preview" element={<Preview />} />
                    <Route path="/export" element={<Export />} />
                  </Routes>
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