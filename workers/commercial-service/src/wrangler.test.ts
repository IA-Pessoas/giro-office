import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `.jsonc` aceita comentários; `JSON.parse` não.
const config = JSON.parse(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""),
) as {
  triggers?: { crons?: string[] };
  services?: Array<{ binding: string; service: string }>;
};

describe("commercial Worker scheduler", () => {
  it("declara cron válido para executar o outbox", () => {
    expect(config.triggers?.crons).toEqual(["*/1 * * * *"]);
  });

  it("liga o task-service, destino do outbox de task-billing e prospecting-close", () => {
    expect(config.services).toContainEqual({
      binding: "TASK_SERVICE",
      service: "giro-task-service",
    });
  });
});
