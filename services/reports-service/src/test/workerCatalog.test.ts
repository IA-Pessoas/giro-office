import { describe, expect, it } from "vitest";
import { inSentence } from "../catalog/sourceCatalogService.js";
import { parseReportsServiceEnv } from "../config/env.js";
import { createWorkerSourceCatalog } from "../workerCatalog.js";

describe("createWorkerSourceCatalog", () => {
  it("autoriza férias de RH para execução assíncrona", () => {
    const catalog = createWorkerSourceCatalog(
      parseReportsServiceEnv({
        DATABASE_URL: "postgresql://reports:reports@localhost:5432/reports",
        JWT_SECRET: "test-jwt-secret",
      }),
    );

    expect(
      catalog.findAdapterForSources(["rh.holidays"], {
        organization_id: "10000000-0000-0000-0000-000000000001",
        modules: { rh: 1 },
        grant: { sources: { "rh.holidays": ["name"] }, relations: [] },
      }),
    ).toBeDefined();
  });

  it("registra ramais de TI para execução assíncrona", () => {
    const catalog = createWorkerSourceCatalog(
      parseReportsServiceEnv({
        DATABASE_URL: "postgresql://reports:reports@localhost:5432/reports",
        JWT_SECRET: "test-jwt-secret",
      }),
    );

    expect(
      catalog.findAdapterForSources(["ti.extensions"], {
        organization_id: "10000000-0000-0000-0000-000000000001",
        modules: { ti: 1 },
        grant: { sources: { "ti.extensions": ["number"] }, relations: [] },
      }),
    ).toBeDefined();
  });

  it.each([
    "contabil.triage_clouds",
    "contabil.triage_movement",
    "contabil.triage_responsibles",
    "contabil.triage_competence_responsibles",
  ])("registra %s só para quem acessa a Triagem", (source) => {
    const catalog = createWorkerSourceCatalog(
      parseReportsServiceEnv({
        DATABASE_URL: "postgresql://reports:reports@localhost:5432/reports",
        JWT_SECRET: "test-jwt-secret",
      }),
    );
    const scope = (modules: Record<string, number>) => ({
      organization_id: "10000000-0000-0000-0000-000000000001",
      modules,
      grant: { sources: { [source]: ["company_name"] }, relations: [] },
    });

    expect(catalog.findAdapterForSources([source], scope({ triagem: 1 }))).toBeDefined();
    expect(catalog.findAdapterForSources([source], scope({ contabil: 3 }))).toBeUndefined();
  });

  it.each([
    "certificado.pf",
    "certificado.pj",
  ])("registra %s para execução assíncrona", (source) => {
    const catalog = createWorkerSourceCatalog(
      parseReportsServiceEnv({
        DATABASE_URL: "postgresql://reports:reports@localhost:5432/reports",
        JWT_SECRET: "test-jwt-secret",
      }),
    );

    expect(
      catalog.findAdapterForSources([source], {
        organization_id: "10000000-0000-0000-0000-000000000001",
        modules: { certificado: 1 },
        grant: { sources: { [source]: ["name"] }, relations: [] },
      }),
    ).toBeDefined();
  });
});

describe("inSentence", () => {
  it("mantém siglas e só baixa a inicial das palavras comuns", () => {
    expect(inSentence("ICMS fiscal")).toBe("ICMS fiscal");
    expect(inSentence("Solicitações de RH")).toBe("solicitações de RH");
    expect(inSentence("Estoque de TI")).toBe("estoque de TI");
  });
});
