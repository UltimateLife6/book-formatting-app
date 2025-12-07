# Google Docs Integration Test

To test the Google Docs integration, you need to set up Google API credentials.

## Quick Test Setup

1. **Create a `.env.local` file** in your project root with:
```env
REACT_APP_GOOGLE_CLIENT_ID=your_client_id_here
REACT_APP_GOOGLE_API_KEY=your_api_key_here
```

2. **Get Google API Credentials**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Google Drive API and Google Docs API
   - Create OAuth 2.0 Client ID (Web application)
   - Add `http://localhost:3000` to authorized origins
   - Create an API Key

3. **Test the Integration**:
   - Restart your development server: `npm start`
   - Go to the Import page
   - Click "Connect Google"
   - You should see a Google sign-in popup
   - After signing in, your Google Docs should appear

## Troubleshooting

### "Google Docs integration not configured"
- Make sure you have both environment variables set
- Restart your development server after adding them
- Check the browser console for any errors

### "Failed to sign in to Google"
- Verify your Client ID is correct
- Make sure `http://localhost:3000` is in your authorized origins
- Check that Google Drive and Docs APIs are enabled

### "No Google Docs found"
- Make sure you're signed in with an account that has Google Docs
- Try refreshing the document list
- Check browser console for detailed error messages

## Debug Information

The integration includes console logging to help debug issues:
- "Initializing Google API..." - API is loading
- "Starting Google sign-in..." - Authentication starting
- "Sign-in successful: true" - Authentication completed
- "Successfully loaded Google Docs: X documents" - Documents loaded

Check your browser's developer console (F12) for these messages.

