// Google Docs integration utilities

export interface GoogleDocsConfig {
  clientId: string;
  apiKey: string;
  discoveryDocs: string[];
  scopes: string[];
}

export interface GoogleDocument {
  id: string;
  title: string;
  content: string;
  modifiedTime: string;
  webViewLink: string;
}

class GoogleDocsService {
  private gapi: any = null;
  private isInitialized = false;
  private isSignedIn = false;
  private config: GoogleDocsConfig;

  constructor(config: GoogleDocsConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      // Check if gapi is already loaded
      if (typeof window !== 'undefined' && (window as any).gapi) {
        this.gapi = (window as any).gapi;
        this.initializeGapi().then(resolve).catch(reject);
        return;
      }

      // Load Google API script
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        this.gapi = (window as any).gapi;
        this.initializeGapi().then(resolve).catch(reject);
      };
      script.onerror = () => reject(new Error('Failed to load Google API script'));
      document.head.appendChild(script);
    });
  }

  private async initializeGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.gapi.load('client:auth2', async () => {
        try {
          await this.gapi.client.init({
            apiKey: this.config.apiKey,
            clientId: this.config.clientId,
            discoveryDocs: this.config.discoveryDocs,
            scope: this.config.scopes.join(' '),
          });

          this.isInitialized = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async signIn(): Promise<boolean> {
    if (!this.isInitialized) {
      console.log('Initializing Google API...');
      await this.initialize();
    }

    try {
      console.log('Starting Google sign-in...');
      const authInstance = this.gapi.auth2.getAuthInstance();
      const user = await authInstance.signIn();
      this.isSignedIn = user.isSignedIn();
      console.log('Sign-in successful:', this.isSignedIn);
      return this.isSignedIn;
    } catch (error) {
      console.error('Sign-in error:', error);
      return false;
    }
  }

  async signOut(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      const authInstance = this.gapi.auth2.getAuthInstance();
      await authInstance.signOut();
      this.isSignedIn = false;
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  }

  async getDocuments(): Promise<GoogleDocument[]> {
    if (!this.isSignedIn) {
      throw new Error('User must be signed in to access documents');
    }

    try {
      const response = await this.gapi.client.drive.files.list({
        q: "mimeType='application/vnd.google-apps.document' and trashed=false",
        fields: 'files(id,name,modifiedTime,webViewLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 20,
      });

      const documents = await Promise.all(
        response.result.files.map(async (file: any) => {
          const content = await this.getDocumentContent(file.id);
          return {
            id: file.id,
            title: file.name,
            content,
            modifiedTime: file.modifiedTime,
            webViewLink: file.webViewLink,
          };
        })
      );

      return documents;
    } catch (error) {
      console.error('Error fetching documents:', error);
      throw new Error('Failed to fetch Google Docs documents');
    }
  }

  async getDocumentContent(documentId: string): Promise<string> {
    if (!this.isSignedIn) {
      throw new Error('User must be signed in to access document content');
    }

    try {
      const response = await this.gapi.client.docs.documents.get({
        documentId,
      });

      return this.extractTextFromDocument(response.result);
    } catch (error) {
      console.error('Error fetching document content:', error);
      throw new Error('Failed to fetch document content');
    }
  }

  private extractTextFromDocument(document: any): string {
    if (!document.body || !document.body.content) {
      return '';
    }

    let text = '';
    
    const extractTextFromElement = (element: any): string => {
      if (element.textRun) {
        return element.textRun.content || '';
      }
      
      if (element.table) {
        let tableText = '';
        element.table.tableRows?.forEach((row: any) => {
          row.tableCells?.forEach((cell: any) => {
            cell.content?.forEach((cellElement: any) => {
              tableText += extractTextFromElement(cellElement);
            });
            tableText += '\t'; // Tab separator for table cells
          });
          tableText += '\n'; // New line for table rows
        });
        return tableText;
      }
      
      if (element.paragraph) {
        let paragraphText = '';
        element.paragraph.elements?.forEach((paraElement: any) => {
          paragraphText += extractTextFromElement(paraElement);
        });
        return paragraphText + '\n\n'; // Double newline for paragraphs
      }
      
      return '';
    };

    document.body.content.forEach((element: any) => {
      text += extractTextFromElement(element);
    });

    // Clean up the text
    return text
      .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
      .replace(/\t+/g, ' ') // Replace tabs with spaces
      .trim();
  }

  isUserSignedIn(): boolean {
    return this.isSignedIn;
  }

  getCurrentUser(): any {
    if (!this.isInitialized || !this.isSignedIn) return null;
    
    const authInstance = this.gapi.auth2.getAuthInstance();
    return authInstance.currentUser.get();
  }
}

// Default configuration - these should be moved to environment variables
const defaultConfig: GoogleDocsConfig = {
  clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
  apiKey: process.env.REACT_APP_GOOGLE_API_KEY || '',
  discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', 'https://www.googleapis.com/discovery/v1/apis/docs/v1/rest'],
  scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/documents.readonly'],
};

export const googleDocsService = new GoogleDocsService(defaultConfig);

// Utility function to check if Google Docs integration is configured
export const isGoogleDocsConfigured = (): boolean => {
  return !!(process.env.REACT_APP_GOOGLE_CLIENT_ID && process.env.REACT_APP_GOOGLE_API_KEY);
};

// Utility function to get Google Docs documents
export const fetchGoogleDocs = async (): Promise<GoogleDocument[]> => {
  if (!isGoogleDocsConfigured()) {
    throw new Error('Google Docs integration is not configured. Please set up Google API credentials.');
  }

  const signedIn = await googleDocsService.signIn();
  if (!signedIn) {
    throw new Error('Failed to sign in to Google. Please try again.');
  }

  return await googleDocsService.getDocuments();
};

// Utility function to get a specific document
export const fetchGoogleDocument = async (documentId: string): Promise<string> => {
  if (!isGoogleDocsConfigured()) {
    throw new Error('Google Docs integration is not configured. Please set up Google API credentials.');
  }

  const signedIn = await googleDocsService.signIn();
  if (!signedIn) {
    throw new Error('Failed to sign in to Google. Please try again.');
  }

  return await googleDocsService.getDocumentContent(documentId);
};
