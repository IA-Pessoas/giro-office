import { describe, expect, it, vi } from "vitest";

import { loadInstallmentListExtras } from "../services/installmentListExtras.js";

const organizationId = "org-1";

function createDb() {
  return {
    installment: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.status === "Ativo" ? 7 : 3,
      ),
      aggregate: vi.fn(async () => ({
        _sum: { paid_installments_count: 30, agreed_installments_count: 120 },
      })),
    },
    client: {
      findMany: vi.fn(async () => [
        { id: "c1", name: "Fulano", company_name: "Castelo Ltda", cpf_cnpj: "12345678000190" },
        { id: "c2", name: "Beltrano", company_name: null, cpf_cnpj: "12345678909" },
      ]),
    },
  };
}

describe("loadInstallmentListExtras (#1348)", () => {
  it("agrega KPIs sobre o filtro inteiro, não sobre a página", async () => {
    const db = createDb();
    const where = { organization_id: organizationId, client_id: "c1" };

    const { summary } = await loadInstallmentListExtras(db, organizationId, where, []);

    expect(db.installment.count).toHaveBeenCalledWith({ where: { ...where, status: "Ativo" } });
    expect(db.installment.count).toHaveBeenCalledWith({
      where: { ...where, overdue_installments_count: { gt: 0 } },
    });
    expect(db.installment.aggregate).toHaveBeenCalledWith({
      where: { ...where, agreed_installments_count: { gt: 0 } },
      _sum: { paid_installments_count: true, agreed_installments_count: true },
    });
    expect(summary).toEqual({ active: 7, overdue: 3, progress_percent: 25 });
  });

  it("progresso é 0 sem parcelas acordadas", async () => {
    const db = createDb();
    db.installment.aggregate.mockResolvedValueOnce({
      _sum: { paid_installments_count: null, agreed_installments_count: null },
    } as never);

    const { summary } = await loadInstallmentListExtras(db, organizationId, {}, []);

    expect(summary.progress_percent).toBe(0);
  });

  it("anexa nome e documento do cliente da mesma organização a cada item", async () => {
    const db = createDb();

    const { items } = await loadInstallmentListExtras(db, organizationId, {}, [
      { id: "i1", client_id: "c1" },
      { id: "i2", client_id: "c2" },
      { id: "i3", client_id: "c9" },
      { id: "i4", client_id: "c1" },
    ]);

    expect(db.client.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1", "c2", "c9"] }, organization_id: organizationId },
      select: { id: true, name: true, company_name: true, cpf_cnpj: true },
    });
    expect(items).toEqual([
      { id: "i1", client_id: "c1", client: { name: "Castelo Ltda", cpf_cnpj: "12345678000190" } },
      { id: "i2", client_id: "c2", client: { name: "Beltrano", cpf_cnpj: "12345678909" } },
      { id: "i3", client_id: "c9", client: null },
      { id: "i4", client_id: "c1", client: { name: "Castelo Ltda", cpf_cnpj: "12345678000190" } },
    ]);
  });

  it("não consulta clientes com página vazia", async () => {
    const db = createDb();
    await loadInstallmentListExtras(db, organizationId, {}, []);
    expect(db.client.findMany).not.toHaveBeenCalled();
  });
});
