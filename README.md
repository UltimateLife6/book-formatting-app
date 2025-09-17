# 📚 Book Formatting App

A modern, professional book formatting application built with React and TypeScript. Transform your manuscript into beautifully formatted books ready for publication.

## ✨ Features

- **📁 Multiple Import Formats**: Support for .docx, .txt, and .rtf files
- **🎨 Professional Templates**: Genre-specific formatting templates
- **⚙️ Custom Formatting**: Font family, size, line height, and margin controls
- **👁️ Live Preview**: Real-time preview of your formatted book
- **📤 Multiple Export Formats**: Export to PDF, EPUB, and DOCX
- **🛡️ Error Handling**: Comprehensive error handling with user-friendly messages
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/book-formatting-app.git
cd book-formatting-app
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ErrorBoundary.tsx
│   ├── ErrorToast.tsx
│   └── Header.tsx
├── context/            # React Context providers
│   ├── BookContext.tsx
│   └── ErrorContext.tsx
├── hooks/              # Custom React hooks
│   └── useErrorHandler.ts
├── pages/              # Main application pages
│   ├── Home.tsx
│   ├── Import.tsx
│   ├── Format.tsx
│   ├── Preview.tsx
│   ├── Export.tsx
│   └── Wizard.tsx
├── types/              # TypeScript type definitions
│   └── errors.ts
├── utils/              # Utility functions
│   └── errorUtils.ts
└── App.tsx             # Main application component
```

## 🛠️ Technologies Used

- **React 19** - UI library
- **TypeScript** - Type safety
- **Material-UI (MUI)** - Component library
- **React Router** - Navigation
- **html2pdf.js** - PDF generation
- **Mammoth.js** - Word document processing

## 📖 Usage

### 1. Import Your Manuscript
- Upload a .docx, .txt, or .rtf file
- Or paste your text directly into the editor

### 2. Choose a Template
- Select from genre-specific templates
- Or customize your own formatting

### 3. Format Your Book
- Adjust font family, size, and line height
- Set margins and spacing
- Preview changes in real-time

### 4. Export Your Book
- Export to PDF for print
- Export to EPUB for e-books
- Export to DOCX for further editing

## 🎨 Available Templates

- **Fiction**: Classic novel formatting
- **Non-Fiction**: Academic and business formatting
- **Poetry**: Verse and stanza formatting
- **Memoir**: Personal story formatting
- **Children's Book**: Large text and spacing

## 🛡️ Error Handling

The app includes comprehensive error handling:

- **File Validation**: Type and size validation
- **Processing Errors**: Document parsing error handling
- **Export Errors**: Format conversion error management
- **Network Errors**: Connection and server error handling
- **User Feedback**: Toast notifications and error boundaries

## 🚀 Production Deployment

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

### Environment Variables

Create a `.env` file in the root directory:

```env
REACT_APP_API_URL=your_api_url
REACT_APP_APP_NAME=Book Formatting App
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

If you have any questions or need help, please:

1. Check the [Issues](https://github.com/yourusername/book-formatting-app/issues) page
2. Create a new issue if your problem isn't already reported
3. Contact the maintainers

## 🗺️ Roadmap

- [ ] Google Docs integration
- [ ] Cloud storage integration
- [ ] Batch processing
- [ ] Advanced formatting options
- [ ] Template marketplace
- [ ] Collaboration features
- [ ] Version control

## 🙏 Acknowledgments

- [Material-UI](https://mui.com/) for the component library
- [React](https://reactjs.org/) for the framework
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) for PDF generation
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) for Word document processing

---

Made with ❤️ for authors and publishers worldwide.