import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commercial Worker scheduler", () => {
  it("declara cron válido para executar o outbox", () => {
    const config = JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    ) as {
      triggers?: { crons?: string[] };
    };

    expect(config.triggers?.crons).toEqual(["*/1 * * * *"]);
  });
});
