import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOURCE_SERVICES } from "./sourceFetch.js";

const config = JSON.parse(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""),
) as {
  triggers?: { crons?: string[] };
  services?: Array<{ binding: string; service: string }>;
};

describe("reports Worker config", () => {
  it("agenda o processamento da fila de jobs", () => {
    expect(config.triggers?.crons).toEqual(["*/1 * * * *"]);
  });

  it("liga cada serviço de origem por Service Binding", () => {
    for (const name of SOURCE_SERVICES) {
      expect(config.services).toContainEqual({
        binding: `${name.toUpperCase()}_SERVICE`,
        service: `giro-${name}-service`,
      });
    }
  });
});
