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
  assignments: TriageReportingDelegate;
  competences: TriageReportingDelegate;
  users: TriageReportingDelegate;
};

// Campos publicados que são colunas diretas de `clients`.
const clientColumns = [
  "name",
  "company_name",
  "cpf_cnpj",
  "status",
  "regime",
  "competence_entry",
  "contabil",
  "fiscal",
];
const clientFlags = new Set(["contabil", "fiscal"]);
const serviceLabels: Readonly<Record<string, string>> = { CONTABIL: "Contábil", FISCAL: "Fiscal" };

type RowSource = {
  delegate: keyof TriageReportingPrisma;
  where: Row;
  /** Campo publicado -> coluna da tabela de origem. */
  columns: Readonly<Record<string, string>>;
  /** Colunas lidas a mais para descobrir o responsável da linha. */
  responsibleColumns?: readonly string[];
};
// Inativos ficam: o filtro de status é de quem monta o relatório. Removidos, não.
const ofLiveClient = { client: { deletion_date: null } };
const rowSources: Readonly<Record<ContabilTriageReportingSource, RowSource>> = {
  "contabil.triage_clouds": { delegate: "clients", where: { deletion_date: null }, columns: {} },
  // "Movimento enviado" é da rotina Contábil; a Fiscal não usa o marcador.
  "contabil.triage_movement": {
    delegate: "monthly",
    where: { type: "CONTABIL", archived_at: null, ...ofLiveClient },
    columns: { competence: "competence", sends_movement: "triad_moviment" },
  },
  "contabil.triage_responsibles": {
    delegate: "assignments",
    where: ofLiveClient,
    columns: { type: "type" },
    responsibleColumns: ["user_id"],
  },
  "contabil.triage_competence_responsibles": {
    delegate: "monthly",
    where: { archived_at: null, ...ofLiveClient },
    columns: { competence: "competence", type: "type" },
    responsibleColumns: ["responsible_id", "competence", "type"],
  },
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
 * Responsável da rotina mensal sem responsável próprio, como na carteira da Triagem: com
 * competência aberta vale o congelado nela; sem, a atribuição atual do serviço.
 */
function inheritedResponsible(
  snapshots: readonly Row[],
  assignments: readonly Row[],
  row: Row,
): unknown {
  const snapshot = snapshots.find(
    (candidate) => candidate.client_id === row.client_id && candidate.competence === row.competence,
  );
  const frozen = (snapshot?.responsible_snapshot as { responsibles?: unknown } | null)
    ?.responsibles;
  const candidates = snapshot ? (Array.isArray(frozen) ? (frozen as Row[]) : []) : assignments;
  return candidates.find(
    (entry) =>
      entry?.type === row.type && (snapshot !== undefined || entry.client_id === row.client_id),
  )?.user_id;
}

/**
 * Página das áreas da Triagem na Central de Relatórios. A linha é o cliente em
 * `contabil.triage_clouds`, a rotina mensal em `contabil.triage_movement` e
 * `contabil.triage_competence_responsibles`, e a atribuição atual em
 * `contabil.triage_responsibles`. Quem chama já validou os campos contra o catálogo; a
 * organização vem do grant e limita todas as consultas.
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
  const base = rowSources[input.source];
  const organization = { organization_id: input.organizationId };
  const wanted = (field: string) => input.fields.includes(field);
  const clientIsRow = base.delegate === "clients";
  const wantsResponsible = Boolean(base.responsibleColumns) && wanted("responsible_name");
  const clientSelect = {
    id: true,
    ...Object.fromEntries(clientColumns.filter(wanted).map((column) => [column, true])),
  };
  const page = await prisma[base.delegate].findMany({
    where: { ...organization, ...base.where },
    select: clientIsRow
      ? clientSelect
      : {
          id: true,
          client_id: true,
          ...Object.fromEntries(
            [
              ...Object.keys(base.columns)
                .filter(wanted)
                .map((field) => base.columns[field]),
              ...(wantsResponsible ? (base.responsibleColumns ?? []) : []),
            ].map((column) => [column, true]),
          ),
        },
    orderBy: { id: "asc" },
    skip: input.offset ?? 0,
    take: input.limit + 1,
  });
  const rows = page.slice(0, input.limit);
  const clientIdOf = (row: Row) => String(clientIsRow ? row.id : row.client_id);
  const clientIds = [...new Set(rows.map(clientIdOf))];
  const related = (delegate: TriageReportingDelegate, needed: boolean, query: Row, where = {}) =>
    needed && rows.length
      ? delegate.findMany({
          where: { ...organization, client_id: { in: clientIds }, ...where },
          ...query,
        })
      : Promise.resolve([]);

  // Só a rotina mensal sem responsável próprio herda da competência ou da atribuição.
  const inherits =
    wantsResponsible && rows.some((row) => "responsible_id" in row && !row.responsible_id);
  const [clients, clouds, responsibles, snapshots, assignments] = await Promise.all([
    clientIsRow
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
    related(
      prisma.competences,
      inherits,
      { select: { client_id: true, competence: true, responsible_snapshot: true } },
      { archived_at: null, competence: { in: [...new Set(rows.map((row) => row.competence))] } },
    ),
    related(prisma.assignments, inherits, {
      select: { client_id: true, type: true, user_id: true },
    }),
  ]);
  const responsibleIdOf = (row: Row) =>
    row.user_id ?? row.responsible_id ?? inheritedResponsible(snapshots, assignments, row);
  const userIds = wantsResponsible
    ? [...new Set(rows.map(responsibleIdOf).filter((id) => typeof id === "string"))]
    : [];
  const users = userIds.length
    ? await prisma.users.findMany({
        where: { ...organization, id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const clientById = new Map(clients.map((client) => [String(client.id), client]));
  const cloudsByClient = byClient(clouds);
  const responsiblesByClient = byClient(responsibles);

  return {
    rows: rows.map((row) => {
      const clientId = clientIdOf(row);
      const client = clientIsRow ? row : (clientById.get(clientId) ?? {});
      const clientClouds = cloudsByClient.get(clientId) ?? [];
      const value = (field: string): unknown => {
        if (field in base.columns) {
          const column = row[base.columns[field]];
          return field === "type" ? (serviceLabels[String(column)] ?? column) : column;
        }
        if (field === "responsible_name") return userNames.get(responsibleIdOf(row)) ?? null;
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
