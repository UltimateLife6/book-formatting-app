/**
 * Token-based print pagination (measurement DOM).
 * Extracted from Preview so we can run it per-chapter with yields/caching without
 * blocking the main thread for an entire manuscript.
 */
import type { BookData, Chapter } from '../context/BookContext';
import { yieldToMain } from '../utils/scheduling';

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

export interface RunTokenPaginationOptions {
  formatting: BookData['formatting'];
  template: string;
  trim: { width: number; height: number };
  showHeader: boolean;
  showFooter: boolean;
  headerHeightPx: number;
  footerHeightPx: number;
  chaptersById: Map<string, Chapter>;
  formatChapterHeader: (chapter: Chapter) => string | null;
  /** Called after each page is committed (copy of pages array). */
  onPagesUpdate?: (pages: string[]) => void | Promise<void>;
  shouldCancel?: () => boolean;
}

/**
 * Paginate a flat token stream into page strings (paragraphs joined with \\n\\n).
 */
export async function runTokenPagination(
  tokens: string[],
  measureDiv: HTMLDivElement,
  opts: RunTokenPaginationOptions
): Promise<string[]> {
  const {
    formatting,
    template,
    trim,
    showHeader,
    showFooter,
    headerHeightPx,
    footerHeightPx,
    chaptersById,
    formatChapterHeader,
    onPagesUpdate,
    shouldCancel,
  } = opts;

  measureDiv.innerHTML = '';

  const PX_PER_IN = 96;
  const PAGE_HEIGHT_PX = trim.height * PX_PER_IN;
  const marginTopPx = (formatting.marginTop ?? 0) * PX_PER_IN;
  const marginBottomPx = (formatting.marginBottom ?? 0) * PX_PER_IN;
  const HEADER_HEIGHT_PX = showHeader ? headerHeightPx : 0;
  const FOOTER_HEIGHT_PX = showFooter ? footerHeightPx : 0;
  const TEXT_BLOCK_HEIGHT_PX = Math.max(
    0,
    PAGE_HEIGHT_PX - marginTopPx - marginBottomPx - HEADER_HEIGHT_PX - FOOTER_HEIGHT_PX
  );
  const MAX_CONTENT_SCROLL_HEIGHT_PX = marginTopPx + TEXT_BLOCK_HEIGHT_PX + marginBottomPx;
  const fontSizePx = (formatting.fontSize * PX_PER_IN) / 72;
  const lineHeightPx = fontSizePx * formatting.lineHeight;
  const OVERFLOW_TOLERANCE_PX = Math.min(3, lineHeightPx * 0.1);
  const MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX = MAX_CONTENT_SCROLL_HEIGHT_PX + OVERFLOW_TOLERANCE_PX;

  measureDiv.style.position = 'fixed';
  measureDiv.style.top = '-10000px';
  measureDiv.style.left = '-10000px';
  measureDiv.style.width = `${trim.width}in`;
  measureDiv.style.visibility = 'hidden';
  measureDiv.style.pointerEvents = 'none';
  measureDiv.style.contain = 'layout paint style';
  measureDiv.style.willChange = 'contents';
  measureDiv.style.padding = '0';
  measureDiv.style.margin = '0';
  measureDiv.style.boxSizing = 'border-box';

  const content = document.createElement('div');
  content.style.width = `${trim.width}in`;
  content.style.padding = `${formatting.marginTop}in ${formatting.marginRight}in ${formatting.marginBottom}in ${formatting.marginLeft}in`;
  content.style.fontFamily = formatting.fontFamily;
  content.style.fontSize = `${formatting.fontSize}pt`;
  content.style.lineHeight = `${formatting.lineHeight}`;
  content.style.boxSizing = 'border-box';
  content.style.position = 'static';
  content.style.visibility = 'visible';
  content.style.overflow = 'visible';
  content.style.height = 'auto';
  content.style.display = 'block';
  content.style.wordWrap = 'break-word';
  content.style.overflowWrap = 'break-word';

  measureDiv.appendChild(content);

  if (tokens.length === 0) {
    measureDiv.innerHTML = '';
    return [''];
  }

  try {
  const createParagraphElement = (isLast: boolean = false): HTMLParagraphElement => {
    const p = document.createElement('p');
    p.style.margin = '0';
    p.style.marginBottom = isLast ? '0' : `${Math.max(0, formatting.lineHeight - 1)}em`;
    p.style.fontFamily = formatting.fontFamily;
    p.style.fontSize = `${formatting.fontSize}pt`;
    p.style.lineHeight = `${formatting.lineHeight}`;
    p.style.textAlign = template === 'poetry' ? 'center' : 'left';
    p.style.whiteSpace = 'normal';
    p.style.display = 'block';
    p.style.wordWrap = 'break-word';
    p.style.overflowWrap = 'break-word';
    p.style.hyphens = 'auto';
    return p;
  };

  const pages: string[] = [];
  let currentPageTokens: string[] = [];
  let tokenIndex = 0;

  const rebuildDOM = (tokensToRender: string[] = currentPageTokens) => {
    content.innerHTML = '';
    const elements: HTMLElement[] = [];
    let currentParaWords: string[] = [];

    for (let i = 0; i < tokensToRender.length; i++) {
      const token = tokensToRender[i];
      const isLastToken = i === tokensToRender.length - 1;

      if (token === '\n\n') {
        if (currentParaWords.length > 0) {
          const paraText = currentParaWords.join(' ');
          const p = createParagraphElement(isLastToken);
          p.textContent = paraText || ' ';
          elements.push(p);
          currentParaWords = [];
        }
      } else if (token.startsWith('__HEADER__')) {
        const chapterId = token.replace('__HEADER__', '');
        const chapter = chaptersById.get(chapterId);
        if (chapter) {
          const headerStyle = formatting.chapterHeading;
          const header = formatChapterHeader(chapter);
          if (header) {
            const wrap = document.createElement('div');
            wrap.style.width = `${headerStyle.widthPercent}%`;
            wrap.style.marginLeft = 'auto';
            wrap.style.marginRight = 'auto';
            wrap.style.marginBottom = isLastToken ? '0px' : '24px';

            const h = document.createElement('div');
            h.style.margin = '0';
            h.style.padding = '0';
            h.style.display = 'block';
            h.style.fontFamily = formatFontFamily(headerStyle.fontFamily);
            h.style.fontSize = `${headerStyle.sizePt}pt`;
            h.style.textAlign = headerStyle.align;
            h.style.fontStyle = headerStyle.style.includes('italic') ? 'italic' : 'normal';
            h.style.fontWeight = headerStyle.style.includes('bold') ? '700' : '400';
            h.style.fontVariant = headerStyle.style === 'small-caps' ? 'small-caps' : 'normal';
            const lineHeightPx = (headerStyle.sizePt * 1.2 * PX_PER_IN) / 72;
            h.style.lineHeight = `${lineHeightPx}px`;
            h.style.wordWrap = 'break-word';
            h.style.overflowWrap = 'break-word';
            h.textContent = header;
            wrap.appendChild(h);
            elements.push(wrap);
          }
        }
      } else if (token.startsWith('__TITLE__')) {
        const chapterId = token.replace('__TITLE__', '');
        const chapter = chaptersById.get(chapterId);
        if (chapter && chapter.title?.trim()) {
          const titleStyle = formatting.chapterTitle;

          const wrap = document.createElement('div');
          wrap.style.width = `${titleStyle.widthPercent}%`;
          wrap.style.marginLeft = 'auto';
          wrap.style.marginRight = 'auto';
          wrap.style.marginBottom = isLastToken ? '0px' : '24px';

          const t = document.createElement('div');
          t.style.margin = '0';
          t.style.padding = '0';
          t.style.display = 'block';
          t.style.fontFamily = formatFontFamily(titleStyle.fontFamily);
          t.style.fontSize = `${titleStyle.sizePt}pt`;
          t.style.textAlign = titleStyle.align;
          t.style.fontStyle = titleStyle.style.includes('italic') ? 'italic' : 'normal';
          t.style.fontWeight = titleStyle.style.includes('bold') ? '700' : '400';
          t.style.fontVariant = titleStyle.style === 'small-caps' ? 'small-caps' : 'normal';
          const lineHeightPx = (titleStyle.sizePt * 1.2 * PX_PER_IN) / 72;
          t.style.lineHeight = `${lineHeightPx}px`;
          t.style.wordWrap = 'break-word';
          t.style.overflowWrap = 'break-word';
          t.textContent = chapter.title;
          wrap.appendChild(t);
          elements.push(wrap);
        }
      } else if (token.startsWith('__SUBTITLE__')) {
        const chapterId = token.replace('__SUBTITLE__', '');
        const chapter = chaptersById.get(chapterId);
        if (chapter && chapter.subtitle?.trim()) {
          const subtitleStyle = formatting.chapterSubtitle;

          const wrap = document.createElement('div');
          wrap.style.width = `${subtitleStyle.widthPercent}%`;
          wrap.style.marginLeft = 'auto';
          wrap.style.marginRight = 'auto';
          wrap.style.marginBottom = isLastToken ? '0px' : `${Math.max(0, formatting.lineHeight - 1)}em`;

          const s = document.createElement('div');
          s.style.margin = '0';
          s.style.padding = '0';
          s.style.display = 'block';
          s.style.fontFamily = formatFontFamily(subtitleStyle.fontFamily);
          s.style.fontSize = `${subtitleStyle.sizePt}pt`;
          s.style.textAlign = subtitleStyle.align;
          s.style.fontStyle = subtitleStyle.style.includes('italic') ? 'italic' : 'normal';
          s.style.fontWeight = subtitleStyle.style.includes('bold') ? '700' : '400';
          s.style.fontVariant = subtitleStyle.style === 'small-caps' ? 'small-caps' : 'normal';
          s.style.color = '#666';
          const lineHeightPx = (subtitleStyle.sizePt * formatting.lineHeight * PX_PER_IN) / 72;
          s.style.lineHeight = `${lineHeightPx}px`;
          s.style.wordWrap = 'break-word';
          s.style.overflowWrap = 'break-word';
          s.textContent = chapter.subtitle;
          wrap.appendChild(s);
          elements.push(wrap);
        }
      } else {
        currentParaWords.push(token);
      }
    }

    if (currentParaWords.length > 0) {
      const paraText = currentParaWords.join(' ');
      const p = createParagraphElement(true);
      p.textContent = paraText || ' ';
      elements.push(p);
    }

    elements.forEach((el) => content.appendChild(el));

    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  };

  const findCutoff = async (batchTokens: string[]): Promise<number> => {
    if (batchTokens.length === 0) return 0;
    let low = 0;
    let high = batchTokens.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const testTokens = [...currentPageTokens, ...batchTokens.slice(0, mid)];
      await rebuildDOM(testTokens);
      if (content.scrollHeight <= MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  };

  const commitPage = async () => {
    const paragraphs: string[] = [];
    let currentParaWords: string[] = [];

    for (const token of currentPageTokens) {
      if (token === '\n\n') {
        if (currentParaWords.length > 0) {
          paragraphs.push(currentParaWords.join(' '));
          currentParaWords = [];
        }
      } else if (
        token.startsWith('__HEADER__') ||
        token.startsWith('__TITLE__') ||
        token.startsWith('__SUBTITLE__')
      ) {
        if (currentParaWords.length > 0) {
          paragraphs.push(currentParaWords.join(' '));
          currentParaWords = [];
        }
        paragraphs.push(token);
      } else {
        currentParaWords.push(token);
      }
    }

    if (currentParaWords.length > 0) {
      paragraphs.push(currentParaWords.join(' '));
    }

    pages.push(paragraphs.join('\n\n'));
    currentPageTokens = [];
    if (onPagesUpdate) {
      await onPagesUpdate(pages.slice());
    }
    if (pages.length % 2 === 0) {
      await yieldToMain();
    }
  };

  const isAtomicToken = (token: string): boolean =>
    token.startsWith('__HEADER__') || token.startsWith('__TITLE__') || token.startsWith('__SUBTITLE__');

  const BATCH_SIZE = 30;

  while (tokenIndex < tokens.length) {
    if (shouldCancel?.()) break;

    const batch: string[] = [];
    const batchStartIndex = tokenIndex;

    while (tokenIndex < tokens.length && batch.length < BATCH_SIZE) {
      batch.push(tokens[tokenIndex]);
      tokenIndex++;
    }

    const testTokens = [...currentPageTokens, ...batch];
    await rebuildDOM(testTokens);

    if (content.scrollHeight <= MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX) {
      currentPageTokens.push(...batch);
    } else {
      const cutoff = await findCutoff(batch);

      if (cutoff > 0) {
        let safeCutoff = cutoff;
        if (cutoff < batch.length && isAtomicToken(batch[cutoff])) {
          safeCutoff = cutoff;
        } else if (cutoff > 0 && isAtomicToken(batch[cutoff - 1])) {
          safeCutoff = cutoff;
        }

        const fittingTokens = batch.slice(0, safeCutoff);
        currentPageTokens.push(...fittingTokens);

        await commitPage();

        tokenIndex = batchStartIndex + safeCutoff;

        if (safeCutoff < batch.length) {
          const remainingTokens = batch.slice(safeCutoff);
          currentPageTokens.push(...remainingTokens);
          await rebuildDOM(currentPageTokens);

          if (content.scrollHeight > MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX) {
            currentPageTokens = [];

            while (tokenIndex < batchStartIndex + batch.length) {
              if (shouldCancel?.()) break;
              const token = tokens[tokenIndex];

              if (isAtomicToken(token)) {
                if (currentPageTokens.length > 0) {
                  await commitPage();
                }
                currentPageTokens = [token];
                await rebuildDOM(currentPageTokens);
                tokenIndex++;
              } else {
                currentPageTokens.push(token);
                await rebuildDOM(currentPageTokens);

                if (
                  content.scrollHeight > MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX &&
                  currentPageTokens.length > 1
                ) {
                  currentPageTokens.pop();
                  await commitPage();
                  currentPageTokens = [token];
                  await rebuildDOM(currentPageTokens);
                }
                tokenIndex++;
              }
            }
          } else {
            tokenIndex = batchStartIndex + batch.length;
          }
        } else {
          tokenIndex = batchStartIndex + batch.length;
        }
      } else {
        await commitPage();

        tokenIndex = batchStartIndex;

        while (tokenIndex < batchStartIndex + batch.length) {
          if (shouldCancel?.()) break;
          const token = tokens[tokenIndex];

          if (isAtomicToken(token)) {
            if (currentPageTokens.length > 0) {
              await commitPage();
            }
            currentPageTokens = [token];
            await rebuildDOM(currentPageTokens);
            tokenIndex++;
          } else {
            currentPageTokens.push(token);
            await rebuildDOM(currentPageTokens);

            if (
              content.scrollHeight > MAX_CONTENT_SCROLL_HEIGHT_WITH_TOLERANCE_PX &&
              currentPageTokens.length > 1
            ) {
              currentPageTokens.pop();
              await commitPage();
              currentPageTokens = [token];
              await rebuildDOM(currentPageTokens);
            }
            tokenIndex++;
          }
        }
      }
    }
  }

  if (!shouldCancel?.() && (currentPageTokens.length > 0 || pages.length === 0)) {
    await commitPage();
  }

  return shouldCancel?.() ? pages : pages.length ? pages : [''];
  } finally {
    measureDiv.innerHTML = '';
  }
}
