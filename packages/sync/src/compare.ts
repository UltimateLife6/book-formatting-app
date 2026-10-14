export interface LocalVersion {
  /** Last server revision this device saw. */
  baseRevision: number;
  /** True when there are local edits not yet acknowledged by the server. */
  dirty: boolean;
  localHash: string;
}

export interface RemoteVersion {
  revision: number;
  contentHash: string;
}

export type SyncDecision =
  | { action: 'inSync' }
  | { action: 'pull' }
  | { action: 'push'; expectedRevision: number }
  | { action: 'conflict'; reason: 'bothChanged' | 'remoteRewound' };

/**
 * Decide what to do with one document. Never overwrites: if both sides changed, the caller
 * must keep both copies and ask the author.
 */
export function compareVersions(local: LocalVersion, remote: RemoteVersion): SyncDecision {
  if (remote.revision < local.baseRevision) return { action: 'conflict', reason: 'remoteRewound' };
  const remoteChanged = remote.revision > local.baseRevision;
  if (!local.dirty) return remoteChanged ? { action: 'pull' } : { action: 'inSync' };
  if (!remoteChanged) return { action: 'push', expectedRevision: local.baseRevision };
  // Both changed; identical content (e.g. same edit on two devices) is not a real conflict.
  if (remote.contentHash === local.localHash) return { action: 'pull' };
  return { action: 'conflict', reason: 'bothChanged' };
}
