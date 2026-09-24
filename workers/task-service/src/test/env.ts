import { createHmac } from "node:crypto";
import type { TaskWorkerEnv } from "../env.js";

export const TOKENS = {
  jwt: "jwt-secret-for-task-worker-tests-000000",
  internal: "internal-token-for-task-worker-tests-000",
  audit: "audit-token-for-task-worker-tests-000000",
  reports: "reports-token-for-task-worker-tests-0000",
  grant: "grant-secret-for-task-worker-tests-00000",
};

export function workerEnv(overrides: Partial<TaskWorkerEnv> = {}): TaskWorkerEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://ci:ci@127.0.0.1:5432/giro_ci",
    JWT_SECRET: TOKENS.jwt,
    INTERNAL_SERVICE_TOKEN: TOKENS.internal,
    AUDIT_SERVICE_TOKEN: TOKENS.audit,
    COMMERCIAL_SERVICE_TOKEN: TOKENS.internal,
    REPORTS_INTERNAL_TOKEN: TOKENS.reports,
    REPORTS_GRANT_SECRET: TOKENS.grant,
    USER_SERVICE_INTERNAL_TOKEN: TOKENS.internal,
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    TASK_ATTACHMENT_STORAGE_BUCKET: "task-attachments-private",
    AI_EXTRACTION_MODE: "openai",
    OPENAI_API_KEY: "sk-test",
    ...overrides,
  };
}

/** Service Binding falso que grava cada chamada. */
export function recordingBinding(response: () => Response = () => Response.json({ ok: true })) {
  const calls: Request[] = [];
  return {
    calls,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Request(input, init));
      return response();
    },
  };
}

export function signJwt(claims: Record<string, unknown>, secret = TOKENS.jwt): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
