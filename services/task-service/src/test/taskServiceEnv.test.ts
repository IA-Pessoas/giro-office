import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getTaskServiceEnv } from "../config/env.js";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://127.0.0.1:5432/test",
  JWT_SECRET: "task-service-secret-with-at-least-32-chars",
};

const MANAGED_KEYS = [
  "NODE_ENV",
  "AI_EXTRACTION_MODE",
  "OPENAI_API_KEY",
  "AI_EXTRACTION_RATE_LIMIT_MAX",
  "AI_EXTRACTION_TIMEOUT_MS",
  "AUDIT_SERVICE_TOKEN",
  "REPORTS_INTERNAL_TOKEN",
  "REPORTS_GRANT_SECRET",
  "SERVICE_ALLOWED_ORIGINS",
] as const;

describe("configuração da extração de tarefas por IA", () => {
  const original = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of [...MANAGED_KEYS, ...Object.keys(REQUIRED_ENV)]) {
      original.set(key, process.env[key]);
    }
    Object.assign(process.env, REQUIRED_ENV);
    for (const key of MANAGED_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("usa o adapter determinístico por padrão fora de produção", () => {
    process.env.NODE_ENV = "development";

    expect(getTaskServiceEnv().aiExtractionMode).toBe("fake");
  });

  it("aplica os limites operacionais padrão", () => {
    process.env.NODE_ENV = "development";

    expect(getTaskServiceEnv()).toMatchObject({
      aiExtractionTimeoutMs: 30_000,
      aiExtractionRateLimitMax: 10,
      aiExtractionRateLimitWindowMs: 60_000,
    });
  });

  it("respeita limites operacionais configurados", () => {
    process.env.NODE_ENV = "development";
    process.env.AI_EXTRACTION_RATE_LIMIT_MAX = "3";

    expect(getTaskServiceEnv().aiExtractionRateLimitMax).toBe(3);
  });

  it("rejeita o adapter determinístico em produção", () => {
    process.env.NODE_ENV = "production";
    process.env.AI_EXTRACTION_MODE = "fake";
    process.env.AUDIT_SERVICE_TOKEN = "audit-token-de-producao";
    process.env.REPORTS_INTERNAL_TOKEN = "reports-token-de-producao";
    process.env.REPORTS_GRANT_SECRET = "reports-secret-de-producao";
    process.env.SERVICE_ALLOWED_ORIGINS = "https://app.exemplo.com";

    expect(() => getTaskServiceEnv()).toThrow(/AI_EXTRACTION_MODE=fake/);
  });

  it("exige OPENAI_API_KEY quando o modo é openai", () => {
    process.env.NODE_ENV = "development";
    process.env.AI_EXTRACTION_MODE = "openai";

    expect(() => getTaskServiceEnv()).toThrow(/OPENAI_API_KEY/);
  });

  it("aceita o modo openai com a chave configurada", () => {
    process.env.NODE_ENV = "development";
    process.env.AI_EXTRACTION_MODE = "openai";
    process.env.OPENAI_API_KEY = "sk-test";

    expect(getTaskServiceEnv()).toMatchObject({
      aiExtractionMode: "openai",
      openaiApiKey: "sk-test",
    });
  });
});
