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
  controlContabil: Finder;
  triageCatalogItem: Finder;
};

type HistoryObject = {
  referring: string;
  /** Tabela do objeto; sem ela, o evento é auditado com o id do cliente. */
  delegate?:
    | "triageMonthly"
    | "triageBankStatement"
    | "triageClosing"
    | "clientCloud"
    | "controlContabil";
  /** O objeto pertence a uma competência (senão, ao cliente). */
  byCompetence: boolean;
  /** Só estas ações do `referring` são documentais. */
  actions?: readonly string[];
};

/**
 * Objetos documentais da Triagem na auditoria, com o `referring` e o `referring_id` que quem
 * grava usa (Worker e serviço).
 */
export const TRIAGE_DOCUMENT_HISTORY_OBJECTS: readonly HistoryObject[] = [
  { referring: "triagem.monthly", delegate: "triageMonthly", byCompetence: true },
  { referring: "triagem.bank_statements", delegate: "triageBankStatement", byCompetence: true },
  { referring: "triagem.closings", delegate: "triageClosing", byCompetence: true },
  { referring: "clientes.clouds", delegate: "clientCloud", byCompetence: false },
  // Movimento padrão, documentos especiais, prioridade e meio de envio: `referring_id` é o
  // id do cliente, não o da linha de configuração.
  { referring: "triagem.configs", byCompetence: false },
  // Arquivar ou restaurar a competência leva junto rotina, extratos e fechamento e é
  // auditado uma vez, no controle contábil.
  {
    referring: "contabil.control",
    delegate: "controlContabil",
    byCompetence: true,
    actions: ["Arquivar competência contábil", "Restaurar competência contábil"],
  },
];

export type TriageDocumentHistoryInput = {
  organizationId: string;
  clientId?: string;
  competence?: string;
  page: number;
  pageSize: number;
};

/** Catálogo da organização que traduz o código gravado no campo, quando houver. */
function catalogKind(field: string): "JUSTIFICATION" | "DELIVERY_METHOD" | null {
  const parts = field.split(".");
  const name = parts[parts.length - 1];
  return name === "justification"
    ? "JUSTIFICATION"
    : name === "delivery_method"
      ? "DELIVERY_METHOD"
      : null;
}

type Scalar = boolean | string | null;
type Change = { field: string; from: Scalar; to: Scalar };

// Só estes campos saem no histórico: coluna nova dessas tabelas não aparece sem entrar aqui.
const HISTORY_FIELDS = new Set([
  // rotina mensal
  "checklist",
  "item_notes",
  "billing_amount",
  "triad_moviment",
  "notes",
  "justification",
  "responsible_id",
  "download_date",
  "settlement_date",
  // extrato e fechamento
  "status",
  "archived_at",
  // Cloud
  "type",
  "link",
  // configuração
  "active_items",
  "priority",
  "delivery_method",
  // arquivar ou restaurar a competência: quantos registros foram junto
  "controls",
  "monthly",
  "statements",
  "closings",
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
    .filter(([field]) => HISTORY_FIELDS.has(field))
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
  const scoped = Boolean(input.clientId || input.competence);
  const scopes = await Promise.all(
    TRIAGE_DOCUMENT_HISTORY_OBJECTS.map(async (object) => {
      const event = {
        referring: object.referring,
        ...(object.actions ? { action: { in: [...object.actions] } } : {}),
      };
      if (!scoped) return event;
      // Cloud e configuração são do cliente, sem competência: ficam fora do filtro por mês.
      if (input.competence && !object.byCompetence) return null;
      const ids = object.delegate
        ? (
            await prisma[object.delegate].findMany({
              where: {
                ...organization,
                ...(input.clientId ? { client_id: input.clientId } : {}),
                ...(input.competence ? { competence: input.competence } : {}),
              },
              select: { id: true },
            })
          ).map((row) => String(row.id))
        : input.clientId
          ? [input.clientId]
          : [];
      return ids.length ? { ...event, referring_id: { in: ids } } : null;
    }),
  );
  const matching = scopes.filter((scope) => scope !== null);
  if (!matching.length) return { ...echo, total: 0, items: [] };

  const where = {
    ...organization,
    OR: matching,
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
      const ids = [
        ...new Set(
          events
            .filter((event) => event.referring === object.referring)
            .map((event) => String(event.referring_id)),
        ),
      ];
      if (!ids.length) return;
      const rows = object.delegate
        ? await prisma[object.delegate].findMany({
            where: { ...organization, id: { in: ids } },
            select: {
              id: true,
              client_id: true,
              ...(object.byCompetence ? { competence: true } : {}),
              ...(object.delegate === "triageMonthly" ? { type: true } : {}),
            },
          })
        : ids.map((id) => ({ id, client_id: id }));
      for (const row of rows) objects.set(`${object.referring}:${row.id}`, row);
    }),
  );
  const idsOf = (rows: readonly Row[], key: string) => [
    ...new Set(rows.map((row) => row[key]).filter((id): id is string => typeof id === "string")),
  ];
  const clientIds = idsOf([...objects.values()], "client_id");
  const changesOf = new Map(
    events.map((event) => [event.id, triageDocumentChanges(event.changes_json)]),
  );
  // Quem alterou e quem aparece como responsável anterior ou novo.
  const userIds = [
    ...new Set([
      ...idsOf(events, "user_id"),
      ...[...changesOf.values()]
        .flat()
        .filter((change) => change.field === "responsible_id")
        .flatMap((change) => [change.from, change.to])
        .filter((id): id is string => typeof id === "string"),
    ]),
  ];
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
  // Justificativa e meio de envio guardam o código do catálogo; a tela mostra o rótulo.
  const catalogCodes = [...changesOf.values()]
    .flat()
    .filter((change) => catalogKind(change.field))
    .flatMap((change) => [change.from, change.to])
    .filter((code): code is string => typeof code === "string");
  const catalogItems = catalogCodes.length
    ? await prisma.triageCatalogItem.findMany({
        where: {
          ...organization,
          kind: { in: ["JUSTIFICATION", "DELIVERY_METHOD"] },
          code: { in: [...new Set(catalogCodes)] },
        },
        select: { kind: true, code: true, label: true },
      })
    : [];
  const catalogLabels = new Map(
    catalogItems.map((item) => [`${item.kind}:${item.code}`, item.label]),
  );
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
    // Evento sem campo exibível (só carimbos, ou regravação sem mudança) sai com `changes`
    // vazio: tirá-lo daqui desalinha a página do total, e tirá-lo na consulta não dá, porque
    // "exibível" depende de comparar anterior e novo já normalizados (`triageDocumentChanges`).
    items: events.map((event) => {
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
        changes: (changesOf.get(event.id) ?? []).map((change) => {
          const kind = catalogKind(change.field);
          // Código sem item no catálogo e usuário de fora da organização saem como estão.
          const display = (value: Scalar) =>
            (change.field === "responsible_id"
              ? userNames.get(value)
              : kind
                ? catalogLabels.get(`${kind}:${value}`)
                : undefined) ?? value;
          return { ...change, from: display(change.from), to: display(change.to) };
        }),
      };
    }),
  };
}
