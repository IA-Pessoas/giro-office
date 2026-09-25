import { describe, expect, it } from "vitest";

import { computeOutstandingBalance } from "../services/installmentBalance.js";

describe("computeOutstandingBalance (#1349)", () => {
  it("parte do valor total informado, proporcional às parcelas restantes", () => {
    expect(
      computeOutstandingBalance({ total: 12000, agreed: 60, remaining: 60, currentAmount: 150 }),
    ).toBe(12000);
    expect(
      computeOutstandingBalance({ total: 1000, agreed: 3, remaining: 1, currentAmount: 999 }),
    ).toBe(333.33);
    expect(
      computeOutstandingBalance({ total: 1000, agreed: 10, remaining: 0, currentAmount: 100 }),
    ).toBe(0);
  });

  it("sem valor total, usa parcelas restantes vezes a parcela atual", () => {
    expect(
      computeOutstandingBalance({ total: 0, agreed: 10, remaining: 4, currentAmount: 125.5 }),
    ).toBe(502);
  });
});
