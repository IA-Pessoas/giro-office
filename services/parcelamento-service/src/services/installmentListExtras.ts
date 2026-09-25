// KPIs e cliente de cada card da lista de parcelamentos (#1348). Usado pelo service e pelo
// Worker: o resumo segue o mesmo `where` da lista (filtros, sem paginação).

export type InstallmentListSummary = {
  active: number;
  overdue: number;
  /** Parcelas pagas / parcelas acordadas, somadas no filtro inteiro. */
  progress_percent: number;
};

export type InstallmentListClient = { name: string; cpf_cnpj: string };

type Where = Record<string, unknown>;

export type InstallmentListExtrasDb = {
  installment: {
    count(args: { where: Where }): Promise<number>;
    aggregate(args: {
      where: Where;
      _sum: { paid_installments_count: true; agreed_installments_count: true };
    }): Promise<{
      _sum: {
        paid_installments_count: number | null;
        agreed_installments_count: number | null;
      };
    }>;
  };
  client: {
    findMany(args: {
      where: { id: { in: string[] }; organization_id: string };
      select: { id: true; name: true; company_name: true; cpf_cnpj: true };
    }): Promise<Array<{ id: string; name: string; company_name: string | null; cpf_cnpj: string }>>;
  };
};

export async function loadInstallmentListExtras<T extends { client_id: string }>(
  db: InstallmentListExtrasDb,
  organizationId: string,
  where: Where,
  items: T[],
): Promise<{
  summary: InstallmentListSummary;
  items: Array<T & { client: InstallmentListClient | null }>;
}> {
  const clientIds = [...new Set(items.map((item) => item.client_id))];
  const [active, overdue, progress, clients] = await Promise.all([
    db.installment.count({ where: { ...where, status: "Ativo" } }),
    db.installment.count({ where: { ...where, overdue_installments_count: { gt: 0 } } }),
    db.installment.aggregate({
      where: { ...where, agreed_installments_count: { gt: 0 } },
      _sum: { paid_installments_count: true, agreed_installments_count: true },
    }),
    clientIds.length > 0
      ? db.client.findMany({
          where: { id: { in: clientIds }, organization_id: organizationId },
          select: { id: true, name: true, company_name: true, cpf_cnpj: true },
        })
      : Promise.resolve([]),
  ]);

  const paid = progress._sum.paid_installments_count ?? 0;
  const agreed = progress._sum.agreed_installments_count ?? 0;
  const clientsById = new Map(
    clients.map((client) => [
      client.id,
      { name: client.company_name || client.name, cpf_cnpj: client.cpf_cnpj },
    ]),
  );

  return {
    summary: {
      active,
      overdue,
      progress_percent: agreed > 0 ? Math.round((paid / agreed) * 100) : 0,
    },
    items: items.map((item) => ({ ...item, client: clientsById.get(item.client_id) ?? null })),
  };
}
