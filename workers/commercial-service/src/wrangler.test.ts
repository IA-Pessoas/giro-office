import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commercial Worker scheduler", () => {
  it("declara cron válido para executar o outbox", () => {
    // `.jsonc` aceita comentários e o arquivo tem um; `JSON.parse` não.
    const config = JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(
        /^\s*\/\/.*$/gm,
        "",
      ),
    ) as {
      triggers?: { crons?: string[] };
    };

    expect(config.triggers?.crons).toEqual(["*/1 * * * *"]);
  });
});
