import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseDatabasePoolConnectionTimeoutMs,
  parseDatabasePoolMax,
} from "@workspace/shared/database";

import { PrismaClient } from "../generated/prisma/client.js";

export function createTriagemPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
    connectionTimeoutMillis: parseDatabasePoolConnectionTimeoutMs(
      process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
    ),
  });

  return new PrismaClient({ adapter });
}

export type TriagemPrismaClient = PrismaClient;

export async function assertTriagemDatabaseRuntime(prisma: PrismaClient): Promise<void> {
  const [runtime] = await prisma.$queryRaw<
    Array<{ is_member: boolean; is_superuser: boolean; bypass_rls: boolean }>
  >`
    SELECT
      pg_has_role(current_user, 'giro_user_runtime', 'member') AS is_member,
      r.rolsuper AS is_superuser,
      r.rolbypassrls AS bypass_rls
    FROM pg_roles AS r
    WHERE r.rolname = current_user
  `;

  if (!runtime?.is_member || runtime.is_superuser || runtime.bypass_rls) {
    throw new Error(
      "DATABASE_URL do triagem-service precisa usar um principal não-superuser, sem BYPASSRLS, membro de giro_user_runtime.",
    );
  }
}
