// DOCX generation utilities
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { Chapter as BookChapter } from '../context/BookContext';

export interface DOCXOptions {
  title: string;
  author: string;
  content?: string; // Legacy support
  chapters?: BookChapter[]; // New Atticus-style chapters
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

export const generateDOCX = async (options: DOCXOptions): Promise<Blob> => {
  const { title, author, content, chapters, formatting, metadata } = options;
  
  // Use chapters if provided, otherwise split content into chapters
  let docxChapters: Array<{ title?: string; content: string }>;
  
  if (chapters && chapters.length > 0) {
    // Use provided chapters (Atticus-style)
    docxChapters = chapters.map((ch: BookChapter) => ({
      title: ch.isNumbered && ch.chapterNumber 
        ? `${ch.chapterNumber}. ${ch.title}` 
        : ch.title,
      content: ch.body || ch.content || '',
    }));
  } else if (content) {
    // Legacy: split content into chapters
    docxChapters = splitIntoChapters(content);
  } else {
    throw new Error('No content or chapters provided for DOCX generation');
  }
  
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
  docxChapters.forEach((chapter, index) => {
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
    paragraphs.forEach((paragraph, paraIndex) => {
      if (paragraph.trim()) {
        // Convert em to twips (1 em = font size in points, 1 point = 20 twips)
        // Only indent paragraphs after the first one in each chapter
        const indentTwips = paraIndex > 0 && formatting.paragraphIndent > 0
          ? Math.round(formatting.paragraphIndent * formatting.fontSize * 20)
          : 0;
        
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
            indent: indentTwips > 0 ? { firstLine: indentTwips } : undefined,
          })
        );
      }
    });

    // Add page break after each chapter (except the last one)
    if (index < docxChapters.length - 1) {
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
