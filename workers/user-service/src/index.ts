import { createSupabaseStorageClient, withWorkerPrisma } from "@workspace/runtime";
import { createUserWorkerApp, expireImpersonationSessions } from "./app.js";
import { createUserAudit } from "./audit.js";
import type { UserWorkerEnv } from "./env.js";
import { PrismaClient } from "./generated/prisma/client.js";
import { hashPassword, verifyPassword } from "./passwordHash.js";

export function createUserWorkerDependencies(env: UserWorkerEnv) {
  return {
    ...(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? {
          storage: createSupabaseStorageClient({
            SUPABASE_URL: env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
          }),
        }
      : {}),
    verifyPassword,
    hashPassword,
    audit: createUserAudit(env),
  };
}

export { createUserWorkerApp } from "./app.js";
export type { UserWorkerEnv } from "./env.js";
export { hashPassword, verifyPassword } from "./passwordHash.js";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  async fetch(request: Request, env: UserWorkerEnv): Promise<Response> {
    return createUserWorkerApp({ env, ...createUserWorkerDependencies(env) }).fetch(request, env);
  },
  // Encerra e audita personificações vencidas (o Node fazia a cada 5 s; aqui, a cada minuto).
  scheduled(_event: unknown, env: UserWorkerEnv, context: ScheduledContext) {
    context.waitUntil(
      withWorkerPrisma(env, PrismaClient, (prisma) =>
        expireImpersonationSessions(prisma as never, createUserAudit(env)),
      ),
    );
  },
};
