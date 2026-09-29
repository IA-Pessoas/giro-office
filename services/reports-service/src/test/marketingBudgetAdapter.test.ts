import { describe, expect, it, vi } from "vitest";

import { MarketingBudgetAdapter } from "../integrations/marketingBudgetAdapter.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

function definition(columns: string[]) {
  return {
    sources: ["marketing.budgets"],
    columns: columns.map((field) => ({
      source: "marketing.budgets",
      field,
      alias: field,
    })),
    joins: [],
    filters: [],
    filter_groups: [],
    aggregations: [],
    order_by: [],
    parameters: [],
  };
}

describe("MarketingBudgetAdapter", () => {
  it("lê orçamento apenas da organização e projeta campos operacionais seguros", async () => {
    const findMany = vi.fn(async () => [
      {
        title: "Campanha de primavera",
        status: "approved",
        department_id: "department-1",
        department: { name: "Marketing", organization_id: ORGANIZATION_ID },
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
        organization_id: ORGANIZATION_ID,
        items: [
          {
            description: "Impressão de cartazes",
            quantity: 4,
            unit_price: 25,
            total_amount: 100,
            status: "approved",
            vendor_contact_info: "nao exportar",
          },
          { description: "Banner", quantity: 2, total_amount: 75 },
        ],
      },
    ]);
    const adapter = new MarketingBudgetAdapter({ budget: { findMany } });

    const result = await adapter.preview({
      definition: definition([
        "title",
        "status",
        "department_id",
        "department_name",
        "created_at",
        "items_count",
        "total_amount",
        "items_summary",
      ]),
      organization_id: ORGANIZATION_ID,
      limit: 20,
      request_id: "request-1",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      orderBy: { id: "asc" },
      take: 50_001,
      select: {
        title: true,
        status: true,
        department_id: true,
        department: { select: { name: true, organization_id: true } },
        createdAt: true,
        organization_id: true,
        items: true,
      },
    });
    expect(result).toEqual({
      rows: [
        {
          title: "Campanha de primavera",
          status: "approved",
          department_id: "department-1",
          department_name: "Marketing",
          created_at: new Date("2026-09-01T12:00:00.000Z"),
          items_count: 2,
          total_amount: 175,
          items_summary: "Impressão de cartazes × 4 · Banner × 2",
        },
      ],
      reachedLimit: false,
    });
  });

  it("fica indisponível sem acesso de leitura ao Marketing", () => {
    const adapter = new MarketingBudgetAdapter({ budget: { findMany: vi.fn() } });

    expect(adapter.isEnabled({ organization_id: ORGANIZATION_ID, modules: { marketing: 0 } })).toBe(
      false,
    );
    expect(adapter.isEnabled({ organization_id: ORGANIZATION_ID, modules: { marketing: 1 } })).toBe(
      true,
    );
  });

  it("aplica a ordenação autorizada antes de limitar a prévia", async () => {
    const findMany = vi.fn(async () =>
      [10, 100].map((totalAmount) => ({
        title: `Orçamento ${totalAmount}`,
        status: "approved",
        department_id: "department-1",
        department: null,
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
        organization_id: ORGANIZATION_ID,
        items: [{ description: "Serviço", quantity: 1, total_amount: totalAmount }],
      })),
    );
    const adapter = new MarketingBudgetAdapter({ budget: { findMany } });
    const report = definition(["total_amount"]);
    report.order_by = [{ source: "marketing.budgets", field: "total_amount", direction: "desc" }];

    const result = await adapter.preview({
      definition: report,
      organization_id: ORGANIZATION_ID,
      limit: 1,
      request_id: "request-ordered",
    });

    expect(result.rows).toEqual([{ total_amount: 100 }]);
    expect(result.reachedLimit).toBe(true);
  });

  it("não expõe o nome de um departamento vinculado a outra organização", async () => {
    const findMany = vi.fn(async () => [
      {
        title: "Orçamento",
        status: "pending",
        department_id: "foreign-department",
        department: { name: "Departamento alheio", organization_id: "foreign-organization" },
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
        organization_id: ORGANIZATION_ID,
        items: [],
      },
    ]);
    const adapter = new MarketingBudgetAdapter({ budget: { findMany } });

    const result = await adapter.preview({
      definition: definition(["department_name"]),
      organization_id: ORGANIZATION_ID,
      limit: 20,
      request_id: "request-2",
    });

    expect(result.rows).toEqual([{ department_name: null }]);
  });
});
