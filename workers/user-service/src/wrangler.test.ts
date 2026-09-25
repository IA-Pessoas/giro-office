import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""),
) as { triggers?: { crons?: string[] } };

describe("user Worker config", () => {
  it("agenda a varredura de personificações vencidas", () => {
    expect(config.triggers?.crons).toEqual(["* * * * *"]);
  });
});
