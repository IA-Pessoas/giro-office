import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";
import { PessoalOverviewService } from "../services/pessoalOverviewService.js";
import { organizationId } from "./pessoalCoreTestUtils.js";

function createPrismaMock() {
  let activeQueries = 0;
  let maxActiveQueries = 0;

  async function trackQuery<T>(result: T): Promise<T> {
    activeQueries += 1;
    maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
    await Promise.resolve();
    activeQueries -= 1;

    return result;
  }

  return {
    getMaxActiveQueries: () => maxActiveQueries,
    unionPessoal: {
      count: vi
        .fn()
        .mockImplementationOnce(() => trackQuery(3))
        .mockImplementationOnce(() => trackQuery(2))
        .mockImplementationOnce(() => trackQuery(1)),
    },
    lddPessoal: {
      groupBy: vi.fn(() =>
        trackQuery([
          { status: "Pago", _count: { _all: 4 } },
          { status: "Vencido", _count: { _all: 2 } },
          { status: null, _count: { _all: 5 } },
        ]),
      ),
    },
  };
}

describe("PessoalOverviewService", () => {
  it("monta contadores sem carregar listas completas e sem consultas paralelas", async () => {
    const prisma = createPrismaMock();
    const service = new PessoalOverviewService(prisma as never);

    const result = await service.getSummary({ organizationId });

    expect(result).toEqual({
      unions: {
        total: 3,
        withBaseDate: 2,
        withoutBaseDate: 1,
        withCnpj: 1,
      },
      ldd: {
        total: 11,
        open: 5,
        overdue: 2,
        paid: 4,
      },
    });
    expect(prisma.unionPessoal.count).toHaveBeenCalledTimes(3);
    expect(prisma.lddPessoal.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.getMaxActiveQueries()).toBe(1);
  });
});
