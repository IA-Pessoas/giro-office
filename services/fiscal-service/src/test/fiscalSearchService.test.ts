import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import type { FiscalSearchServicePrisma } from "../services/fiscalSearchService.js";
import { FiscalSearchService } from "../services/fiscalSearchService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";

function createMockPrisma(
  overrides: Partial<Pick<FiscalSearchServicePrisma, "$transaction">> = {},
): FiscalSearchServicePrisma {
  return {
    ncm: { findFirst: vi.fn() },
    icms: { findMany: vi.fn() },
    ipi: { findMany: vi.fn() },
    $transaction: vi.fn(async () => [{ ncm: true }, [], []] as [unknown, unknown, unknown]),
    ...overrides,
  } as unknown as FiscalSearchServicePrisma;
}

describe("FiscalSearchService", () => {
  it("searchByNcmCode agrega ncm, icms e ipi em uma $transaction", async () => {
    const ncmRow = { id: "n1", ncm_code: "84719012" };
    const icmsRows = [{ id: "i1" }];
    const ipiRows = [{ id: "p1" }];
    const $transaction = vi.fn(
      async () => [ncmRow, icmsRows, ipiRows] as [unknown, unknown, unknown],
    );
    const prisma = createMockPrisma({ $transaction });
    const service = new FiscalSearchService(prisma);

    const result = await service.searchByNcmCode("84719012", ORG_ID);

    expect($transaction).toHaveBeenCalledTimes(1);
    const firstCall = ($transaction as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected $transaction to be called at least once.");
    }
    const txnArg = firstCall[0];
    if (!txnArg) {
      throw new Error("Expected $transaction to be called with args.");
    }
    const calls = txnArg as unknown[];
    expect(Array.isArray(calls)).toBe(true);
    expect(calls).toHaveLength(3);
    expect(result).toEqual({ ncm: ncmRow, icms: icmsRows, ipi: ipiRows });
  });
});
