import type { Block, InlineMark, Section, TextRun } from '@folio-loom/book-model';

/** Characters XML 1.0 forbids outright (they would make the EPUB unparseable). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Escape text for XHTML element content and attribute values. */
export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const MARK_TAGS: Record<InlineMark, [open: string, close: string]> = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  underline: ['<span class="u">', '</span>'],
  strikethrough: ['<s>', '</s>'],
  smallCaps: ['<span class="sc">', '</span>'],
  superscript: ['<sup>', '</sup>'],
  subscript: ['<sub>', '</sub>'],
};

export function runsToXhtml(runs: readonly TextRun[]): string {
  return runs
    .map((run) => {
      const text = escapeXml(run.text).replace(/\n/g, '<br/>');
      const marks = run.marks ?? [];
      const open = marks.map((mark) => MARK_TAGS[mark][0]).join('');
      const close = [...marks].reverse().map((mark) => MARK_TAGS[mark][1]).join('');
      return `${open}${text}${close}`;
    })
    .join('');
}

export function blockToXhtml(block: Block): string {
  switch (block.type) {
    case 'paragraph': {
      const classes = [block.variant && block.variant !== 'body' ? block.variant : null, block.align ? `align-${block.align}` : null]
        .filter(Boolean)
        .join(' ');
      return `<p${classes ? ` class="${classes}"` : ''}>${runsToXhtml(block.runs)}</p>`;
    }
    case 'heading': {
      // h1 is the section title, so block headings start at h2.
      return `<h${block.level}>${runsToXhtml(block.runs)}</h${block.level}>`;
    }
    case 'sceneBreak':
      return `<hr class="scene-break" title="${escapeXml(block.marker ?? '* * *')}"/>`;
  }
}

/** A complete EPUB 3 content document for one section. */
export function sectionToXhtml(section: Section, options: { language: string; chapterNumber?: number }): string {
  const lang = escapeXml(options.language);
  const type = section.kind === 'chapter' ? 'chapter' : section.kind === 'frontMatter' ? 'frontmatter' : 'backmatter';
  const label = options.chapterNumber !== undefined ? `<p class="chapter-number">${options.chapterNumber}</p>` : '';
  const subtitle = section.subtitle ? `<p class="subtitle">${escapeXml(section.subtitle)}</p>` : '';
  const title = section.title ? `<h1>${escapeXml(section.title)}</h1>` : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE html>',
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">`,
    `<head><meta charset="UTF-8"/><title>${escapeXml(section.title || 'Section')}</title></head>`,
    `<body><section epub:type="${type}">`,
    `${label}${title}${subtitle}`,
    ...section.blocks.map(blockToXhtml),
    '</section></body>',
    '</html>',
  ].join('\n');
}
