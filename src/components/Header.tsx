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
} from '@mui/icons-material';
import AuthModal from './AuthModal';

const Header: React.FC = () => {
  const theme = useTheme();
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
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        }}
      >
        <Toolbar sx={{ py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              borderRadius: 2,
              px: 2,
              py: 1,
              mr: 3
            }}>
              <BookIcon sx={{ mr: 1, color: 'white' }} />
              <Typography
                variant={isMobile ? 'h6' : 'h5'}
                component="div"
                sx={{ 
                  fontWeight: 800,
                  color: 'white',
                  fontSize: isMobile ? '1.1rem' : '1.3rem'
                }}
              >
                Book Formatter
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isLoggedIn ? (
              <IconButton 
                color="primary" 
                size="large"
                sx={{
                  background: 'rgba(99, 102, 241, 0.1)',
                  '&:hover': {
                    background: 'rgba(99, 102, 241, 0.2)',
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
                  background: 'rgba(99, 102, 241, 0.1)',
                  '&:hover': {
                    background: 'rgba(99, 102, 241, 0.2)',
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
