import type { Chapter, ManuscriptStructure } from '../context/BookContext';

/** Same ordering as Preview / Export (front matter, parts, standalone chapters, back matter). */
export function getAllChaptersInOrder(manuscript: ManuscriptStructure): Chapter[] {
  const allChapters: Chapter[] = [];
  allChapters.push(...manuscript.frontMatter);
  manuscript.parts.forEach((part) => {
    part.chapterIds.forEach((chapterId) => {
      const chapter = manuscript.chapters.find((c) => c.id === chapterId);
      if (chapter) allChapters.push(chapter);
    });
  });
  const chaptersInParts = new Set(manuscript.parts.flatMap((part) => part.chapterIds));
  allChapters.push(...manuscript.chapters.filter((c) => !chaptersInParts.has(c.id)));
  allChapters.push(...manuscript.backMatter);
  return allChapters;
}
