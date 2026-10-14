import { describe, expect, it } from 'vitest';
import { canonicalJson, compareVersions, stableHash } from './index';

describe('compareVersions', () => {
  const remote = (revision: number, contentHash = 'r') => ({ revision, contentHash });

  it('pulls or stays in sync when there are no local edits', () => {
    expect(compareVersions({ baseRevision: 3, dirty: false, localHash: 'l' }, remote(3))).toEqual({ action: 'inSync' });
    expect(compareVersions({ baseRevision: 3, dirty: false, localHash: 'l' }, remote(4))).toEqual({ action: 'pull' });
  });

  it('pushes local edits against the expected revision', () => {
    expect(compareVersions({ baseRevision: 3, dirty: true, localHash: 'l' }, remote(3))).toEqual({ action: 'push', expectedRevision: 3 });
  });

  it('reports a conflict instead of overwriting when both sides changed', () => {
    expect(compareVersions({ baseRevision: 3, dirty: true, localHash: 'l' }, remote(5))).toEqual({ action: 'conflict', reason: 'bothChanged' });
    expect(compareVersions({ baseRevision: 3, dirty: true, localHash: 'same' }, remote(5, 'same'))).toEqual({ action: 'pull' });
  });

  it('treats a server revision older than the local base as a conflict', () => {
    expect(compareVersions({ baseRevision: 7, dirty: false, localHash: 'l' }, remote(2))).toEqual({ action: 'conflict', reason: 'remoteRewound' });
  });
});

describe('stableHash', () => {
  it('ignores key order and undefined values but not content', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    expect(stableHash({ text: 'Chapter 1' })).not.toBe(stableHash({ text: 'Chapter 2' }));
    expect(stableHash('x')).toMatch(/^[0-9a-f]{14}$/);
  });
});
