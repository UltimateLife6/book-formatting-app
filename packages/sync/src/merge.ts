import type { Part } from '@folio-loom/book-model';
import { canonicalJson } from './hash';
import type { BookStructure } from './units';

const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

/** True when the elements both lists share appear in a different relative order. */
export function relativeOrderChanged(a: readonly string[], b: readonly string[]): boolean {
  const inB = new Set(b);
  const inA = new Set(a);
  const left = a.filter((id) => inB.has(id));
  const right = b.filter((id) => inA.has(id));
  return left.some((id, index) => right[index] !== id);
}

/**
 * Order containing exactly `members`: `primary`'s order first, then each member only `secondary`
 * knows about inserted after its nearest preceding neighbour from `secondary`.
 */
export function weaveOrder(primary: readonly string[], secondary: readonly string[], members: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const placed = new Set<string>();
  for (const id of primary) {
    if (members.has(id) && !placed.has(id)) {
      out.push(id);
      placed.add(id);
    }
  }
  for (let i = 0; i < secondary.length; i++) {
    const id = secondary[i] as string;
    if (!members.has(id) || placed.has(id)) continue;
    let position = 0;
    for (let j = i - 1; j >= 0; j--) {
      const at = out.indexOf(secondary[j] as string);
      if (at >= 0) {
        position = at + 1;
        break;
      }
    }
    out.splice(position, 0, id);
    placed.add(id);
  }
  for (const id of members) {
    if (!placed.has(id)) {
      out.push(id);
      placed.add(id);
    }
  }
  return out;
}

/** Drops part entries for sections that no longer exist and orders them like the book. */
export function fitParts(parts: readonly Part[], order: readonly string[]): Part[] {
  const position = new Map(order.map((id, index) => [id, index]));
  return parts.map((part) => ({
    ...part,
    sectionIds: part.sectionIds.filter((id) => position.has(id)).sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0)),
  }));
}

export interface StructureMerge {
  structure: BookStructure;
  /** Concurrent different values for a field, or concurrent different reorders. */
  conflict: boolean;
}

const FIELDS = ['title', 'subtitle', 'authors', 'language', 'metadata', 'createdAt', 'parts'] as const;

/**
 * Three-way merge of the structure unit. Section membership is decided by the section-level
 * merge (`members`); this only decides fields and relative order. On conflict the local values
 * are kept (still containing every member) and the caller records the conflict.
 */
export function mergeStructure(
  base: BookStructure | null,
  local: BookStructure,
  remote: BookStructure,
  members: ReadonlySet<string>,
): StructureMerge {
  let conflict = false;
  const merged: Record<string, unknown> = {};
  for (const field of FIELDS) {
    const l = local[field];
    const r = remote[field];
    let value: unknown;
    if (same(l, r)) value = l;
    else if (base && same(l, base[field])) value = r;
    else if (base && same(r, base[field])) value = l;
    else {
      conflict = true;
      value = l;
    }
    if (value !== undefined) merged[field] = value;
  }

  const localReordered = base ? relativeOrderChanged(base.order, local.order) : false;
  const remoteReordered = base ? relativeOrderChanged(base.order, remote.order) : false;
  const diverged = relativeOrderChanged(local.order, remote.order);
  if (diverged && (base ? localReordered && remoteReordered : true)) conflict = true;
  const remoteLeads = remoteReordered && !localReordered && !conflict;
  const order = remoteLeads ? weaveOrder(remote.order, local.order, members) : weaveOrder(local.order, remote.order, members);

  const structure = { ...merged, order } as BookStructure;
  structure.parts = fitParts(structure.parts, order);
  return { structure, conflict };
}

/** `structure` with exactly `members`, keeping its own order and placing others by `other`. */
export function withMembers(structure: BookStructure, other: readonly string[], members: ReadonlySet<string>): BookStructure {
  const order = weaveOrder(structure.order, other, members);
  return { ...structure, order, parts: fitParts(structure.parts, order) };
}
