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
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <BookIcon sx={{ mr: 2 }} />
          <Typography
            variant={isMobile ? 'h6' : 'h5'}
            component="div"
            sx={{ flexGrow: 1, fontWeight: 600 }}
          >
            Book Formatter
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {isLoggedIn ? (
              <IconButton color="inherit" size="large">
                <AccountCircle />
              </IconButton>
            ) : (
              <Button
                color="inherit"
                startIcon={<LoginIcon />}
                onClick={() => setAuthModalOpen(true)}
                sx={{ mr: 1 }}
              >
                {isMobile ? 'Login' : 'Sign In'}
              </Button>
            )}
            {!isMobile && (
              <IconButton color="inherit" size="large">
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
