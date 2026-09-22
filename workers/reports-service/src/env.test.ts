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
      REPORTS_SOURCE_TIMEOUT_MS: "0",
    } as never);

    expect(normalized.previewRowLimit).toBe(100);
    expect(normalized.sourceTimeoutMs).toBe(10_000);
  });
});
