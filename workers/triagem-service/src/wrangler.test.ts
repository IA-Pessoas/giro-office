import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("triagem Worker wrangler", () => {
  it("declara o binding do audit-service usado pela reconciliação da outbox", () => {
    const config = JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    ) as { services?: Array<{ binding: string; service: string }> };

    expect(config.services).toContainEqual({
      binding: "AUDIT_SERVICE",
      service: "giro-audit-service",
    });
  });
});
