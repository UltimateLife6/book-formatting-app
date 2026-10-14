import { type BatchWrite, type DocData, type DocStore, type DocTx, SERVER_TIME } from './docstore';
import { RemoteError, type RemoteErrorCode } from './errors';

export interface MemoryFault {
  op: 'transaction' | 'batch' | 'read';
  /** `beforeCommit`: nothing is written. `afterCommit`: written, but the client sees an error (lost acknowledgement). */
  when: 'beforeCommit' | 'afterCommit';
  code: RemoteErrorCode;
}

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));
const isServerTime = (value: unknown) => typeof value === 'object' && value !== null && (value as { __serverTime?: unknown }).__serverTime === true;

/**
 * In-memory stand-in for Firestore with the same commit semantics the engine relies on
 * (serializable transactions, atomic batches, server reads) plus the security-rule invariants
 * that matter to sync (owner-only paths, revision +1, no hard deletes). The emulator suite tests
 * the real rules; this one makes failure injection deterministic.
 */
export class MemoryBackend {
  readonly docs = new Map<string, DocData>();
  readonly stats = { reads: 0, writes: 0, commits: 0 };
  private lock: Promise<void> = Promise.resolve();
  private faults: MemoryFault[] = [];
  private clock = Date.parse('2026-10-14T00:00:00.000Z');

  /** Queue a one-shot failure for the next matching operation from any client. */
  inject(fault: MemoryFault) {
    this.faults.push(fault);
  }

  private takeFault(op: MemoryFault['op']): MemoryFault | null {
    const index = this.faults.findIndex((fault) => fault.op === op);
    if (index < 0) return null;
    return this.faults.splice(index, 1)[0] ?? null;
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lock.then(task, task);
    this.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private hooks: (() => Promise<void>)[] = [];

  /** Runs `hook` (e.g. another device committing) just before the next transaction starts. */
  beforeNextTransaction(hook: () => Promise<void>) {
    this.hooks.push(hook);
  }

  /** Emulator restart: everything is gone. */
  reset() {
    this.docs.clear();
  }

  client(currentUid: () => string | null, options: { offline?: () => boolean } = {}): DocStore {
    const backend = this;
    const offline = options.offline ?? (() => false);
    const ensureOnline = () => {
      if (offline()) throw new RemoteError('unavailable', { detail: 'client offline' });
    };
    const read = (path: string) => {
      backend.checkAccess(currentUid(), path, 'read');
      backend.stats.reads++;
      return clone(backend.docs.get(path) ?? null);
    };

    const commit = async (op: 'transaction' | 'batch', writes: BatchWrite[]) => {
      const fault = backend.takeFault(op);
      if (fault?.when === 'beforeCommit') throw new RemoteError(fault.code, { detail: 'injected before commit' });
      backend.applyWrites(currentUid(), writes);
      if (fault?.when === 'afterCommit') throw new RemoteError(fault.code, { detail: 'injected after commit (acknowledgement lost)' });
    };

    return {
      currentUid,
      async get(path) {
        ensureOnline();
        const fault = backend.takeFault('read');
        if (fault) throw new RemoteError(fault.code, { detail: 'injected read failure' });
        return read(path);
      },
      async list(collectionPath) {
        ensureOnline();
        backend.checkAccess(currentUid(), `${collectionPath}/x`, 'read');
        const prefix = `${collectionPath}/`;
        const out: { id: string; data: DocData }[] = [];
        for (const [path, data] of backend.docs) {
          if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) {
            backend.stats.reads++;
            out.push({ id: path.slice(prefix.length), data: clone(data) });
          }
        }
        return out.sort((a, b) => a.id.localeCompare(b.id));
      },
      async transaction(body) {
        ensureOnline();
        const hook = backend.hooks.shift();
        if (hook) await hook();
        return backend.exclusive(async () => {
          ensureOnline();
          const writes: BatchWrite[] = [];
          const tx: DocTx = {
            async get(path) {
              if (writes.length > 0) throw new Error('Transactions must read before writing.');
              return read(path);
            },
            set(path, data) {
              writes.push({ type: 'set', path, data });
            },
            delete(path) {
              writes.push({ type: 'delete', path });
            },
          };
          const result = await body(tx);
          ensureOnline();
          await commit('transaction', writes);
          return result;
        });
      },
      batch(writes) {
        ensureOnline();
        return backend.exclusive(async () => {
          ensureOnline();
          await commit('batch', writes);
        });
      },
    };
  }

  private checkAccess(uid: string | null, path: string, _mode: 'read' | 'write') {
    const [root, owner] = path.split('/');
    if (!uid) throw new RemoteError('unauthenticated');
    if (root !== 'users' || owner !== uid) throw new RemoteError('permission-denied', { detail: `${uid} may not access ${path}` });
  }

  /** All-or-nothing, enforcing the rule invariants sync depends on. */
  private applyWrites(uid: string | null, writes: BatchWrite[]) {
    const time = this.now();
    const staged = new Map<string, DocData | null>();
    for (const write of writes) {
      this.checkAccess(uid, write.path, 'write');
      const before = staged.has(write.path) ? staged.get(write.path) : (this.docs.get(write.path) ?? null);
      const depth = write.path.split('/').length;
      const isHead = depth === 4 && write.path.split('/')[2] === 'manuscripts';
      const isSection = depth === 6 && write.path.split('/')[4] === 'sections';
      if (write.type === 'delete') {
        if (isHead || isSection) throw new RemoteError('permission-denied', { detail: 'heads and sections cannot be deleted' });
        staged.set(write.path, null);
        continue;
      }
      const data: DocData = {};
      for (const [key, value] of Object.entries(write.data)) data[key] = isServerTime(value) ? time : clone(value);
      if (data.ownerId !== uid) throw new RemoteError('permission-denied', { detail: 'ownerId must match the path' });
      if (isHead || isSection) {
        const expected = before ? Number(before.revision) + 1 : 1;
        if (data.revision !== expected) throw new RemoteError('permission-denied', { detail: `revision must be ${expected}, got ${String(data.revision)}` });
      }
      staged.set(write.path, data);
    }
    for (const [path, data] of staged) {
      if (data === null) this.docs.delete(path);
      else this.docs.set(path, data);
      this.stats.writes++;
    }
    this.stats.commits++;
  }
}

export { SERVER_TIME };
