import { StorageError, toStorageError } from './errors';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed';

export interface AutosaveSnapshot {
  status: SaveStatus;
  /** Set while `status` is `failed`, and kept until a later save succeeds. */
  error: StorageError | null;
  /** Local revision of the last successful save. */
  revision: number;
  lastSavedAt: string | null;
}

export interface AutosaveReceipt {
  localRevision: number;
  updatedAt: string;
}

export interface AutosaveTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaveOptions<T> {
  /** Revision of the content currently in storage (from `load`/`create`). */
  initialRevision: number;
  initialSavedAt?: string | null;
  /** Must reject (never resolve) when the write did not durably complete. */
  save(value: T, expectedRevision: number): Promise<AutosaveReceipt>;
  /** Quiet period after the last edit before saving. Default 800 ms. */
  debounceMs?: number;
  /** Longest an edit may stay unsaved during continuous typing. Default 5 s. */
  maxWaitMs?: number;
  timers?: AutosaveTimers;
}

export interface AutosaveCloseResult {
  snapshot: AutosaveSnapshot;
  /** Latest value that could not be saved (so the caller can keep it), or `null` if everything was saved. */
  unsaved: unknown;
}

const defaultTimers: AutosaveTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Debounced, strictly sequential autosave for one open document.
 *
 * - At most one write is in flight. Edits made meanwhile are coalesced into the next write, which
 *   starts only after the previous one settles, so an older value can never land after a newer one.
 * - Each write passes the revision it is based on; the store refuses stale writes.
 * - `saved` is reported only after `save` resolves. On failure the latest value stays pending,
 *   status is `failed`, and `flush()`/`retry()` (or the next edit) tries again.
 */
export class AutosaveController<T> {
  private pending: { value: T } | null = null;
  private inFlight: Promise<boolean> | null = null;
  private debounceHandle: unknown = null;
  private maxWaitHandle: unknown = null;
  private disposed = false;
  private accepting = true;
  private failures = 0;
  private snapshot: AutosaveSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly timers: AutosaveTimers;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;

  constructor(private readonly options: AutosaveOptions<T>) {
    this.timers = options.timers ?? defaultTimers;
    this.debounceMs = options.debounceMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 5_000;
    this.snapshot = { status: 'saved', error: null, revision: options.initialRevision, lastSavedAt: options.initialSavedAt ?? null };
  }

  getSnapshot = (): AutosaveSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<AutosaveSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** True while anything is not yet durably stored (pending, writing, or failed). */
  hasUnsavedChanges(): boolean {
    return this.pending !== null || this.inFlight !== null;
  }

  /**
   * Records the latest full document state and schedules a save. Throws after `close`/`dispose`:
   * an edit sent to a dead controller would otherwise be lost while the UI still says "Saved".
   */
  update(value: T) {
    if (!this.accepting) {
      throw new StorageError('closed', { message: 'This editor was closed, so the change was not saved. Reopen the manuscript to keep editing.' });
    }
    this.pending = { value };
    if (this.snapshot.status === 'saved') this.set({ status: 'unsaved' });
    this.clearTimer('debounce');
    this.debounceHandle = this.timers.setTimeout(() => void this.flush(), this.debounceMs);
    if (this.maxWaitHandle === null) {
      this.maxWaitHandle = this.timers.setTimeout(() => void this.flush(), this.maxWaitMs);
    }
  }

  private clearTimer(which: 'debounce' | 'maxWait') {
    const handle = which === 'debounce' ? this.debounceHandle : this.maxWaitHandle;
    if (handle !== null) this.timers.clearTimeout(handle);
    if (which === 'debounce') this.debounceHandle = null;
    else this.maxWaitHandle = null;
  }

  /** Saves everything pending now. Resolves once it is stored, or with `failed` status if a write fails. */
  flush(): Promise<AutosaveSnapshot> {
    this.clearTimer('debounce');
    this.clearTimer('maxWait');
    return this.drain();
  }

  retry(): Promise<AutosaveSnapshot> {
    return this.flush();
  }

  private async drain(): Promise<AutosaveSnapshot> {
    const failuresAtStart = this.failures;
    while (!this.disposed && this.failures === failuresAtStart) {
      if (this.inFlight) {
        await this.inFlight;
        continue;
      }
      if (!this.pending) break;
      await this.startWrite();
    }
    return this.snapshot;
  }

  private startWrite(): Promise<boolean> {
    const job = this.pending as { value: T };
    this.pending = null;
    let settle: (ok: boolean) => void = () => {};
    const done = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    // Assigned before `save` runs, so even a synchronous throw leaves no stale handle behind.
    this.inFlight = done;
    this.set({ status: 'saving' });

    void (async () => {
      let ok = false;
      try {
        const receipt = await this.options.save(job.value, this.snapshot.revision);
        ok = true;
        if (!this.disposed) {
          this.set({
            status: this.pending ? 'unsaved' : 'saved',
            error: null,
            revision: receipt.localRevision,
            lastSavedAt: receipt.updatedAt,
          });
        }
      } catch (error) {
        if (!this.disposed) {
          // Newer edits already contain this content (values are full document states).
          if (!this.pending) this.pending = job;
          this.failures += 1;
          this.set({ status: 'failed', error: toStorageError(error) });
        }
      } finally {
        this.inFlight = null;
        settle(ok);
      }
    })();
    return done;
  }

  /** Stops accepting edits, saves what is pending, then disposes. */
  async close(): Promise<AutosaveCloseResult> {
    this.accepting = false;
    const snapshot = await this.flush();
    const unsaved = this.pending ? this.pending.value : null;
    this.dispose();
    return { snapshot, unsaved };
  }

  /**
   * Drops pending edits and timers immediately (e.g. on account switch). A write already in
   * flight finishes in its own account's storage but can no longer change this controller.
   */
  dispose() {
    this.disposed = true;
    this.accepting = false;
    this.pending = null;
    this.clearTimer('debounce');
    this.clearTimer('maxWait');
    this.listeners.clear();
  }
}
