import { describe, expect, it } from "vitest";

import { toReportsServiceEnv } from "./env.js";

describe("reports worker bindings", () => {
  it("normaliza limites e timeout recebidos como strings", () => {
    const normalized = toReportsServiceEnv({
      REPORTS_PREVIEW_ROW_LIMIT: "25",
      REPORTS_SOURCE_TIMEOUT_MS: "2500",
    } as never);

    expect(normalized.previewRowLimit).toBe(25);
    expect(normalized.sourceTimeoutMs).toBe(2500);
  });

  it("usa defaults para bindings numéricos inválidos", () => {
    const normalized = toReportsServiceEnv({
      REPORTS_PREVIEW_ROW_LIMIT: "not-a-number",
      REPORTS_SOURCE_TIMEOUT_MS: "50",
    } as never);

    expect(normalized.previewRowLimit).toBe(100);
    expect(normalized.sourceTimeoutMs).toBe(10_000);
  });

  it("usa default para timeout acima do limite seguro", () => {
    const normalized = toReportsServiceEnv({ REPORTS_SOURCE_TIMEOUT_MS: "60001" } as never);

    expect(normalized.sourceTimeoutMs).toBe(10_000);
  });

  it("aponta a origem para o Service Binding quando ele existe", () => {
    const binding = { fetch: async () => new Response() };
    const normalized = toReportsServiceEnv({
      TASK_SERVICE: binding,
      USER_SERVICE: binding,
      FISCAL_SERVICE_URL: "https://fiscal.explicito",
    } as never);

    expect(normalized.taskServiceUrl).toBe("https://task-service.binding");
    expect(normalized.userServiceUrl).toBe("https://user-service.binding");
    // URL explícita continua vencendo; sem binding nem URL, o default local.
    expect(normalized.fiscalServiceUrl).toBe("https://fiscal.explicito");
    expect(normalized.rhServiceUrl).toBe("http://127.0.0.1:9");
  });
});
