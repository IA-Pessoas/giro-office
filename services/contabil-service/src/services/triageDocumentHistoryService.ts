// Histórico documental da Triagem (#1706), lido da auditoria (`audit_requests`): não há
// cópia dos eventos. Usado pelo Worker do contabil-service.

import { ServiceError } from "@workspace/shared";

type Row = Record<string, unknown>;
type Finder = {
  // biome-ignore lint/suspicious/noExplicitAny: aceita os delegates do Prisma do serviço e do Worker.
  findMany(args: any): Promise<Row[]>;
};

export type TriageDocumentHistoryPrisma = {
  auditRequest: Finder & { count(args: unknown): Promise<number> };
  client: Finder & { findFirst(args: unknown): Promise<Row | null> };
  user: Finder;
  triageMonthly: Finder;
  triageBankStatement: Finder;
  triageClosing: Finder;
  clientCloud: Finder;
  triageConfig: Finder;
};

/**
 * Objetos documentais da Triagem na auditoria. Quem grava (rotina, extrato, fechamento, Cloud
 * e configuração, no Worker e no serviço) usa estes `referring`; `byCompetence` diz se o
 * objeto pertence a uma competência ou ao cliente.
 */
export const TRIAGE_DOCUMENT_HISTORY_OBJECTS = [
  { referring: "triagem.monthly", delegate: "triageMonthly", byCompetence: true },
  { referring: "triagem.bank_statements", delegate: "triageBankStatement", byCompetence: true },
  { referring: "triagem.closings", delegate: "triageClosing", byCompetence: true },
  { referring: "clientes.clouds", delegate: "clientCloud", byCompetence: false },
  { referring: "triagem.configs", delegate: "triageConfig", byCompetence: false },
] as const;

export type TriageDocumentHistoryInput = {
  organizationId: string;
  clientId?: string;
  competence?: string;
  page: number;
  pageSize: number;
};

type Scalar = boolean | string | null;
type Change = { field: string; from: Scalar; to: Scalar };

// Identidade e carimbos da linha: não são alteração para quem lê o histórico.
const IGNORED_FIELDS = new Set([
  "id",
  "organization_id",
  "client_id",
  "competence",
  "bank_id",
  "created_at",
  "updated_at",
]);

function isRecord(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function scalar(value: unknown): Scalar {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

/** Checklist e notas são JSON: a alteração é por item (e, nas notas, por campo do item). */
function nestedChanges(prefix: string, from: unknown, to: unknown, depth: number): Change[] {
  const before = isRecord(from) ? from : {};
  const after = isRecord(to) ? to : {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
    depth > 1 && (isRecord(before[key]) || isRecord(after[key]))
      ? nestedChanges(`${prefix}.${key}`, before[key], after[key], depth - 1)
      : [{ field: `${prefix}.${key}`, from: scalar(before[key]), to: scalar(after[key]) }],
  );
}

/**
 * Alterações de um evento, campo a campo. Atualização grava `{ campo: { from, to } }`;
 * criação grava o registro novo, que entra como valor novo sem anterior.
 */
export function triageDocumentChanges(changes: unknown): Change[] {
  if (!isRecord(changes)) return [];
  return Object.entries(changes)
    .filter(([field]) => !IGNORED_FIELDS.has(field))
    .flatMap(([field, value]) => {
      const update = isRecord(value) && ("from" in value || "to" in value);
      const from = update ? (value as Row).from : null;
      const to = update ? (value as Row).to : value;
      if (field === "checklist") return nestedChanges(field, from, to, 1);
      if (field === "item_notes") return nestedChanges(field, from, to, 2);
      return [{ field, from: scalar(from), to: scalar(to) }];
    })
    .filter((change) => change.from !== change.to);
}

export async function listTriageDocumentHistory(
  prisma: TriageDocumentHistoryPrisma,
  input: TriageDocumentHistoryInput,
) {
  const organization = { organization_id: input.organizationId };
  const echo = {
    client_id: input.clientId ?? null,
    competence: input.competence ?? null,
    page: input.page,
    pageSize: input.pageSize,
  };
  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: { ...organization, id: input.clientId },
      select: { id: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");
  }

  // Com cliente ou competência, o recorte é pelos objetos deles; sem nenhum, é a organização.
  // ponytail: só competência (sem cliente) lista os ids de todas as rotinas do mês, centenas
  // por organização; guardar client_id/competence no evento se isso passar de milhares.
  let objectIds: string[] | undefined;
  if (input.clientId || input.competence) {
    const found = await Promise.all(
      TRIAGE_DOCUMENT_HISTORY_OBJECTS.map((object) =>
        // Cloud e configuração são do cliente, sem competência: ficam fora do filtro por mês.
        input.competence && !object.byCompetence
          ? []
          : prisma[object.delegate].findMany({
              where: {
                ...organization,
                ...(input.clientId ? { client_id: input.clientId } : {}),
                ...(input.competence ? { competence: input.competence } : {}),
              },
              select: { id: true },
            }),
      ),
    );
    objectIds = found.flat().map((row) => String(row.id));
    if (!objectIds.length) return { ...echo, total: 0, items: [] };
  }

  const where = {
    ...organization,
    referring: { in: TRIAGE_DOCUMENT_HISTORY_OBJECTS.map((object) => object.referring) },
    ...(objectIds ? { referring_id: { in: objectIds } } : {}),
    // logUpdateIfChanged grava `{}` quando nada mudou.
    NOT: { changes_json: { equals: {} } },
  };
  const [events, total] = await Promise.all([
    prisma.auditRequest.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        user_id: true,
        created_at: true,
        action: true,
        referring: true,
        referring_id: true,
        changes_json: true,
      },
    }),
    prisma.auditRequest.count({ where }),
  ]);

  // Objeto de cada evento da página, sempre dentro da organização.
  const objects = new Map<string, Row>();
  await Promise.all(
    TRIAGE_DOCUMENT_HISTORY_OBJECTS.map(async (object) => {
      const ids = events
        .filter((event) => event.referring === object.referring)
        .map((event) => String(event.referring_id));
      if (!ids.length) return;
      const rows = await prisma[object.delegate].findMany({
        where: { ...organization, id: { in: [...new Set(ids)] } },
        select: {
          id: true,
          client_id: true,
          ...(object.byCompetence ? { competence: true } : {}),
          ...(object.delegate === "triageBankStatement" ? { bank_id: true } : {}),
          ...(object.delegate === "triageMonthly" || object.delegate === "triageConfig"
            ? { type: true }
            : {}),
        },
      });
      for (const row of rows) objects.set(`${object.referring}:${row.id}`, row);
    }),
  );
  const idsOf = (rows: readonly Row[], key: string) => [
    ...new Set(rows.map((row) => row[key]).filter((id): id is string => typeof id === "string")),
  ];
  const clientIds = idsOf([...objects.values()], "client_id");
  const userIds = idsOf(events, "user_id");
  const [clients, users] = await Promise.all([
    clientIds.length
      ? prisma.client.findMany({
          where: { ...organization, id: { in: clientIds } },
          select: { id: true, name: true, company_name: true },
        })
      : [],
    userIds.length
      ? prisma.user.findMany({
          where: { ...organization, id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const clientNames = new Map(
    clients.map((client) => [
      client.id,
      (typeof client.company_name === "string" && client.company_name.trim()) || client.name,
    ]),
  );
  const userNames = new Map(users.map((user) => [user.id, user.name]));

  return {
    ...echo,
    total,
    // ponytail: evento sem campo exibível (só carimbos) sai da página mas conta no total,
    // como no histórico do Controle; filtrar no SQL exige filtro por chave JSON.
    items: events
      .map((event) => {
        const object = objects.get(`${event.referring}:${event.referring_id}`);
        return {
          id: event.id,
          at: new Date(event.created_at as string).toISOString(),
          actor: event.user_id
            ? { id: event.user_id, name: userNames.get(event.user_id) ?? null }
            : null,
          action: event.action ?? null,
          object: {
            kind: event.referring,
            client_id: object?.client_id ?? null,
            client_name: clientNames.get(object?.client_id) ?? null,
            competence: object?.competence ?? null,
            routine_type: object?.type ?? null,
          },
          changes: triageDocumentChanges(event.changes_json),
        };
      })
      .filter((item) => item.changes.length > 0),
  };
}
