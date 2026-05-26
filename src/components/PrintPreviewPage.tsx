import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import type { Chapter, ChapterHeadingStyle, ChapterSubtitleStyle, ChapterTitleStyle } from '../context/BookContext';

const formatFontFamily = (fontName: string): string => {
  const needsQuotes = fontName.includes(' ');
  const quotedFont = needsQuotes ? `"${fontName}"` : fontName;

  if (
    fontName.includes('Serif') ||
    ['Times New Roman', 'Georgia', 'Garamond', 'Palatino', 'Book Antiqua', 'Cambria'].includes(fontName)
  ) {
    return `${quotedFont}, serif`;
  }
  if (['Courier New'].includes(fontName)) {
    return `${quotedFont}, monospace`;
  }
  return `${quotedFont}, sans-serif`;
};

export interface PrintPreviewPageContext {
  title?: string;
  author?: string;
  template: string;
  templateFontFamily: string;
  formatting: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    paragraphIndent: number;
    chapterHeading: ChapterHeadingStyle;
    chapterTitle: ChapterTitleStyle;
    chapterSubtitle: ChapterSubtitleStyle;
  };
  chaptersById: Map<string, Chapter>;
  formatChapterHeader: (chapter: Chapter) => string | null;
  paragraphSpacingEm: number;
  showHeader: boolean;
  showFooter: boolean;
  headerHeightPx: number;
  footerHeightPx: number;
  trimSize: { width: number; height: number };
}

interface PageShellProps {
  ctx: PrintPreviewPageContext;
  sideClassName: string;
  paperClassName: string;
  children?: React.ReactNode;
  wrapMarginBottom?: number;
}

const PageShell: React.FC<PageShellProps> = ({
  ctx,
  sideClassName,
  paperClassName,
  children,
  wrapMarginBottom = 4,
}) => {
  const { trimSize } = ctx;

  return (
    <Box
      className={sideClassName}
      sx={{
        width: `${trimSize.width}in`,
        minWidth: `${trimSize.width}in`,
        maxWidth: `${trimSize.width}in`,
        display: 'flex',
        justifyContent: 'center',
        mb: wrapMarginBottom,
      }}
    >
      <Paper
        elevation={4}
        className={paperClassName}
        sx={{
          width: `${trimSize.width}in`,
          minWidth: `${trimSize.width}in`,
          maxWidth: `${trimSize.width}in`,
          height: `${trimSize.height}in`,
          minHeight: `${trimSize.height}in`,
          maxHeight: `${trimSize.height}in`,
          position: 'relative',
          pageBreakAfter: 'always',
          overflow: 'hidden',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          boxSizing: 'border-box',
          backgroundColor: '#fff',
          color: '#333',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </Paper>
    </Box>
  );
};

export const PrintPreviewPageParagraphs: React.FC<{
  pageText: string;
  ctx: PrintPreviewPageContext;
}> = ({ pageText, ctx }) => {
  const { formatting, template, chaptersById, formatChapterHeader, paragraphSpacingEm } = ctx;
  const paragraphs =
    typeof pageText === 'string'
      ? pageText.split('\n\n').filter((p) => p !== '' && p !== null && p !== undefined)
      : [];

  if (paragraphs.length === 0) {
    return (
      <p
        style={{
          margin: 0,
          marginBottom: '0',
          fontFamily: formatting.fontFamily,
          fontSize: `${formatting.fontSize}pt`,
          lineHeight: formatting.lineHeight,
          textAlign: 'center',
          color: '#666',
          fontStyle: 'italic',
          whiteSpace: 'normal',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          hyphens: 'auto',
        }}
      >
        (Empty page)
      </p>
    );
  }

  return (
    <>
      {paragraphs.map((paraText, paraIndex) => {
        const isFirstParagraph = paraIndex === 0;
        const isLastParagraph = paraIndex === paragraphs.length - 1;
        const shouldIndent =
          formatting.paragraphIndent > 0 && !isFirstParagraph && template !== 'poetry';
        const trimmedText = paraText.trim();
        const PX_PER_IN = 96;

        const isAtomicHeader = trimmedText.startsWith('__HEADER__');
        const isAtomicTitle = trimmedText.startsWith('__TITLE__');
        const isAtomicSubtitle = trimmedText.startsWith('__SUBTITLE__');

        let chapter: Chapter | undefined;
        if (isAtomicHeader || isAtomicTitle || isAtomicSubtitle) {
          const chapterId = trimmedText.replace(/^__(HEADER|TITLE|SUBTITLE)__/, '');
          chapter = chaptersById.get(chapterId);
        }

        if (isAtomicHeader && chapter) {
          const headerStyle = formatting.chapterHeading;
          const header = formatChapterHeader(chapter);
          if (header) {
            const lineHeightPx = (headerStyle.sizePt * 1.2 * PX_PER_IN) / 72;
            return (
              <div
                key={paraIndex}
                style={{
                  width: `${headerStyle.widthPercent}%`,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  marginBottom: isLastParagraph ? '0px' : '24px',
                }}
              >
                <div
                  style={{
                    margin: 0,
                    padding: 0,
                    display: 'block',
                    fontFamily: formatFontFamily(headerStyle.fontFamily),
                    fontSize: `${headerStyle.sizePt}pt`,
                    lineHeight: `${lineHeightPx}px`,
                    textAlign: headerStyle.align,
                    fontStyle: headerStyle.style.includes('italic') ? 'italic' : 'normal',
                    fontWeight: headerStyle.style.includes('bold') ? 700 : 400,
                    fontVariant: headerStyle.style === 'small-caps' ? 'small-caps' : 'normal',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                  }}
                >
                  {header}
                </div>
              </div>
            );
          }
        }

        if (isAtomicTitle && chapter && chapter.title?.trim()) {
          const titleStyle = formatting.chapterTitle;
          const lineHeightPx = (titleStyle.sizePt * 1.2 * PX_PER_IN) / 72;
          return (
            <div
              key={paraIndex}
              style={{
                width: `${titleStyle.widthPercent}%`,
                marginLeft: 'auto',
                marginRight: 'auto',
                marginBottom: isLastParagraph ? '0px' : '24px',
              }}
            >
              <div
                style={{
                  margin: 0,
                  padding: 0,
                  display: 'block',
                  fontFamily: formatFontFamily(titleStyle.fontFamily),
                  fontSize: `${titleStyle.sizePt}pt`,
                  lineHeight: `${lineHeightPx}px`,
                  textAlign: titleStyle.align,
                  fontStyle: titleStyle.style.includes('italic') ? 'italic' : 'normal',
                  fontWeight: titleStyle.style.includes('bold') ? 700 : 400,
                  fontVariant: titleStyle.style === 'small-caps' ? 'small-caps' : 'normal',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {chapter.title}
              </div>
            </div>
          );
        }

        if (isAtomicSubtitle && chapter && chapter.subtitle?.trim()) {
          const subtitleStyle = formatting.chapterSubtitle;
          const lineHeightPx = (subtitleStyle.sizePt * formatting.lineHeight * PX_PER_IN) / 72;
          return (
            <div
              key={paraIndex}
              style={{
                width: `${subtitleStyle.widthPercent}%`,
                marginLeft: 'auto',
                marginRight: 'auto',
                marginBottom: isLastParagraph ? '0px' : `${paragraphSpacingEm}em`,
              }}
            >
              <div
                style={{
                  margin: 0,
                  padding: 0,
                  display: 'block',
                  fontFamily: formatFontFamily(subtitleStyle.fontFamily),
                  fontSize: `${subtitleStyle.sizePt}pt`,
                  lineHeight: `${lineHeightPx}px`,
                  textAlign: subtitleStyle.align,
                  fontStyle: subtitleStyle.style.includes('italic') ? 'italic' : 'normal',
                  fontWeight: subtitleStyle.style.includes('bold') ? 700 : 400,
                  fontVariant: subtitleStyle.style === 'small-caps' ? 'small-caps' : 'normal',
                  color: '#666',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  hyphens: 'auto',
                }}
              >
                {chapter.subtitle}
              </div>
            </div>
          );
        }

        return (
          <p
            key={paraIndex}
            style={{
              margin: 0,
              marginBottom: isLastParagraph ? '0' : `${paragraphSpacingEm}em`,
              fontFamily: formatting.fontFamily,
              fontSize: `${formatting.fontSize}pt`,
              lineHeight: formatting.lineHeight,
              textAlign: template === 'poetry' ? 'center' : 'left',
              textIndent: shouldIndent ? `${formatting.paragraphIndent}em` : '0em',
              whiteSpace: 'normal',
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              hyphens: 'auto',
            }}
          >
            {trimmedText || '\u00A0'}
          </p>
        );
      })}
    </>
  );
};

export const PrintPreviewTitlePage: React.FC<{
  ctx: PrintPreviewPageContext;
  sideClassName?: string;
  wrapMarginBottom?: number;
}> = ({ ctx, sideClassName = 'preview-page-right', wrapMarginBottom = 4 }) => (
  <PageShell
    ctx={ctx}
    sideClassName={sideClassName}
    paperClassName="title-page page"
    wrapMarginBottom={wrapMarginBottom}
  >
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {ctx.title && (
        <Typography
          variant="h3"
          component="h1"
          sx={{
            textAlign: 'center',
            mb: 4,
            fontFamily: ctx.templateFontFamily,
          }}
        >
          {ctx.title}
        </Typography>
      )}
      {ctx.author && (
        <Typography
          variant="h5"
          component="h2"
          sx={{
            textAlign: 'center',
            color: 'text.secondary',
            fontFamily: ctx.templateFontFamily,
          }}
        >
          by {ctx.author}
        </Typography>
      )}
    </Box>
  </PageShell>
);

export const PrintPreviewBlankPage: React.FC<{
  ctx: PrintPreviewPageContext;
  sideClassName?: string;
  wrapMarginBottom?: number;
}> = ({ ctx, sideClassName = 'preview-page-left', wrapMarginBottom = 0 }) => (
  <PageShell
    ctx={ctx}
    sideClassName={sideClassName}
    paperClassName="page preview-page-placeholder"
    wrapMarginBottom={wrapMarginBottom}
  />
);

export const PrintPreviewFormattingWait: React.FC<{
  ctx: PrintPreviewPageContext;
  sideClassName?: string;
  wrapMarginBottom?: number;
}> = ({ ctx, sideClassName = 'preview-page-right', wrapMarginBottom = 4 }) => (
  <PageShell
    ctx={ctx}
    sideClassName={sideClassName}
    paperClassName="page"
    wrapMarginBottom={wrapMarginBottom}
  >
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Typography color="text.secondary" align="center">
        Still formatting this part of the manuscript. Try again shortly, or step back to an earlier page.
      </Typography>
    </Box>
  </PageShell>
);

export const PrintPreviewBodyPage: React.FC<{
  pageText: string;
  displayPageNumber: number;
  ctx: PrintPreviewPageContext;
  sideClassName?: string;
  wrapMarginBottom?: number;
}> = ({
  pageText,
  displayPageNumber,
  ctx,
  sideClassName = 'preview-page-right',
  wrapMarginBottom = 4,
}) => {
  const PX_PER_IN = 96;
  const currentFooterHeightPx = ctx.showFooter ? ctx.footerHeightPx : 0;
  const currentHeaderHeightPx = ctx.showHeader ? ctx.headerHeightPx : 0;
  const { formatting } = ctx;

  return (
    <PageShell
      ctx={ctx}
      sideClassName={sideClassName}
      paperClassName="page"
      wrapMarginBottom={wrapMarginBottom}
    >
      {ctx.showHeader && currentHeaderHeightPx > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: `${formatting.marginTop}in`,
            left: 0,
            right: 0,
            height: `${currentHeaderHeightPx}px`,
            zIndex: 1,
          }}
        />
      )}

      <Box
        sx={{
          padding: `${formatting.marginTop}in ${formatting.marginRight}in ${formatting.marginBottom + currentFooterHeightPx / PX_PER_IN}in ${formatting.marginLeft}in`,
          boxSizing: 'border-box',
          display: 'block',
          width: '100%',
          flex: 1,
          overflow: 'visible',
          paddingBottom: `${formatting.marginBottom + currentFooterHeightPx / PX_PER_IN}in`,
        }}
      >
        <PrintPreviewPageParagraphs pageText={pageText} ctx={ctx} />
      </Box>

      {ctx.showFooter && currentFooterHeightPx > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: `${formatting.marginBottom}in`,
            left: 0,
            right: 0,
            height: `${currentFooterHeightPx}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ display: 'inline-block' }}>
            {displayPageNumber}
          </Typography>
        </Box>
      )}
    </PageShell>
  );
};

export function renderPrintPageByNumber(
  pageNumber: number,
  splitIntoPages: string[] | null,
  hasTitlePage: boolean,
  chapterFormattingComplete: boolean,
  ctx: PrintPreviewPageContext,
  sideClassName: string,
  wrapMarginBottom: number
): React.ReactNode {
  if (hasTitlePage && pageNumber === 1) {
    return (
      <PrintPreviewTitlePage
        key={`page-${pageNumber}`}
        ctx={ctx}
        sideClassName={sideClassName}
        wrapMarginBottom={wrapMarginBottom}
      />
    );
  }

  const titlePageOffset = hasTitlePage ? 1 : 0;
  const bodyPageIndex = pageNumber - 1 - titlePageOffset;

  if (!splitIntoPages || bodyPageIndex < 0) {
    return null;
  }

  if (bodyPageIndex >= splitIntoPages.length) {
    if (!chapterFormattingComplete) {
      return (
        <PrintPreviewFormattingWait
          key={`wait-${pageNumber}`}
          ctx={ctx}
          sideClassName={sideClassName}
          wrapMarginBottom={wrapMarginBottom}
        />
      );
    }
    return (
      <PrintPreviewBlankPage
        key={`blank-${pageNumber}`}
        ctx={ctx}
        sideClassName={sideClassName}
        wrapMarginBottom={wrapMarginBottom}
      />
    );
  }

  return (
    <PrintPreviewBodyPage
      key={`page-${pageNumber}`}
      pageText={splitIntoPages[bodyPageIndex]}
      displayPageNumber={bodyPageIndex + 1}
      ctx={ctx}
      sideClassName={sideClassName}
      wrapMarginBottom={wrapMarginBottom}
    />
  );
}
