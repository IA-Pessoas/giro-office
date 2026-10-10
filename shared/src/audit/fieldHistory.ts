// Histórico de campos lido da auditoria (`audit_requests`), que guarda cada alteração com
// valor anterior e novo e não tem prazo de retenção. Usado pelos serviços Node e Workers.

type AuditRow = {
  id: string;
  user_id: string | null;
  created_at: Date;
  action: string | null;
  changes_json: unknown;
};

export type AuditHistoryPrisma = {
  auditRequest: {
    findMany(args: unknown): Promise<AuditRow[]>;
    count(args: unknown): Promise<number>;
  };
  user: { findMany(args: unknown): Promise<Array<{ id: string; name: string }>> };
};

export type AuditHistoryPage = { page: number; pageSize: number };

export type AuditFieldHistoryQuery<F extends string> = AuditHistoryPage & {
  organizationId: string;
  referring: string;
  referringId: string;
  actions: readonly string[];
  fields: readonly F[];
};

function fieldChanges<F extends string>(changes: unknown, fields: readonly F[]) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const record = changes as Record<string, { from?: unknown; to?: unknown } | undefined>;
  return (
    fields
      .filter((field) => record[field])
      .map((field) => ({
        field,
        from: record[field]?.from ?? null,
        to: record[field]?.to ?? null,
      }))
      // Vazio é vazio: `undefined`, `null` e "" não contam como alteração entre si.
      .filter((change) => (change.from ?? "") !== (change.to ?? ""))
  );
}

export async function listAuditFieldHistory<F extends string>(
  prisma: AuditHistoryPrisma,
  query: AuditFieldHistoryQuery<F>,
) {
  const where = {
    organization_id: query.organizationId,
    referring: query.referring,
    referring_id: query.referringId,
    action: { in: [...query.actions] },
    // logUpdateIfChanged grava `{}` quando nada mudou.
    NOT: { changes_json: { equals: {} } },
  };
  const [rows, total] = await Promise.all([
    prisma.auditRequest.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, user_id: true, created_at: true, action: true, changes_json: true },
    }),
    prisma.auditRequest.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    total,
    // ponytail: evento sem campo acompanhado (ex.: só client_id) sai da página mas conta no
    // total; filtrar no SQL exige filtro por chave JSON, que vale se isso aparecer em volume.
    items: rows
      .map((row) => ({
        id: row.id,
        at: new Date(row.created_at).toISOString(),
        actor: row.user_id ? { id: row.user_id, name: names.get(row.user_id) ?? null } : null,
        action: row.action,
        changes: fieldChanges(row.changes_json, query.fields),
      }))
      .filter((item) => item.changes.length > 0),
  };
}
