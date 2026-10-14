# Book Formatter QA Manuscript Fixtures

Synthetic, non-copyrighted manuscripts for repeatable manual QA. Every size is included as both `.txt` and `.docx`.

| Fixture | Requested size | Actual body words | Chapters | Total TXT words* | TXT size | DOCX size |
|---|---:|---:|---:|---:|---:|---:|
| small-manuscript | ~5,000 | 5,070 | 5 | 5,086 | 30.2 KB | 37.5 KB |
| medium-manuscript | ~50,000 | 50,210 | 25 | 50,296 | 298.4 KB | 40.4 KB |
| large-novel | ~100,000 | 100,419 | 40 | 100,559 | 596.7 KB | 43.0 KB |
| very-large-manuscript | ~210,000 | 210,579 | 70 | 210,821 | 1.2 MB | 48.4 KB |

\*Total TXT words include chapter-heading words.

Heading patterns intentionally alternate among `Chapter N`, `CHAPTER N`, and titled variants to exercise chapter detection.
DOCX fixtures use 12 pt Times New Roman body text, 1-inch margins, Heading 1 chapter headings, first-line indents, and page breaks before chapters.

Recommended use:
- Small: smoke/import/chapter-detection checks.
- Medium: pagination and export regression checks.
- Large: performance, pagination, export, and persistence-heavy QA.
- Very large: optional stress testing.