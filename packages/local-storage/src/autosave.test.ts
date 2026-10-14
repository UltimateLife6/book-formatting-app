import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveController, type AutosaveReceipt, type SaveStatus } from './autosave';
import { StorageError } from './errors';

interface Call {
  value: string;
  expected: number;
  resolve(receipt?: Partial<AutosaveReceipt>): void;
  reject(error: unknown): void;
}

/** A save function whose calls stay pending until the test settles them. */
function controllableSave() {
  const calls: Call[] = [];
  let revision = 0;
  const save = (value: string, expected: number) =>
    new Promise<AutosaveReceipt>((resolve, reject) => {
      calls.push({
        value,
        expected,
        resolve: (receipt) => {
          revision = expected + 1;
          resolve({ localRevision: revision, updatedAt: `t${revision}`, ...receipt });
        },
        reject,
      });
    });
  return { calls, save };
}

const tick = () => Promise.resolve().then(() => undefined);
async function settle() {
  for (let i = 0; i < 5; i++) await tick();
}

describe('AutosaveController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function make(overrides: { debounceMs?: number; maxWaitMs?: number } = {}) {
    const { calls, save } = controllableSave();
    const controller = new AutosaveController<string>({ initialRevision: 1, save, debounceMs: 500, maxWaitMs: 3000, ...overrides });
    const statuses: SaveStatus[] = [];
    controller.subscribe(() => statuses.push(controller.getSnapshot().status));
    return { controller, calls, statuses };
  }

  it('debounces edits into one save after the quiet period', async () => {
    const { controller, calls } = make();
    controller.update('a');
    vi.advanceTimersByTime(300);
    controller.update('ab');
    vi.advanceTimersByTime(300);
    controller.update('abc');
    expect(calls).toHaveLength(0);
    expect(controller.getSnapshot().status).toBe('unsaved');
    vi.advanceTimersByTime(500);
    expect(calls.map((c) => c.value)).toEqual(['abc']);
  });

  it('saves at least every maxWait during continuous typing', async () => {
    const { controller, calls } = make();
    for (let i = 0; i < 20; i++) {
      controller.update(`v${i}`);
      vi.advanceTimersByTime(200);
    }
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]?.value).toBe('v14');
  });

  it('never reports Saved before the write resolves', async () => {
    const { controller, calls, statuses } = make();
    controller.update('draft');
    const flushed = controller.flush();
    expect(controller.getSnapshot().status).toBe('saving');
    await settle();
    expect(controller.getSnapshot().status).toBe('saving');
    calls[0]?.resolve();
    expect(await flushed).toMatchObject({ status: 'saved', revision: 2, lastSavedAt: 't2' });
    expect(statuses).toEqual(['unsaved', 'saving', 'saved']);
  });

  it('runs one write at a time; edits during a write go out next, based on the new revision', async () => {
    const { controller, calls } = make();
    controller.update('first');
    void controller.flush();
    controller.update('second');
    controller.update('third');
    void controller.flush();
    void controller.flush();
    await settle();
    expect(calls).toHaveLength(1);

    calls[0]?.resolve();
    await settle();
    expect(calls.map((c) => [c.value, c.expected])).toEqual([
      ['first', 1],
      ['third', 2],
    ]);
    expect(controller.getSnapshot().status).toBe('saving');
    calls[1]?.resolve();
    await settle();
    expect(controller.getSnapshot()).toMatchObject({ status: 'saved', revision: 3 });
  });

  it('an older write can never land after a newer one', async () => {
    const { controller, calls } = make();
    const landed: string[] = [];
    controller.update('old');
    void controller.flush();
    controller.update('new');
    void controller.flush();
    await settle();
    // The newer value is not even sent until the older write has settled.
    expect(calls.map((c) => c.value)).toEqual(['old']);
    calls[0]?.resolve();
    landed.push('old');
    await settle();
    calls[1]?.resolve();
    landed.push(calls[1]?.value ?? '');
    await settle();
    expect(landed).toEqual(['old', 'new']);
  });

  it('keeps the unsaved value after a failure and retries it', async () => {
    const { controller, calls } = make();
    controller.update('precious words');
    const first = controller.flush();
    calls[0]?.reject(new StorageError('quota_exceeded'));
    const failed = await first;
    expect(failed.status).toBe('failed');
    expect(failed.error?.code).toBe('quota_exceeded');
    expect(failed.revision).toBe(1);
    expect(controller.hasUnsavedChanges()).toBe(true);

    const retried = controller.retry();
    expect(calls[1]?.value).toBe('precious words');
    calls[1]?.resolve();
    expect(await retried).toMatchObject({ status: 'saved', error: null, revision: 2 });
    expect(controller.hasUnsavedChanges()).toBe(false);
  });

  it('keeps showing the failure while new edits are made, then retries with the newest value', async () => {
    const { controller, calls } = make();
    controller.update('one');
    const flushed = controller.flush();
    calls[0]?.reject(new Error('disk I/O error'));
    await flushed;
    controller.update('one two');
    expect(controller.getSnapshot().status).toBe('failed');
    vi.advanceTimersByTime(500);
    expect(calls[1]?.value).toBe('one two');
    calls[1]?.resolve();
    await settle();
    expect(controller.getSnapshot()).toMatchObject({ status: 'saved', error: null });
  });

  it('a failing write does not loop: one flush makes one attempt', async () => {
    const { controller, calls } = make();
    controller.update('x');
    const a = controller.flush();
    const b = controller.flush();
    calls[0]?.reject(new Error('nope'));
    await Promise.all([a, b]);
    expect(calls).toHaveLength(1);
  });

  it('surfaces stale-revision refusals as failures', async () => {
    const { controller, calls } = make();
    controller.update('x');
    const flushed = controller.flush();
    calls[0]?.reject(new StorageError('stale_revision'));
    expect((await flushed).error?.code).toBe('stale_revision');
  });

  it('handles a save function that throws synchronously', async () => {
    const controller = new AutosaveController<string>({
      initialRevision: 1,
      save: () => {
        throw new Error('sync boom');
      },
    });
    controller.update('x');
    expect((await controller.flush()).status).toBe('failed');
    expect((await controller.flush()).status).toBe('failed');
  });

  it('dispose drops pending edits and ignores the in-flight result', async () => {
    const { controller, calls } = make();
    controller.update('a');
    void controller.flush();
    controller.update('b');
    controller.dispose();
    calls[0]?.resolve();
    await settle();
    vi.advanceTimersByTime(10_000);
    expect(calls).toHaveLength(1);
    expect(() => controller.update('lost')).toThrow(expect.objectContaining({ code: 'closed' }));
    vi.advanceTimersByTime(10_000);
    expect(calls).toHaveLength(1);
  });

  it('close saves what is pending, then stops accepting edits', async () => {
    const { controller, calls } = make();
    controller.update('last words');
    const closing = controller.close();
    expect(() => controller.update('after close')).toThrow(expect.objectContaining({ code: 'closed' }));
    calls[0]?.resolve();
    const result = await closing;
    expect(result).toMatchObject({ snapshot: { status: 'saved' }, unsaved: null });
    expect(calls.map((c) => c.value)).toEqual(['last words']);
  });

  it('close returns the unsaved value when the final save fails', async () => {
    const { controller, calls } = make();
    controller.update('keep me');
    const closing = controller.close();
    calls[0]?.reject(new Error('fail'));
    expect(await closing).toMatchObject({ snapshot: { status: 'failed' }, unsaved: 'keep me' });
  });
});
