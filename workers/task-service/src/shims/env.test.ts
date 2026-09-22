import { describe, expect, it } from "vitest";
import { runInTaskContext } from "../context.js";
import { TOKENS, workerEnv } from "../test/env.js";
import { getTaskServiceEnv } from "./env.js";

const read = (env = workerEnv()) =>
  runInTaskContext({ env, createPrisma: () => ({ $disconnect: async () => {} }) }, () =>
    getTaskServiceEnv(),
  );

describe("env shim", () => {
  it("mapeia os bindings do Worker para o TaskServiceEnv do Node", async () => {
    const env = await read();
    expect(env).toMatchObject({
      nodeEnv: "production",
      jwtSecret: TOKENS.jwt,
      auditEnabled: true,
      auditServiceToken: TOKENS.audit,
      commercialServiceToken: TOKENS.internal,
      reportsInternalToken: TOKENS.reports,
      reportsGrantSecret: TOKENS.grant,
      supabaseUrl: "https://supabase.test",
      supabaseServiceRoleKey: "service-role-key",
      taskAttachmentStorageBucket: "task-attachments-private",
      aiExtractionMode: "openai",
      openaiApiKey: "sk-test",
      aiExtractionTimeoutMs: 30_000,
      aiExtractionRateLimitMax: 10,
      aiExtractionRateLimitWindowMs: 60_000,
      enableApiDocs: false,
    });
  });

  it("recusa a extração fake em produção, como o Node", async () => {
    await expect(read(workerEnv({ AI_EXTRACTION_MODE: "fake" }))).rejects.toThrow(
      /AI_EXTRACTION_MODE=fake/,
    );
  });

  it("exige OPENAI_API_KEY no modo openai", async () => {
    await expect(read(workerEnv({ OPENAI_API_KEY: undefined }))).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("exige a configuração do Supabase em produção", async () => {
    await expect(read(workerEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }))).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it("recusa token interno fraco em produção", async () => {
    await expect(read(workerEnv({ COMMERCIAL_SERVICE_TOKEN: "curto" }))).rejects.toThrow(
      /COMMERCIAL_SERVICE_TOKEN/,
    );
  });
});
