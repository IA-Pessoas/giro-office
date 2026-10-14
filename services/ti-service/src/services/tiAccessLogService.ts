import { ServiceError } from "@workspace/shared/http";

import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type { ListTiAccessLogsQuery } from "../schemas/tiAccessLog.schemas.js";

/** Só `$queryRaw`: o Worker reusa esta consulta sem ter `logs` no recorte Prisma. */
export type TiAccessLogDatabase = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

/** `tb_admin.logs.tipo` migrado como texto em `logs.action` (Painel::logs no legado). */
const LEGACY_LOGIN_ACTION = "0";
const LEGACY_ACCESS_ACTION = "1";

type AccessLogRow = {
  id: string;
  type: string;
  referring: string;
  referring_id: string;
  date: Date;
};

export type TiAccessLogItem = Omit<AccessLogRow, "type"> & {
  type: "login" | "access";
  /** `tb_admin.logs.local` não foi migrado (fica só na evidência privada da migração). */
  origin: string | null;
};

export type TiAccessLogList = {
  user: { id: string; name: string; full_name: string | null };
  items: TiAccessLogItem[];
  page: number;
  page_size: number;
  hasMore: boolean;
};

/**
 * Acessos de um usuário, do mais recente para o mais antigo: eventos de `tb_admin.logs`
 * migrados para `logs` (tipo 0 = login, 1 = acesso). Registro sem usuário associado com
 * segurança ficou em quarentena na migração e não chega aqui.
 *
 * Login atual não entra: `auth_sessions` é apagada depois de expirar e a auditoria não tem
 * evento equivalente. Não lê credenciais — o relatório “Logins” é outro fluxo.
 */
export async function listTiAccessLogs(
  database: TiAccessLogDatabase,
  context: { organizationId: string },
  userId: string,
  query: ListTiAccessLogsQuery,
): Promise<TiAccessLogList> {
  const users = (await database.$queryRaw`
    SELECT id, name, full_name FROM "users"
    WHERE id = ${userId} AND organization_id = ${context.organizationId}
    LIMIT 1`) as TiAccessLogList["user"][];
  const user = users[0];
  if (!user) throw new ServiceError(404, "Usuário não encontrado.");

  const { skip, take } = getPaginationParams(query);
  const rows = (await database.$queryRaw`
    SELECT id, action AS type, referring, referring_id, date
    FROM "logs"
    WHERE organization_id = ${context.organizationId}
      AND user_id = ${userId}
      AND action IN (${LEGACY_LOGIN_ACTION}, ${LEGACY_ACCESS_ACTION})
    ORDER BY date DESC, id DESC
    LIMIT ${take + 1} OFFSET ${skip}`) as AccessLogRow[];

  return {
    user,
    items: rows.slice(0, take).map((row) => ({
      ...row,
      type: row.type === LEGACY_LOGIN_ACTION ? "login" : "access",
      origin: null,
    })),
    page: query.page ?? 1,
    page_size: take,
    hasMore: rows.length > take,
  };
}
