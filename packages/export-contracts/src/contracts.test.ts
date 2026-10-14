import { describe, expect, it } from 'vitest';
import { countsTowardAllowance, evaluateExportAllowance, PROVISIONAL_EXPORT_POLICY, periodKeyFor } from './index';

describe('export-contracts', () => {
  it('marks the free limit as provisional', () => {
    expect(PROVISIONAL_EXPORT_POLICY).toEqual({ freeExportsPerMonth: 3, provisional: true });
  });

  it('uses UTC months for periods', () => {
    expect(periodKeyFor(new Date('2026-10-31T23:30:00-05:00'))).toBe('2026-11');
    expect(periodKeyFor(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  it('allows three free exports, then blocks; pro is unlimited', () => {
    expect(evaluateExportAllowance({ plan: 'free', usedThisPeriod: 0 })).toEqual({ allowed: true, remaining: 2 });
    expect(evaluateExportAllowance({ plan: 'free', usedThisPeriod: 2 })).toEqual({ allowed: true, remaining: 0 });
    expect(evaluateExportAllowance({ plan: 'free', usedThisPeriod: 3 }).allowed).toBe(false);
    expect(evaluateExportAllowance({ plan: 'pro', usedThisPeriod: 500 })).toEqual({ allowed: true, remaining: null });
  });

  it('does not charge failed or refunded exports', () => {
    expect(countsTowardAllowance({ status: 'failed' })).toBe(false);
    expect(countsTowardAllowance({ status: 'refunded' })).toBe(false);
    expect(countsTowardAllowance({ status: 'reserved' })).toBe(true);
  });
});
