// KPIs e cliente de cada card da lista de parcelamentos (#1348). Usado pelo service e pelo
// Worker: o resumo segue o mesmo `where` da lista (filtros, sem paginação).

export const ACTIVE_INSTALLMENT_STATUS = "Ativo";

export type InstallmentListSummary = {
  active: number;
  overdue: number;
  /** Parcelas pagas / parcelas acordadas, somadas no filtro inteiro. */
  progress_percent: number;
};

export type InstallmentListClient = { name: string; cpf_cnpj: string };

type Where = Record<string, unknown>;

export type InstallmentSummaryDb = {
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
};

export type InstallmentClientsDb = {
  client: {
    findMany(args: {
      where: { id: { in: string[] }; organization_id: string };
      select: { id: true; name: true; company_name: true; cpf_cnpj: true };
    }): Promise<Array<{ id: string; name: string; company_name: string | null; cpf_cnpj: string }>>;
  };
};

export async function loadInstallmentSummary(
  db: InstallmentSummaryDb,
  where: Where,
): Promise<InstallmentListSummary> {
  // AND preserva o filtro de status do usuário: com status=Encerrado, "ativos" é 0.
  const [active, overdue, progress] = await Promise.all([
    db.installment.count({ where: { AND: [where, { status: ACTIVE_INSTALLMENT_STATUS }] } }),
    db.installment.count({ where: { AND: [where, { overdue_installments_count: { gt: 0 } }] } }),
    db.installment.aggregate({
      where,
      _sum: { paid_installments_count: true, agreed_installments_count: true },
    }),
  ]);

  const paid = progress._sum.paid_installments_count ?? 0;
  const agreed = progress._sum.agreed_installments_count ?? 0;

  return {
    active,
    overdue,
    progress_percent: agreed > 0 ? Math.round((paid / agreed) * 100) : 0,
  };
}

export async function attachInstallmentClients<T extends { client_id: string }>(
  db: InstallmentClientsDb,
  organizationId: string,
  items: T[],
): Promise<Array<T & { client: InstallmentListClient | null }>> {
  const clientIds = [...new Set(items.map((item) => item.client_id))];
  const clients =
    clientIds.length > 0
      ? await db.client.findMany({
          where: { id: { in: clientIds }, organization_id: organizationId },
          select: { id: true, name: true, company_name: true, cpf_cnpj: true },
        })
      : [];
  const clientsById = new Map(
    clients.map((client) => [
      client.id,
      { name: client.company_name || client.name, cpf_cnpj: client.cpf_cnpj },
    ]),
  );

  return items.map((item) => ({ ...item, client: clientsById.get(item.client_id) ?? null }));
}
