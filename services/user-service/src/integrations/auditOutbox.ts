import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { CreateUserAuditParams } from "./audit.js";

export async function enqueueUserAuditEvent(
  transaction: Pick<Prisma.TransactionClient, "$executeRaw" | "userAuditOutboxEvent">,
  params: CreateUserAuditParams,
): Promise<void> {
  const payload = {
    ...params,
    requestId: params.requestId ?? randomUUID(),
    required: true,
  };
  await transaction.$executeRaw`SET LOCAL ROLE "giro_user_service_audit_runtime"`;
  await transaction.userAuditOutboxEvent.create({
    data: { payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue },
  });
  await transaction.$executeRaw`RESET ROLE`;
}

export async function assertUserAuditOutboxRuntime(
  prisma: Pick<PrismaClient, "$queryRaw">,
): Promise<void> {
  const [runtime] = await prisma.$queryRaw<
    Array<{ is_member: boolean; is_superuser: boolean; bypass_rls: boolean }>
  >`
    SELECT
      pg_has_role(current_user, 'giro_user_service_audit_runtime', 'member') AS is_member,
      role.rolsuper AS is_superuser,
      role.rolbypassrls AS bypass_rls
    FROM pg_roles AS role
    WHERE role.rolname = current_user
  `;

  if (!runtime?.is_member || runtime.is_superuser || runtime.bypass_rls) {
    throw new Error(
      "DATABASE_URL do user-service precisa usar um principal não-superuser, sem BYPASSRLS, membro de giro_user_service_audit_runtime.",
    );
  }
}
