export type IdPrefix = 'bk' | 'sec' | 'blk' | 'prt';

export type IdGenerator = (prefix: IdPrefix) => string;

interface CryptoLike {
  randomUUID?: () => string;
}

let fallbackCounter = 0;

/**
 * Stable, Firestore-safe identifiers. Uses `crypto.randomUUID` when the runtime provides it;
 * the fallback is unique enough for IDs but is not a security token.
 */
export const createId: IdGenerator = (prefix) => {
  const cryptoLike = (globalThis as { crypto?: CryptoLike }).crypto;
  if (cryptoLike?.randomUUID) {
    return `${prefix}_${cryptoLike.randomUUID().replace(/-/g, '')}`;
  }
  fallbackCounter = (fallbackCounter + 1) % 1_679_616;
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 12).padEnd(10, '0');
  return `${prefix}_${time}${random}${fallbackCounter.toString(36)}`;
};

/** Deterministic IDs for tests and fixtures. */
export function createSequentialIdGenerator(seed = 't'): IdGenerator {
  let next = 0;
  return (prefix) => {
    next += 1;
    return `${prefix}_${seed}${next.toString(36)}`;
  };
}
