export type ExportFormat = 'epub3' | 'pdfPrint';

export type Plan = 'free' | 'pro';

export interface ExportRequest {
  /** Client-generated UUID; the idempotency key. Retries must reuse it. */
  requestId: string;
  userId: string;
  manuscriptId: string;
  /** The manuscript revision being exported, so the result matches what the author saw. */
  revision: number;
  format: ExportFormat;
}

export type LedgerStatus = 'reserved' | 'succeeded' | 'failed' | 'refunded';

export interface ExportLedgerEntry {
  requestId: string;
  userId: string;
  manuscriptId: string;
  format: ExportFormat;
  /** UTC calendar month, e.g. "2026-10". */
  periodKey: string;
  status: LedgerStatus;
  createdAt: string;
}

export interface ExportPolicy {
  freeExportsPerMonth: number;
  /** True until product explicitly approves the numbers. */
  provisional: boolean;
}

export const PROVISIONAL_EXPORT_POLICY: ExportPolicy = { freeExportsPerMonth: 3, provisional: true };

export function periodKeyFor(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Entries that consume allowance. Failed and refunded exports are free. */
export function countsTowardAllowance(entry: Pick<ExportLedgerEntry, 'status'>): boolean {
  return entry.status === 'reserved' || entry.status === 'succeeded';
}

export type AllowanceDecision =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: 'free_limit_reached'; remaining: 0 };

export function evaluateExportAllowance(input: { plan: Plan; usedThisPeriod: number; policy?: ExportPolicy }): AllowanceDecision {
  if (input.plan === 'pro') return { allowed: true, remaining: null };
  const limit = (input.policy ?? PROVISIONAL_EXPORT_POLICY).freeExportsPerMonth;
  const remaining = limit - input.usedThisPeriod;
  return remaining > 0 ? { allowed: true, remaining: remaining - 1 } : { allowed: false, reason: 'free_limit_reached', remaining: 0 };
}
