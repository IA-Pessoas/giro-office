import {
  CONTABIL_TRIAGE_REPORTING_SOURCES,
  type ContabilTriageReportingSource,
} from "@workspace/shared";

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
  responsibles: TriageReportingDelegate;
};

// Campos publicados que são colunas diretas de `clients`.
const clientColumns = [
  "name",
  "company_name",
  "cpf_cnpj",
  "status",
  "competence_entry",
  "contabil",
  "fiscal",
];
const clientFlags = new Set(["contabil", "fiscal"]);
// Campo publicado -> coluna de `triagem.monthly`.
const movementColumns: Readonly<Record<string, string>> = {
  competence: "competence",
  sends_movement: "triad_moviment",
};

export function isTriageReportingSource(source: string): source is ContabilTriageReportingSource {
  return (CONTABIL_TRIAGE_REPORTING_SOURCES as readonly string[]).includes(source);
}

function byClient(rows: readonly Row[]): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const clientId = String(row.client_id);
    grouped.set(clientId, [...(grouped.get(clientId) ?? []), row]);
  }
  return grouped;
}

/**
 * Página das áreas da Triagem na Central de Relatórios: uma linha por cliente em
 * `contabil.triage_clouds` e uma por rotina Contábil mensal em `contabil.triage_movement`.
 * Quem chama já validou os campos contra o catálogo; a organização vem do grant e limita
 * todas as consultas.
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
  const organization = { organization_id: input.organizationId };
  const wanted = (field: string) => input.fields.includes(field);
  const paging = {
    orderBy: { id: "asc" },
    skip: input.offset ?? 0,
    take: input.limit + 1,
  };
  const clientSelect = {
    id: true,
    ...Object.fromEntries(clientColumns.filter(wanted).map((column) => [column, true])),
  };
  const movement = input.source === "contabil.triage_movement";
  const page = movement
    ? await prisma.monthly.findMany({
        // "Movimento enviado" é da rotina Contábil; a Fiscal não usa o marcador.
        where: { ...organization, type: "CONTABIL", archived_at: null },
        select: {
          id: true,
          client_id: true,
          ...Object.fromEntries(
            Object.keys(movementColumns)
              .filter(wanted)
              .map((field) => [movementColumns[field], true]),
          ),
        },
        ...paging,
      })
    : await prisma.clients.findMany({
        // Inativos ficam: o filtro de status é de quem monta o relatório. Removidos, não.
        where: { ...organization, deletion_date: null },
        select: clientSelect,
        ...paging,
      });
  const rows = page.slice(0, input.limit);
  const clientIds = [...new Set(rows.map((row) => String(movement ? row.client_id : row.id)))];
  const related = (delegate: TriageReportingDelegate, needed: boolean, query: Row) =>
    needed && rows.length
      ? delegate.findMany({ where: { ...organization, client_id: { in: clientIds } }, ...query })
      : Promise.resolve([]);

  const [clients, clouds, responsibles] = await Promise.all([
    !movement
      ? rows
      : rows.length && clientColumns.some(wanted)
        ? prisma.clients.findMany({
            where: { ...organization, id: { in: clientIds } },
            select: clientSelect,
          })
        : [],
    related(prisma.clouds, wanted("cloud_types") || wanted("clouds"), {
      select: { client_id: true, type: true, link: true },
      orderBy: [{ type: "asc" }, { id: "asc" }],
    }),
    related(prisma.responsibles, wanted("customer_with_movement"), {
      select: { client_id: true, customer_with_movement: true },
    }),
  ]);
  const clientById = new Map(clients.map((client) => [String(client.id), client]));
  const cloudsByClient = byClient(clouds);
  const responsiblesByClient = byClient(responsibles);

  return {
    rows: rows.map((row) => {
      const clientId = String(movement ? row.client_id : row.id);
      const client = movement ? (clientById.get(clientId) ?? {}) : row;
      const clientClouds = cloudsByClient.get(clientId) ?? [];
      const value = (field: string): unknown => {
        if (movement && field in movementColumns) return row[movementColumns[field]];
        if (clientFlags.has(field)) return client[field] === true;
        if (field === "cloud_types") return clientClouds.map((cloud) => cloud.type).join(", ");
        if (field === "clouds") {
          return clientClouds.map((cloud) => `${cloud.type}: ${cloud.link}`).join("; ");
        }
        if (field === "customer_with_movement") {
          return (responsiblesByClient.get(clientId) ?? []).some(
            (responsible) => responsible.customer_with_movement === true,
          );
        }
        return client[field] ?? null;
      };
      return Object.fromEntries(input.fields.map((field) => [field, value(field)]));
    }),
    reachedLimit: page.length > input.limit,
  };
}
