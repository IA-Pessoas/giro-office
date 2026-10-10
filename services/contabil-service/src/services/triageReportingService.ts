import type { ContabilTriageReportingSource } from "@workspace/shared";

type Row = Record<string, unknown>;
type TriageReportingDelegate = {
  // biome-ignore lint/suspicious/noExplicitAny: aceita os delegates do Prisma do serviço e do Worker.
  findMany(input: any): Promise<readonly Row[]>;
};

/** Delegates explícitos: o cliente canônico chama a tabela de `clientClouds`; o do Worker, `clientCloud`. */
export type TriageReportingPrisma = {
  clients: TriageReportingDelegate;
  clouds: TriageReportingDelegate;
  monthly: TriageReportingDelegate;
};

// Campo publicado -> coluna da tabela de origem.
const cloudColumns: Readonly<Record<string, string>> = { type: "type", link: "link" };
const movementColumns: Readonly<Record<string, string>> = {
  competence: "competence",
  sends_movement: "triad_moviment",
};

const clientValues: Readonly<Record<string, (client: Row) => unknown>> = {
  legal_name: (client) =>
    (typeof client.company_name === "string" && client.company_name.trim()) || client.name,
  trade_name: (client) => client.name,
  cpf_cnpj: (client) => client.cpf_cnpj,
  entry_date: (client) => client.competence_entry ?? null,
  contabil: (client) => client.contabil === true,
  fiscal: (client) => client.fiscal === true,
};

export function isTriageReportingSource(source: string): source is ContabilTriageReportingSource {
  return source === "contabil.triage_clouds" || source === "contabil.triage_movement";
}

/**
 * Página das áreas da Triagem na Central de Relatórios. Quem chama já validou os campos
 * contra o catálogo; a organização vem do grant e limita as duas consultas.
 */
export async function extractTriageReportingPage(
  prisma: TriageReportingPrisma,
  input: {
    source: ContabilTriageReportingSource;
    organizationId: string;
    fields: readonly string[];
    limit: number;
    offset?: number;
  },
): Promise<{ rows: Row[]; reachedLimit: boolean }> {
  const movement = input.source === "contabil.triage_movement";
  const columns = movement ? movementColumns : cloudColumns;
  const page = await (movement ? prisma.monthly : prisma.clouds).findMany({
    where: {
      organization_id: input.organizationId,
      // "Envia movimento" é da rotina Contábil; a Fiscal não usa o marcador.
      ...(movement ? { type: "CONTABIL", archived_at: null } : {}),
    },
    select: {
      id: true,
      client_id: true,
      ...Object.fromEntries(
        input.fields.filter((field) => field in columns).map((field) => [columns[field], true]),
      ),
    },
    orderBy: { id: "asc" },
    skip: input.offset ?? 0,
    take: input.limit + 1,
  });
  const rows = page.slice(0, input.limit);
  const clients =
    rows.length && input.fields.some((field) => field in clientValues)
      ? await prisma.clients.findMany({
          where: {
            organization_id: input.organizationId,
            id: { in: [...new Set(rows.map((row) => String(row.client_id)))] },
          },
          select: {
            id: true,
            name: true,
            company_name: true,
            cpf_cnpj: true,
            competence_entry: true,
            contabil: true,
            fiscal: true,
          },
        })
      : [];
  const clientById = new Map(clients.map((client) => [String(client.id), client]));

  return {
    rows: rows.map((row) => {
      const client = clientById.get(String(row.client_id)) ?? {};
      return Object.fromEntries(
        input.fields.map((field) => [
          field,
          field in columns ? row[columns[field]] : clientValues[field]?.(client),
        ]),
      );
    }),
    reachedLimit: page.length > input.limit,
  };
}
