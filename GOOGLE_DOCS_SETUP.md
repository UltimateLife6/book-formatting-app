# Google Docs Integration Setup

To enable Google Docs integration, you need to set up Google API credentials.

## 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Drive API
   - Google Docs API

## 2. Create OAuth 2.0 Credentials

1. Go to "Credentials" in the Google Cloud Console
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. Choose "Web application" as the application type
4. Add your domain to "Authorized JavaScript origins":
   - For development: `http://localhost:3000`
   - For production: `https://yourdomain.com`
5. Copy the Client ID

## 3. Create API Key

1. In the same "Credentials" section
2. Click "Create Credentials" → "API Key"
3. Copy the API Key

## 4. Set Environment Variables

Create a `.env` file in your project root with:

```env
REACT_APP_GOOGLE_CLIENT_ID=your_client_id_here
REACT_APP_GOOGLE_API_KEY=your_api_key_here
```

## 5. Security Considerations

- Never commit your `.env` file to version control
- Add `.env` to your `.gitignore` file
- Use different credentials for development and production
- Restrict your API key to specific domains in production

## 6. Testing

After setting up the credentials:

1. Restart your development server
2. Go to the Import page
3. Click "Connect Google" 
4. Sign in with your Google account
5. Select a Google Doc to import

## Troubleshooting

### "Google Docs integration not configured"
- Make sure you've set both environment variables
- Restart your development server after adding them
- Check that the variable names start with `REACT_APP_`

### "Failed to sign in to Google"
- Check that your Client ID is correct
- Verify that `http://localhost:3000` is in your authorized origins
- Make sure the Google Drive and Docs APIs are enabled

### "No Google Docs found"
- Make sure you're signed in with an account that has Google Docs
- Check that the Google Drive API is enabled
- Try refreshing the document list

