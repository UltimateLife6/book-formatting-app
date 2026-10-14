import {
  countsTowardAllowance,
  evaluateExportAllowance,
  type ExportLedgerEntry,
  type ExportPolicy,
  type ExportRequest,
  type LedgerStatus,
  type Plan,
  PROVISIONAL_EXPORT_POLICY,
  periodKeyFor,
} from '@folio-loom/export-contracts';

/**
 * Ledger storage. A Firestore implementation must perform `reserve` inside a transaction that
 * reads the user's period entries and the requestId document together.
 */
export interface ExportLedger {
  /** Atomically: return the existing entry for `requestId`, or run `decide` and store its entry. */
  reserve(
    request: ExportRequest,
    periodKey: string,
    decide: (usedThisPeriod: number) => ExportLedgerEntry | null,
  ): Promise<{ existing: ExportLedgerEntry | null; created: ExportLedgerEntry | null }>;
  setStatus(requestId: string, status: LedgerStatus): Promise<void>;
}

export type AdmissionResult =
  | { status: 'admitted'; entry: ExportLedgerEntry; remaining: number | null }
  | { status: 'duplicate'; entry: ExportLedgerEntry }
  | { status: 'rejected'; reason: 'free_limit_reached' };

export async function admitExportRequest(
  ledger: ExportLedger,
  request: ExportRequest,
  context: { plan: Plan; now: Date; policy?: ExportPolicy },
): Promise<AdmissionResult> {
  const periodKey = periodKeyFor(context.now);
  let remaining: number | null = null;
  const { existing, created } = await ledger.reserve(request, periodKey, (used) => {
    const decision = evaluateExportAllowance({ plan: context.plan, usedThisPeriod: used, policy: context.policy ?? PROVISIONAL_EXPORT_POLICY });
    if (!decision.allowed) return null;
    remaining = decision.remaining;
    return {
      requestId: request.requestId,
      userId: request.userId,
      manuscriptId: request.manuscriptId,
      format: request.format,
      periodKey,
      status: 'reserved',
      createdAt: context.now.toISOString(),
    };
  });
  if (existing) return { status: 'duplicate', entry: existing };
  if (created) return { status: 'admitted', entry: created, remaining };
  return { status: 'rejected', reason: 'free_limit_reached' };
}

/** For tests and local development only. */
export class InMemoryExportLedger implements ExportLedger {
  private readonly entries = new Map<string, ExportLedgerEntry>();

  async reserve(
    request: ExportRequest,
    periodKey: string,
    decide: (usedThisPeriod: number) => ExportLedgerEntry | null,
  ): Promise<{ existing: ExportLedgerEntry | null; created: ExportLedgerEntry | null }> {
    const existing = this.entries.get(request.requestId);
    if (existing) return { existing, created: null };
    const used = [...this.entries.values()].filter(
      (entry) => entry.userId === request.userId && entry.periodKey === periodKey && countsTowardAllowance(entry),
    ).length;
    const created = decide(used);
    if (created) this.entries.set(created.requestId, created);
    return { existing: null, created };
  }

  async setStatus(requestId: string, status: LedgerStatus): Promise<void> {
    const entry = this.entries.get(requestId);
    if (!entry) throw new Error(`Unknown export request ${requestId}`);
    this.entries.set(requestId, { ...entry, status });
  }

  all(): ExportLedgerEntry[] {
    return [...this.entries.values()];
  }
}
