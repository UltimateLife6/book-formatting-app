// DOCX generation utilities
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export interface DOCXOptions {
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
  };
  metadata?: {
    description?: string;
    isbn?: string;
    publisher?: string;
  };
  template?: string;
}

export const generateDOCX = async (options: DOCXOptions): Promise<Blob> => {
  const { title, author, content, formatting, metadata } = options;
  
  // Split content into chapters
  const chapters = splitIntoChapters(content);
  
  // Create document paragraphs
  const children: Paragraph[] = [];
  
  // Add title page
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 32, // 16pt
          font: formatting.fontFamily,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `by ${author}`,
          size: 24, // 12pt
          font: formatting.fontFamily,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    })
  );

  // Add chapters
  chapters.forEach((chapter, index) => {
    // Add chapter title
    if (chapter.title) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: chapter.title,
              bold: true,
              size: 28, // 14pt
              font: formatting.fontFamily,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 600, after: 400 },
        })
      );
    }

    // Add chapter content
    const paragraphs = chapter.content.split('\n\n').filter(p => p.trim());
    paragraphs.forEach(paragraph => {
      if (paragraph.trim()) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: paragraph.trim(),
                size: formatting.fontSize * 2, // Convert pt to half-points
                font: formatting.fontFamily,
              }),
            ],
            spacing: { after: 200 },
            indent: { left: 360 }, // 0.25 inch indent
          })
        );
      }
    });

    // Add page break after each chapter (except the last one)
    if (index < chapters.length - 1) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '' })],
          pageBreakBefore: true,
        })
      );
    }
  });

  // Create document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: Math.round(formatting.marginTop * 1440), // Convert inches to twips
              right: Math.round(formatting.marginRight * 1440),
              bottom: Math.round(formatting.marginBottom * 1440),
              left: Math.round(formatting.marginLeft * 1440),
            },
          },
        },
        children,
      },
    ],
    creator: 'Book Formatting App',
    title: title,
    description: metadata?.description || `A book by ${author}`,
    keywords: 'book, ebook, document',
    subject: 'Book Document',
  });

  // Generate DOCX
  const buffer = await Packer.toBuffer(doc);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
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

export const downloadDOCX = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
