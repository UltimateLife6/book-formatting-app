import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Manuscript } from '@folio-loom/book-model';
import { importTxt } from '@folio-loom/import-engine';

export type FixtureName = 'small-manuscript' | 'medium-manuscript' | 'large-novel' | 'very-large-manuscript';

export function fixtureText(name: FixtureName): string {
  return readFileSync(fileURLToPath(new URL(`../../../../qa/fixtures/${name}.txt`, import.meta.url)), 'utf8');
}

export function importFixture(name: FixtureName): Manuscript {
  return importTxt(fixtureText(name), { title: name }).manuscript;
}
