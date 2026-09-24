import { createSupabaseStorageClient } from "@workspace/runtime";
import { createUserWorkerApp } from "./app.js";
import { createUserAudit } from "./audit.js";
import type { UserWorkerEnv } from "./env.js";
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

export default {
  async fetch(request: Request, env: UserWorkerEnv): Promise<Response> {
    return createUserWorkerApp({ env, ...createUserWorkerDependencies(env) }).fetch(request, env);
  },
};
