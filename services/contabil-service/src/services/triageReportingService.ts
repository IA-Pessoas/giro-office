import {
  CLIENT_INACTIVE_STATUS,
  CONTABIL_TRIAGE_REPORTING_SOURCES,
  type ContabilTriageReportingSource,
  normalizeTriageDocumentStatus,
  TRIAGE_ACCOUNTING_CHECKLIST_FIELDS,
  type TriageDocumentStatus,
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
  "deletion_date",
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
  /** Campos calculados a partir de uma coluna da linha. */
  derived?: { column: string; fields: readonly string[]; values(raw: unknown): Row };
};
type RowSourceKey = Exclude<ContabilTriageReportingSource, "contabil.triage_sgq">;
// Nenhuma área esconde cliente inativado (`deletion_date` é a data da inativação): status e
// data de inativação são campos, e o filtro é de quem monta o relatório.
const rowSources: Readonly<Record<RowSourceKey, RowSource>> = {
  "contabil.triage_clouds": { delegate: "clients", where: {}, columns: {} },
  // "Movimento enviado" é da rotina Contábil; a Fiscal não usa o marcador.
  "contabil.triage_movement": {
    delegate: "monthly",
    where: { type: "CONTABIL", archived_at: null },
    columns: { competence: "competence", sends_movement: "triad_moviment" },
  },
  "contabil.triage_responsibles": {
    delegate: "assignments",
    where: {},
    columns: { type: "type" },
    responsibleColumns: ["user_id"],
  },
  "contabil.triage_competence_responsibles": {
    delegate: "monthly",
    where: { archived_at: null },
    columns: { competence: "competence", type: "type" },
    responsibleColumns: ["responsible_id", "competence", "type"],
  },
  "contabil.triage_accounting_metric": {
    delegate: "monthly",
    where: { type: "CONTABIL", archived_at: null },
    columns: { competence: "competence" },
    responsibleColumns: ["responsible_id", "competence", "type"],
    derived: {
      column: "checklist",
      fields: ["completion_percent", "completed_items", "applicable_items"],
      values: accountingMetric,
    },
  },
};

function accountingStatuses(checklist: unknown): TriageDocumentStatus[] {
  const items = checklist && typeof checklist === "object" ? (checklist as Row) : {};
  // Item ausente do checklist não fazia parte do movimento, como na tela da rotina.
  return TRIAGE_ACCOUNTING_CHECKLIST_FIELDS.map(
    (field) => normalizeTriageDocumentStatus(items[field]) ?? "NOT_APPLICABLE",
  );
}

/**
 * Métrica Contábil da rotina: concluídos sobre os itens que o cliente tem. "Não possui" e
 * item desativado pelo movimento padrão saem do denominador; sem item aplicável não há
 * percentual.
 */
function accountingMetric(checklist: unknown): Row {
  const statuses = accountingStatuses(checklist);
  const applicable = statuses.filter(
    (status) => status !== "NOT_PRESENT" && status !== "NOT_APPLICABLE",
  ).length;
  const completed = statuses.filter((status) => status === "COMPLETED").length;
  return {
    completed_items: completed,
    applicable_items: applicable,
    completion_percent: applicable ? Math.round((completed / applicable) * 10_000) / 100 : null,
  };
}

const COMPETENCE = /^\d{4}-(0[1-9]|1[0-2])$/u;

/** Meses de `first` a `last` (YYYY-MM), inclusive, atravessando viradas de ano. */
export function competencesBetween(first: string, last: string): string[] {
  if (!COMPETENCE.test(first) || !COMPETENCE.test(last)) return [];
  const months: string[] = [];
  let [year, month] = first.split("-").map(Number);
  while (`${year}-${String(month).padStart(2, "0")}` <= last) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * SGQ: uma linha por mês com os clientes do Contábil na carteira daquele mês, separados
 * em não enviado (sem rotina), não triado (movimento pendente) e triado.
 */
async function extractSgqPage(
  prisma: TriageReportingPrisma,
  input: {
    organizationId: string;
    fields: readonly string[];
    limit: number;
    offset?: number;
    today?: Date;
  },
): Promise<{ rows: Row[]; reachedLimit: boolean }> {
  const routines = {
    organization_id: input.organizationId,
    type: "CONTABIL",
    archived_at: null,
  };
  // ponytail: o período vai da primeira rotina Contábil da organização até o mês corrente
  // (ou a última rotina, se for adiante); mês anterior à primeira rotina não gera linha. Se
  // precisar dele, passar o intervalo do filtro até aqui.
  const known = (
    await prisma.monthly.findMany({
      where: routines,
      select: { competence: true },
      distinct: ["competence"],
      orderBy: { competence: "asc" },
    })
  )
    .map((row) => String(row.competence))
    .filter((competence) => COMPETENCE.test(competence))
    .sort();
  const currentMonth = (input.today ?? new Date()).toISOString().slice(0, 7);
  const lastKnown = known[known.length - 1] ?? "";
  const last = lastKnown > currentMonth ? lastKnown : currentMonth;
  const offset = input.offset ?? 0;
  const page = known.length
    ? competencesBetween(known[0], last).slice(offset, offset + input.limit + 1)
    : [];
  const months = page.slice(0, input.limit);
  if (!months.length) return { rows: [], reachedLimit: false };

  // ponytail: carrega todos os clientes do Contábil a cada página; cabe em centenas de
  // empresas. Agregar no banco se a carteira chegar a milhares.
  const [clients, monthly] = await Promise.all([
    prisma.clients.findMany({
      where: { organization_id: input.organizationId, contabil: true },
      select: {
        id: true,
        status: true,
        competence_entry: true,
        competence_output: true,
        deletion_date: true,
      },
    }),
    prisma.monthly.findMany({
      where: { ...routines, competence: { in: months } },
      select: { client_id: true, competence: true, checklist: true },
    }),
  ]);
  const movementIndex = TRIAGE_ACCOUNTING_CHECKLIST_FIELDS.indexOf("triaged_transactions");
  const movement = new Map(
    monthly.map((row) => [
      `${row.client_id}|${row.competence}`,
      accountingStatuses(row.checklist)[movementIndex],
    ]),
  );
  const time = (value: unknown) => (value == null ? null : new Date(value as string).getTime());

  return {
    rows: months.map((competence) => {
      const [year, month] = competence.split("-").map(Number);
      const start = Date.UTC(year, month - 1, 1);
      const end = Date.UTC(year, month, 0, 23, 59, 59, 999);
      const counts = { not_sent: 0, not_triaged: 0, triaged: 0 };
      for (const client of clients) {
        const entry = time(client.competence_entry);
        const output = time(client.competence_output);
        const deletion = time(client.deletion_date);
        // Mesma janela da carteira: entrou até o fim do mês e não saiu antes do início.
        const inPortfolio =
          (entry === null || entry <= end) &&
          (output === null || output >= start) &&
          (deletion === null ? client.status !== CLIENT_INACTIVE_STATUS : deletion >= start);
        if (!inPortfolio) continue;
        const status = movement.get(`${client.id}|${competence}`);
        counts[
          status === undefined ? "not_sent" : status === "PENDING" ? "not_triaged" : "triaged"
        ] += 1;
      }
      const row: Row = {
        competence,
        ...counts,
        eligible_clients: counts.not_sent + counts.not_triaged + counts.triaged,
      };
      return Object.fromEntries(input.fields.map((field) => [field, row[field]]));
    }),
    reachedLimit: page.length > input.limit,
  };
}

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
 * `contabil.triage_clouds`, a atribuição atual em `contabil.triage_responsibles`, o mês em
 * `contabil.triage_sgq` e a rotina mensal nas demais. Quem chama já validou os campos
 * contra o catálogo; a organização vem do grant e limita todas as consultas.
 */
export async function extractTriageReportingPage(
  prisma: TriageReportingPrisma,
  input: {
    source: ContabilTriageReportingSource;
    organizationId: string;
    fields: readonly string[];
    limit: number;
    offset?: number;
    /** Só para teste: mês corrente do SGQ. */
    today?: Date;
  },
): Promise<{ rows: Row[]; reachedLimit: boolean }> {
  if (input.source === "contabil.triage_sgq") return extractSgqPage(prisma, input);
  const base = rowSources[input.source];
  const derived = base.derived?.fields.some((field) => input.fields.includes(field))
    ? base.derived
    : undefined;
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
              ...(derived ? [derived.column] : []),
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
      const derivedValues = derived?.values(row[derived.column]) ?? {};
      const value = (field: string): unknown => {
        if (field in derivedValues) return derivedValues[field];
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
