// Application configuration management
export interface AppConfig {
  app: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
  };
  api: {
    baseUrl: string;
    timeout: number;
  };
  features: {
    analytics: boolean;
    debugMode: boolean;
    googleDocs: boolean;
    darkMode: boolean;
  };
  limits: {
    maxFileSizeMB: number;
    allowedFileTypes: string[];
  };
  export: {
    defaultPdfQuality: number;
    defaultEpubVersion: string;
  };
  ui: {
    defaultTheme: 'light' | 'dark';
  };
  errorReporting: {
    enabled: boolean;
    sentryDsn?: string;
  };
}

// Default configuration
const defaultConfig: AppConfig = {
  app: {
    name: 'Book Formatter',
    version: '1.0.0',
    environment: 'development',
  },
  api: {
    baseUrl: 'http://localhost:3001/api',
    timeout: 10000,
  },
  features: {
    analytics: false,
    debugMode: true,
    googleDocs: true,
    darkMode: true,
  },
  limits: {
    maxFileSizeMB: 50,
    allowedFileTypes: ['docx', 'txt', 'rtf'],
  },
  export: {
    defaultPdfQuality: 0.92,
    defaultEpubVersion: '3.0',
  },
  ui: {
    defaultTheme: 'light',
  },
  errorReporting: {
    enabled: false,
  },
};

// Environment-based configuration
const getConfig = (): AppConfig => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    app: {
      name: process.env.REACT_APP_NAME || defaultConfig.app.name,
      version: process.env.REACT_APP_VERSION || defaultConfig.app.version,
      environment: (process.env.REACT_APP_ENVIRONMENT as any) || defaultConfig.app.environment,
    },
    api: {
      baseUrl: process.env.REACT_APP_API_URL || defaultConfig.api.baseUrl,
      timeout: parseInt(process.env.REACT_APP_API_TIMEOUT || '10000', 10),
    },
    features: {
      analytics: process.env.REACT_APP_ENABLE_ANALYTICS === 'true',
      debugMode: process.env.REACT_APP_ENABLE_DEBUG_MODE === 'true' || isDevelopment,
      googleDocs: process.env.REACT_APP_ENABLE_GOOGLE_DOCS === 'true',
      darkMode: process.env.REACT_APP_ENABLE_DARK_MODE === 'true',
    },
    limits: {
      maxFileSizeMB: parseInt(process.env.REACT_APP_MAX_FILE_SIZE_MB || '50', 10),
      allowedFileTypes: (process.env.REACT_APP_ALLOWED_FILE_TYPES || 'docx,txt,rtf').split(','),
    },
    export: {
      defaultPdfQuality: parseFloat(process.env.REACT_APP_DEFAULT_PDF_QUALITY || '0.92'),
      defaultEpubVersion: process.env.REACT_APP_DEFAULT_EPUB_VERSION || '3.0',
    },
    ui: {
      defaultTheme: (process.env.REACT_APP_DEFAULT_THEME as any) || 'light',
    },
    errorReporting: {
      enabled: process.env.REACT_APP_ERROR_REPORTING_ENABLED === 'true',
      sentryDsn: process.env.REACT_APP_SENTRY_DSN,
    },
  };
};

// Export the configuration
export const config = getConfig();

// Utility functions
export const isDevelopment = () => config.app.environment === 'development';
export const isProduction = () => config.app.environment === 'production';
export const isStaging = () => config.app.environment === 'staging';

export const getFeatureFlag = (feature: keyof AppConfig['features']) => {
  return config.features[feature];
};

export const getFileSizeLimit = () => config.limits.maxFileSizeMB * 1024 * 1024; // Convert to bytes
export const getAllowedFileTypes = () => config.limits.allowedFileTypes;
