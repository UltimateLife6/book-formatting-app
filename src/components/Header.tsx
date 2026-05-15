import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  useMediaQuery,
  useTheme,
  Button,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Book as BookIcon,
  AccountCircle,
  Login as LoginIcon,
  MenuBook as MenuBookIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AuthModal from './AuthModal';

const Header: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLogin = (email: string, password: string) => {
    // Placeholder for actual authentication
    console.log('Login:', email, password);
    setIsLoggedIn(true);
    setAuthModalOpen(false);
  };

  const handleRegister = (email: string, password: string) => {
    // Placeholder for actual registration
    console.log('Register:', email, password);
    setIsLoggedIn(true);
    setAuthModalOpen(false);
  };

  return (
    <>
      <AppBar 
        position="fixed" 
        sx={{ 
          zIndex: theme.zIndex.drawer + 1,
          background: 'rgba(255, 253, 248, 0.88)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(44, 40, 37, 0.08)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset',
        }}
      >
        <Toolbar sx={{ py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Box 
              onClick={() => navigate('/')}
              sx={{ 
                display: 'flex', 
                alignItems: 'center',
                background: 'linear-gradient(135deg, #5a58c8 0%, #7c6fd4 100%)',
                borderRadius: 2,
                px: 2,
                py: 1,
                mr: 2,
                cursor: 'pointer',
                '&:hover': {
                  transform: 'scale(1.02)',
                  transition: 'transform 0.2s',
                }
              }}
            >
              <BookIcon sx={{ mr: 1, color: 'white' }} />
              <Box>
                <Typography
                  variant={isMobile ? 'subtitle1' : 'h6'}
                  component="div"
                  sx={{ 
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                    fontWeight: 700,
                    color: 'white',
                    lineHeight: 1.1,
                    fontSize: isMobile ? '1.05rem' : '1.2rem',
                  }}
                >
                  Book Formatter
                </Typography>
                {!isMobile && (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.88)', display: 'block', lineHeight: 1.2 }}>
                    Manuscript → publish-ready pages
                  </Typography>
                )}
              </Box>
            </Box>
            {!isMobile && (
              <Box sx={{ display: 'flex', gap: 0.5, ml: 1, alignItems: 'center' }}>
                <Button
                  variant="text"
                  startIcon={<MenuBookIcon />}
                  onClick={() => navigate('/manuscript')}
                  sx={{
                    color: 'text.primary',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'rgba(90, 88, 200, 0.08)',
                    }
                  }}
                >
                  Manuscript
                </Button>
                <Button
                  variant="text"
                  onClick={() => navigate('/format')}
                  sx={{
                    color: 'text.primary',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'rgba(90, 88, 200, 0.08)',
                    }
                  }}
                >
                  Style
                </Button>
                <Button
                  variant="text"
                  onClick={() => navigate('/preview')}
                  sx={{
                    color: 'text.primary',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'rgba(90, 88, 200, 0.08)',
                    }
                  }}
                >
                  Preview
                </Button>
                <Button
                  variant="text"
                  onClick={() => navigate('/export')}
                  sx={{
                    color: 'text.primary',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'rgba(90, 88, 200, 0.08)',
                    }
                  }}
                >
                  Export
                </Button>
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isLoggedIn ? (
              <IconButton 
                color="primary" 
                size="large"
                sx={{
                  background: 'rgba(90, 88, 200, 0.1)',
                  '&:hover': {
                    background: 'rgba(90, 88, 200, 0.2)',
                    transform: 'scale(1.05)',
                  },
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <AccountCircle />
              </IconButton>
            ) : (
              <Button
                variant="contained"
                startIcon={<LoginIcon />}
                onClick={() => setAuthModalOpen(true)}
                sx={{ 
                  fontWeight: 600,
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontSize: '0.875rem'
                }}
              >
                {isMobile ? 'Login' : 'Sign In'}
              </Button>
            )}
            {!isMobile && (
              <IconButton 
                color="primary"
                size="large"
                sx={{
                  background: 'rgba(90, 88, 200, 0.1)',
                  '&:hover': {
                    background: 'rgba(90, 88, 200, 0.2)',
                    transform: 'scale(1.05)',
                  },
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <MenuIcon />
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </AppBar>
      
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    </>
  );
};

export default Header;
