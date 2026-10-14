import { ServiceError } from "@workspace/shared/http";

// Acessos específicos de TI (#1938): a tela "Acessos Admin" do legado concedia, por usuário,
// a conclusão de tarefas (`tb_admin.permissoes` integracao/0). No Office isso é
// `permissions.specific.task_completion`, que o serviço de tarefas já confere; faltava quem
// pudesse conceder e revogar. Serviço Node e Worker usam este arquivo, por SQL cru, porque a
// tabela pertence ao serviço de usuários e não está no recorte Prisma do Worker de TI.

/** Só o SQL cru: serve ao cliente Prisma do Node, ao do Worker e à transação de ambos. */
export type TiSpecificAccessDatabase = {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $transaction<T>(callback: (database: TiSpecificAccessDatabase) => Promise<T>): Promise<T>;
};

export type TiSpecificAccessRow = {
  id: string;
  name: string;
  full_name: string | null;
  department: string | null;
  task_completion: boolean;
};

/** Usuários ativos da organização com o acesso de conclusão de tarefas. */
export async function listTiSpecificAccesses(
  database: TiSpecificAccessDatabase,
  context: { organizationId: string },
): Promise<TiSpecificAccessRow[]> {
  return (await database.$queryRaw`
    SELECT u.id, u.name, u.full_name, d.name AS department,
           COALESCE(s.task_completion, false) AS task_completion
    FROM "users" u
    LEFT JOIN "departments" d ON d.id = u.department_id
    LEFT JOIN "permissions.specific" s
      ON s.user_id = u.id AND s.organization_id = u.organization_id
    WHERE u.organization_id = ${context.organizationId} AND u.status = 'active'
    ORDER BY u.name ASC, u.id ASC`) as TiSpecificAccessRow[];
}

async function accessOf(
  database: TiSpecificAccessDatabase,
  organizationId: string,
  userId: string,
): Promise<TiSpecificAccessRow | undefined> {
  const rows = (await database.$queryRaw`
    SELECT u.id, u.name, u.full_name, d.name AS department,
           COALESCE(s.task_completion, false) AS task_completion
    FROM "users" u
    LEFT JOIN "departments" d ON d.id = u.department_id
    LEFT JOIN "permissions.specific" s
      ON s.user_id = u.id AND s.organization_id = u.organization_id
    WHERE u.id = ${userId} AND u.organization_id = ${organizationId}`) as TiSpecificAccessRow[];
  return rows[0];
}

/**
 * Concede ou revoga a conclusão de tarefas de um usuário da organização, com registro em
 * `logs` na mesma transação, como as demais alterações de permissão.
 */
export async function setTiTaskCompletionAccess(
  database: TiSpecificAccessDatabase,
  context: { organizationId: string; userId: string },
  targetUserId: string,
  taskCompletion: boolean,
): Promise<TiSpecificAccessRow> {
  // Quem concede não altera o próprio acesso: outra pessoa da TI precisa fazer isso.
  if (targetUserId === context.userId) {
    throw new ServiceError(403, "Peça a outra pessoa da TI para alterar o seu próprio acesso.");
  }
  return database.$transaction(async (transaction) => {
    const before = (await transaction.$queryRaw`
      SELECT u.id, COALESCE(s.task_completion, false) AS task_completion,
             s.organization_id AS specific_organization_id
      FROM "users" u
      LEFT JOIN "permissions.specific" s ON s.user_id = u.id
      WHERE u.id = ${targetUserId} AND u.organization_id = ${context.organizationId}
        AND u.status = 'active'
      LIMIT 1
      FOR UPDATE OF u`) as Array<{
      id: string;
      task_completion: boolean;
      specific_organization_id: string | null;
    }>;
    const current = before[0];
    if (!current) throw new ServiceError(404, "Usuário não encontrado.");
    // `permissions.specific` tem um registro por usuário; o de outra organização não é tocado.
    if (
      current.specific_organization_id !== null &&
      current.specific_organization_id !== context.organizationId
    ) {
      throw new ServiceError(409, "O acesso deste usuário pertence a outra organização.");
    }

    await transaction.$executeRaw`
      INSERT INTO "permissions.specific" (user_id, task_completion, organization_id)
      VALUES (${targetUserId}, ${taskCompletion}, ${context.organizationId})
      ON CONFLICT (user_id) DO UPDATE SET task_completion = EXCLUDED.task_completion`;
    if (current.task_completion !== taskCompletion) {
      const changes = JSON.stringify({
        task_completion: { from: current.task_completion, to: taskCompletion },
      });
      await transaction.$executeRaw`
        INSERT INTO "logs" (id, user_id, action, referring, referring_id, changes, organization_id)
        VALUES (${crypto.randomUUID()}, ${context.userId}, 'UPDATE', 'PermissionSpecific',
                ${targetUserId}, ${changes}::jsonb, ${context.organizationId})`;
    }

    const row = await accessOf(transaction, context.organizationId, targetUserId);
    if (!row) throw new ServiceError(404, "Usuário não encontrado.");
    return row;
  });
}
