import type { ExportRequest } from '@folio-loom/export-contracts';
import { describe, expect, it } from 'vitest';
import { admitExportRequest, InMemoryExportLedger } from './index';

const now = new Date('2026-10-14T12:00:00Z');
const request = (n: number, userId = 'user_a'): ExportRequest => ({
  requestId: `req_${userId}_${n}`,
  userId,
  manuscriptId: 'bk_1',
  revision: 1,
  format: 'epub3',
});

describe('admitExportRequest', () => {
  it('retrying the same requestId never charges twice', async () => {
    const ledger = new InMemoryExportLedger();
    expect((await admitExportRequest(ledger, request(1), { plan: 'free', now })).status).toBe('admitted');
    expect((await admitExportRequest(ledger, request(1), { plan: 'free', now })).status).toBe('duplicate');
    expect(ledger.all()).toHaveLength(1);
  });

  it('rejects the fourth free export in a month but not the next month', async () => {
    const ledger = new InMemoryExportLedger();
    for (const n of [1, 2, 3]) {
      expect((await admitExportRequest(ledger, request(n), { plan: 'free', now })).status).toBe('admitted');
    }
    expect(await admitExportRequest(ledger, request(4), { plan: 'free', now })).toEqual({ status: 'rejected', reason: 'free_limit_reached' });
    const nextMonth = new Date('2026-11-01T00:00:00Z');
    expect((await admitExportRequest(ledger, request(5), { plan: 'free', now: nextMonth })).status).toBe('admitted');
  });

  it('failed exports are refunded to the allowance', async () => {
    const ledger = new InMemoryExportLedger();
    for (const n of [1, 2, 3]) await admitExportRequest(ledger, request(n), { plan: 'free', now });
    await ledger.setStatus(request(2).requestId, 'failed');
    expect((await admitExportRequest(ledger, request(4), { plan: 'free', now })).status).toBe('admitted');
  });

  it('pro users are unlimited and users do not share allowances', async () => {
    const ledger = new InMemoryExportLedger();
    for (const n of [1, 2, 3, 4, 5]) {
      expect((await admitExportRequest(ledger, request(n), { plan: 'pro', now })).status).toBe('admitted');
    }
    expect((await admitExportRequest(ledger, request(1, 'user_b'), { plan: 'free', now })).status).toBe('admitted');
  });
});
