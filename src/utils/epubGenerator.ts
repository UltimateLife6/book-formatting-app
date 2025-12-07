// EPUB generation utilities

export interface EPUBOptions {
  title: string;
  author: string;
  content: string;
  formatting: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    paragraphIndent: number;
  };
  metadata?: {
    description?: string;
    isbn?: string;
    publisher?: string;
  };
  template?: string;
}

export const generateEPUB = async (options: EPUBOptions): Promise<Blob> => {
  const { title, author, content, formatting, metadata } = options;
  
  // Split content into chapters
  const chapters = splitIntoChapters(content);
  
  // Generate EPUB structure
  const epubContent = {
    title,
    author,
    publisher: metadata?.publisher || 'Self-Published',
    description: metadata?.description || `A book by ${author}`,
    isbn: metadata?.isbn || '',
    content: chapters.map((chapter, index) => ({
      title: chapter.title || `Chapter ${index + 1}`,
      data: formatChapterContent(chapter.content, formatting),
      beforeToc: false,
      excludeFromToc: false,
    })),
    css: generateCSS(formatting),
    verbose: false,
  };

  // Create EPUB using our custom implementation
  // epub-gen has Node.js dependencies that don't work in the browser
  return await generateSimpleEPUB(epubContent);
};

interface Chapter {
  title?: string;
  content: string;
}

const splitIntoChapters = (content: string): Chapter[] => {
  // Simple chapter detection - look for patterns like "Chapter", "CHAPTER", or numbered headings
  const chapterPatterns = [
    /^Chapter\s+\d+/im,
    /^CHAPTER\s+\d+/im,
    /^\d+\./im,
    /^#\s+/m, // Markdown headers
  ];

  const lines = content.split('\n');
  const chapters: Chapter[] = [];
  let currentChapter: Chapter = { content: '' };
  let chapterTitle = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this line starts a new chapter
    const isChapterStart = chapterPatterns.some(pattern => pattern.test(line));
    
    if (isChapterStart && currentChapter.content.trim()) {
      // Save current chapter and start new one
      currentChapter.title = chapterTitle || undefined;
      chapters.push({ ...currentChapter });
      currentChapter = { content: '' };
      chapterTitle = line;
    } else if (line) {
      if (currentChapter.content === '') {
        chapterTitle = line;
      }
      currentChapter.content += line + '\n';
    }
  }

  // Add the last chapter
  if (currentChapter.content.trim()) {
    currentChapter.title = chapterTitle || undefined;
    chapters.push(currentChapter);
  }

  // If no chapters were found, treat entire content as one chapter
  if (chapters.length === 0) {
    chapters.push({ title: 'Chapter 1', content });
  }

  return chapters;
};

const formatChapterContent = (content: string, formatting: EPUBOptions['formatting']): string => {
  // Convert plain text to HTML with proper formatting
  let html = content
    .replace(/\n\s*\n/g, '</p><p>') // Double line breaks become paragraph breaks
    .replace(/\n/g, '<br/>'); // Single line breaks become line breaks

  // Wrap in paragraph tags
  html = `<p>${html}</p>`;

  // Apply formatting styles
  const styles = `
    <style>
      body {
        font-family: "${formatting.fontFamily}", serif;
        font-size: ${formatting.fontSize}pt;
        line-height: ${formatting.lineHeight};
        margin: ${formatting.marginTop}in ${formatting.marginRight}in ${formatting.marginBottom}in ${formatting.marginLeft}in;
        text-align: justify;
      }
      p {
        margin-bottom: 1em;
        text-indent: ${formatting.paragraphIndent || 0.5}em;
      }
      p:first-child {
        text-indent: 0;
      }
      h1, h2, h3, h4, h5, h6 {
        text-align: center;
        margin: 2em 0 1em 0;
        page-break-after: avoid;
      }
      .chapter-title {
        text-align: center;
        font-size: 1.5em;
        margin: 3em 0 2em 0;
        page-break-before: always;
      }
    </style>
  `;

  return `${styles}<body>${html}</body>`;
};

const generateCSS = (formatting: EPUBOptions['formatting']): string => {
  return `
    body {
      font-family: "${formatting.fontFamily}", serif;
      font-size: ${formatting.fontSize}pt;
      line-height: ${formatting.lineHeight};
      margin: ${formatting.marginTop}in ${formatting.marginRight}in ${formatting.marginBottom}in ${formatting.marginLeft}in;
      text-align: justify;
    }
    
    p {
      margin-bottom: 1em;
      text-indent: ${formatting.paragraphIndent || 0.5}em;
    }
    
    p:first-child {
      text-indent: 0;
    }
    
    h1, h2, h3, h4, h5, h6 {
      text-align: center;
      margin: 2em 0 1em 0;
      page-break-after: avoid;
    }
    
    .chapter-title {
      text-align: center;
      font-size: 1.5em;
      margin: 3em 0 2em 0;
      page-break-before: always;
    }
    
    @media print {
      .chapter-title {
        page-break-before: always;
      }
    }
  `;
};

const generateSimpleEPUB = async (epubContent: any): Promise<Blob> => {
  // Create a simple EPUB structure using JSZip
  // This is a basic implementation - for production, consider using a more robust EPUB library
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  
  // Add mimetype file
  zip.file('mimetype', 'application/epub+zip');
  
  // Add META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // Add OEBPS/content.opf
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${epubContent.title}</dc:title>
    <dc:creator opf:file-as="${epubContent.author}" opf:role="aut">${epubContent.author}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">urn:uuid:12345678-1234-1234-1234-123456789012</dc:identifier>
    <dc:description>${epubContent.description}</dc:description>
    <dc:publisher>${epubContent.publisher}</dc:publisher>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${epubContent.content.map((chapter: any, index: number) => 
      `<item id="chapter${index + 1}" href="chapter${index + 1}.xhtml" media-type="application/xhtml+xml"/>`
    ).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${epubContent.content.map((_: any, index: number) => 
      `<itemref idref="chapter${index + 1}"/>`
    ).join('\n    ')}
  </spine>
</package>`;
  
  zip.file('OEBPS/content.opf', contentOpf);
  
  // Add CSS
  zip.file('OEBPS/style.css', epubContent.css);
  
  // Add chapters
  epubContent.content.forEach((chapter: any, index: number) => {
    const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${chapter.title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${chapter.title}</h1>
  ${chapter.data}
</body>
</html>`;
    zip.file(`OEBPS/chapter${index + 1}.xhtml`, chapterHtml);
  });
  
  // Add NCX file
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:12345678-1234-1234-1234-123456789012"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${epubContent.title}</text>
  </docTitle>
  <navMap>
    ${epubContent.content.map((chapter: any, index: number) => 
      `<navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
        <navLabel><text>${chapter.title}</text></navLabel>
        <content src="chapter${index + 1}.xhtml"/>
      </navPoint>`
    ).join('\n    ')}
  </navMap>
</ncx>`;
  
  zip.file('OEBPS/toc.ncx', ncx);
  
  // Generate the ZIP file
  return await zip.generateAsync({ type: 'blob' });
};

export const downloadEPUB = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.epub`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
