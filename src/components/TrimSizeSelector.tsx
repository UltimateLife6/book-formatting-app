import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  TextField,
  Switch,
  Alert,
  Chip,
  Tooltip,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Info as InfoIcon,
  Settings as SettingsIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import {
  TRIM_SIZE_PRESETS,
  TrimSize,
  PageSizeSettings,
  getDefaultTrimSizeForGenre,
  calculateAutoMargins,
} from '../context/BookContext';

interface TrimSizeSelectorProps {
  pageSize: PageSizeSettings;
  genre: string;
  onPageSizeChange: (pageSize: PageSizeSettings) => void;
  onMarginsChange?: (margins: {
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    gutter: number;
  }) => void;
  showWarning?: boolean;
  onWarningAcknowledge?: () => void;
}

const TrimSizeSelector: React.FC<TrimSizeSelectorProps> = ({
  pageSize,
  genre,
  onPageSizeChange,
  onMarginsChange,
  showWarning = false,
  onWarningAcknowledge,
}) => {
  const theme = useTheme();
  const [localPageSize, setLocalPageSize] = useState<PageSizeSettings>(pageSize);
  const [customWidth, setCustomWidth] = useState(pageSize.customWidth || 6);
  const [customHeight, setCustomHeight] = useState(pageSize.customHeight || 9);

  useEffect(() => {
    setLocalPageSize(pageSize);
    if (pageSize.customWidth) setCustomWidth(pageSize.customWidth);
    if (pageSize.customHeight) setCustomHeight(pageSize.customHeight);
  }, [pageSize]);

  const handleTrimSizeChange = (trimSizeId: string | null) => {
    let newTrimSize: TrimSize | null = null;
    if (trimSizeId) {
      newTrimSize = TRIM_SIZE_PRESETS.find(p => p.id === trimSizeId) || null;
    }

    const newPageSize: PageSizeSettings = {
      ...localPageSize,
      trimSize: newTrimSize,
    };

    setLocalPageSize(newPageSize);
    onPageSizeChange(newPageSize);

    // Auto-calculate margins when trim size changes
    if (newTrimSize && onMarginsChange) {
      const margins = calculateAutoMargins(newTrimSize);
      onMarginsChange(margins);
    }
  };

  const handleAdvancedToggle = (enabled: boolean) => {
    const newPageSize: PageSizeSettings = {
      ...localPageSize,
      isAdvanced: enabled,
    };
    setLocalPageSize(newPageSize);
    onPageSizeChange(newPageSize);
  };

  const handleCustomSizeChange = (field: 'width' | 'height', value: number) => {
    if (field === 'width') {
      setCustomWidth(value);
    } else {
      setCustomHeight(value);
    }

    const newPageSize: PageSizeSettings = {
      ...localPageSize,
      customWidth: field === 'width' ? value : localPageSize.customWidth,
      customHeight: field === 'height' ? value : localPageSize.customHeight,
      trimSize: null, // Custom size means no preset
    };

    setLocalPageSize(newPageSize);
    onPageSizeChange(newPageSize);

    // Auto-calculate margins for custom size
    if (onMarginsChange) {
      const customTrimSize: TrimSize = {
        id: 'custom',
        width: field === 'width' ? value : customWidth,
        height: field === 'height' ? value : customHeight,
        name: 'Custom',
        description: '',
      };
      const margins = calculateAutoMargins(customTrimSize);
      onMarginsChange(margins);
    }
  };

  const handleUnitChange = (unit: 'inches' | 'millimeters') => {
    const newPageSize: PageSizeSettings = {
      ...localPageSize,
      unit,
    };
    setLocalPageSize(newPageSize);
    onPageSizeChange(newPageSize);
  };

  // Get recommended trim size for current genre
  const recommendedTrimSize = getDefaultTrimSizeForGenre(genre);

  return (
    <Box>
      {showWarning && (
        <Alert
          severity="warning"
          icon={<WarningIcon />}
          sx={{ mb: 3 }}
          action={
            onWarningAcknowledge && (
              <IconButton
                size="small"
                onClick={onWarningAcknowledge}
                aria-label="acknowledge"
              >
                ×
              </IconButton>
            )
          }
        >
          Changing trim size may affect page breaks, margins, and layout. Your current formatting
          will be adjusted automatically.
        </Alert>
      )}

      {/* Beginner/Advanced Mode Toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          <Typography variant="h6">Page Size Settings</Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={localPageSize.isAdvanced}
              onChange={(e) => handleAdvancedToggle(e.target.checked)}
            />
          }
          label="Advanced Mode"
        />
      </Box>

      {!localPageSize.isAdvanced ? (
        /* Beginner Mode: Preset Selection */
        <Box>
          <FormControl component="fieldset" fullWidth>
            <FormLabel component="legend" sx={{ mb: 2 }}>
              Select Trim Size
              <Tooltip title="Trim size is the final size of your printed book after cutting">
                <IconButton size="small" sx={{ ml: 1 }}>
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </FormLabel>
            <RadioGroup
              value={localPageSize.trimSize?.id || ''}
              onChange={(e) => handleTrimSizeChange(e.target.value)}
            >
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {TRIM_SIZE_PRESETS.map((preset) => {
                  const isRecommended = preset.id === recommendedTrimSize.id;
                  return (
                    <Box key={preset.id} sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 16px)', md: '1 1 calc(33.333% - 22px)' } }}>
                      <Card
                        variant={
                          localPageSize.trimSize?.id === preset.id ? 'outlined' : 'elevation'
                        }
                        sx={{
                          cursor: 'pointer',
                          border:
                            localPageSize.trimSize?.id === preset.id
                              ? `2px solid ${theme.palette.primary.main}`
                              : '2px solid transparent',
                          '&:hover': {
                            border: `2px solid ${theme.palette.primary.light}`,
                          },
                          height: '100%',
                        }}
                        onClick={() => handleTrimSizeChange(preset.id)}
                      >
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                            <Radio
                              checked={localPageSize.trimSize?.id === preset.id}
                              value={preset.id}
                              onChange={() => handleTrimSizeChange(preset.id)}
                              sx={{ p: 0.5 }}
                            />
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="subtitle1" fontWeight="bold">
                                {preset.name}
                              </Typography>
                              {isRecommended && (
                                <Chip
                                  label="Recommended"
                                  size="small"
                                  color="primary"
                                  sx={{ mt: 0.5, mb: 0.5 }}
                                />
                              )}
                            </Box>
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {preset.description}
                          </Typography>
                          {/* Visual representation */}
                          <Box
                            sx={{
                              mt: 2,
                              width: '100%',
                              height: '60px',
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: 'grey.50',
                            }}
                          >
                            <Typography variant="caption" color="text.secondary">
                              {preset.width}" × {preset.height}"
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Box>
                  );
                })}
              </Box>
            </RadioGroup>
          </FormControl>

          {localPageSize.trimSize && (
            <Alert severity="info" sx={{ mt: 3 }}>
              Margins and gutter are automatically calculated based on your trim size. Switch to
              Advanced Mode to customize these settings.
            </Alert>
          )}
        </Box>
      ) : (
        /* Advanced Mode: Custom Inputs */
        <Box>
          <FormControl component="fieldset" fullWidth sx={{ mb: 3 }}>
            <FormLabel component="legend" sx={{ mb: 2 }}>
              Custom Page Size
            </FormLabel>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                label="Width"
                type="number"
                value={customWidth}
                onChange={(e) => handleCustomSizeChange('width', parseFloat(e.target.value) || 0)}
                inputProps={{ min: 1, max: 20, step: 0.1 }}
                sx={{ flex: 1, minWidth: 120 }}
              />
              <Typography>×</Typography>
              <TextField
                label="Height"
                type="number"
                value={customHeight}
                onChange={(e) => handleCustomSizeChange('height', parseFloat(e.target.value) || 0)}
                inputProps={{ min: 1, max: 20, step: 0.1 }}
                sx={{ flex: 1, minWidth: 120 }}
              />
              <FormControl>
                <RadioGroup
                  row
                  value={localPageSize.unit}
                  onChange={(e) => handleUnitChange(e.target.value as 'inches' | 'millimeters')}
                >
                  <FormControlLabel value="inches" control={<Radio />} label="in" />
                  <FormControlLabel value="millimeters" control={<Radio />} label="mm" />
                </RadioGroup>
              </FormControl>
            </Box>
          </FormControl>

          <Alert severity="warning" sx={{ mb: 2 }}>
            Custom trim sizes may not be supported by all printers and distributors. Check with
            your printer before finalizing.
          </Alert>

          {/* Preset shortcuts in advanced mode */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Quick Presets:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            {TRIM_SIZE_PRESETS.map((preset) => (
              <Chip
                key={preset.id}
                label={preset.name}
                onClick={() => {
                  setCustomWidth(preset.width);
                  setCustomHeight(preset.height);
                  handleCustomSizeChange('width', preset.width);
                  handleCustomSizeChange('height', preset.height);
                }}
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Preview label */}
      {localPageSize.trimSize && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Previewing {localPageSize.trimSize.name} (scaled)
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default TrimSizeSelector;

