import { CONTABIL_REPORTING_SOURCES } from "@workspace/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportingSources } from "../../../../shared/src/reporting/reportingSources.js";

import { parseReportsServiceEnv } from "../config/env.js";
import { reportDefinitionSchema } from "../schemas/reportDefinition.schemas.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";
import { ReportExecutionService } from "../services/reportExecutionService.js";
import { ReportPreviewService } from "../services/reportPreviewService.js";
import { createEnvSourceAdapters, createWorkerSourceCatalog } from "../workerCatalog.js";

const env = parseReportsServiceEnv({
  DATABASE_URL: "postgresql://reports:reports@localhost:5432/reports",
  JWT_SECRET: "test-jwt-secret",
  CONTABIL_SERVICE_URL: "http://contabil.test",
});
const scope = {
  organization_id: "10000000-0000-4000-8000-000000000001",
  modules: { contabil: 1 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// Literais de propósito: iterar a constante do shared esconderia uma fonte removida dela.
const announced = ["contabil.control", "contabil.responsibles", "contabil.relationship"] as const;

it("o Contábil anuncia exatamente as três fontes executadas aqui", () => {
  expect([...CONTABIL_REPORTING_SOURCES].sort()).toEqual([...announced].sort());
});

describe.each(announced)("execução da fonte %s", (key) => {
  const published = reportingSources.find((source) => source.key === key);
  const field = published?.fields.find((candidate) => candidate.value_type === "boolean")?.key;
  const definition = () =>
    reportDefinitionSchema.parse({
      sources: [key],
      columns: [{ source: key, field, alias: field }],
      filters: [{ source: key, field, operator: "eq", parameter: "flag" }],
      parameters: [{ name: "flag", type: "boolean" }],
    });
  const stubExtract = () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { rows: [{ [String(field)]: true }] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("está anunciada no catálogo compartilhado e tem adapter registrado", () => {
    expect(published, `${key} não está registrada em reportingSources (shared).`).toBeDefined();
    expect(
      createEnvSourceAdapters(env).filter((adapter) =>
        adapter.sources.some((source) => source.key === key),
      ),
      `${key} não tem adapter registrado em createEnvSourceAdapters (HTTP e Worker).`,
    ).toHaveLength(1);
  });

  it("completa o job do Worker e entrega o resultado com o filtro assinado", async () => {
    const fetchMock = stubExtract();
    const catalog = createWorkerSourceCatalog(env);
    const service = new ReportExecutionService(catalog, new ReportDefinitionService(catalog));

    await expect(
      service.execute({
        definition: definition(),
        scope,
        parameterValues: { flag: true },
        requestId: "request-1729",
      }),
      `O job de ${key} não completou pelo catálogo do Worker.`,
    ).resolves.toEqual([{ [String(field)]: true }]);

    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://contabil.test/internal/reporting/extract");
    expect(JSON.parse(String(request.body))).toMatchObject({
      source: key,
      fields: [field],
      query: { filters: [{ field, operator: "eq", value: true }] },
    });
    expect(request.headers).toMatchObject({ "x-reports-grant": expect.any(String) });
  });

  it("entrega a prévia pela lista de adapters que HTTP e Worker compartilham", async () => {
    stubExtract();
    const catalog = createWorkerSourceCatalog(env);
    const service = new ReportPreviewService(catalog, new ReportDefinitionService(catalog), 10);

    await expect(
      service.preview(definition(), scope, "request-1729", { flag: true }),
      `A prévia de ${key} não foi entregue.`,
    ).resolves.toMatchObject({ rows: [{ [String(field)]: true }] });
  });

  it("recusa prévia e job sem permissão no Contábil, sem consultar a origem", async () => {
    const fetchMock = stubExtract();
    const catalog = createWorkerSourceCatalog(env);
    const definitions = new ReportDefinitionService(catalog);
    const denied = { ...scope, modules: { contabil: 0 } };
    const refusal = {
      statusCode: 403,
      message: "A fonte não está autorizada para este relatório.",
    };

    await expect(
      new ReportExecutionService(catalog, definitions).execute({
        definition: definition(),
        scope: denied,
        parameterValues: { flag: true },
        requestId: "request-1729",
      }),
    ).rejects.toMatchObject(refusal);
    await expect(
      new ReportPreviewService(catalog, definitions, 10).preview(
        definition(),
        denied,
        "request-1729",
        { flag: true },
      ),
    ).rejects.toMatchObject(refusal);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
