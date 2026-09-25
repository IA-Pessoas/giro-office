import { createHash } from "node:crypto";
import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportSourceAdapter } from "../catalog/types.js";
import { createReportCatalogRouter } from "../routes/reportCatalog.routes.js";
import { ReportLetterheadService } from "../services/reportLetterheadService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const adapter: ReportSourceAdapter = {
  sources: ["projects", "clients"].map((key) => ({
    key: `integracao.${key}`,
    label: key === "projects" ? "Projetos" : "Clientes",
    module: "integracao",
    minimum_permission: 1,
    fields: [
      { key: "name", label: "Nome", value_type: "string", filter_operators: [], aggregations: [] },
    ],
  })),
  relations: [],
  isEnabled: () => true,
  preview: vi.fn(),
};
const definition = {
  version: 2,
  areas: [
    { source: "integracao.projects", fields: ["name"] },
    { source: "integracao.clients", fields: ["name"] },
  ],
};
function createApp(modules = { integracao: 1 }, letterheads?: ReportLetterheadService) {
  const app = express();
  app.use(express.json());
  app.use(
    "/reports",
    createReportCatalogRouter({
      sourceCatalog: new SourceCatalogService([adapter]),
      letterheads,
      accessContextClient: {
        getAccessContext: vi.fn().mockResolvedValue({
          organization: { id: organizationId },
          department: { id: "department-1" },
          departmentModule: "integracao",
          modules,
        }),
      },
    }),
  );
  app.use(createExpressErrorHandler({ logger: { error: vi.fn() } as never, event: "test" }));
  return app;
}
function authenticated(builder: request.Test) {
  return builder
    .set(FORWARDED_AUTH_USER_ID_HEADER, "00000000-0000-4000-8000-000000000001")
    .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId);
}
describe("report catalog routes", () => {
  it("lista timbrados permitidos e valida a seleção explícita sem expor o arquivo", async () => {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
      "base64",
    );
    const departmentBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==",
      "base64",
    );
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const departmentSha256 = createHash("sha256").update(departmentBytes).digest("hex");
    const app = createApp(
      { integracao: 1 },
      new ReportLetterheadService([
        {
          id: "office-v1",
          label: "Organização",
          kind: "organization",
          organizationId,
          bytes,
          sha256,
        },
        {
          id: "department-v1",
          label: "Departamento",
          kind: "department",
          organizationId,
          departmentId: "department-1",
          bytes: departmentBytes,
          sha256: departmentSha256,
        },
      ]),
    );
    const catalog = await authenticated(request(app).get("/reports/catalog")).expect(200);
    expect(catalog.body.data.letterheads).toEqual({
      personal: [{ id: "office-v1", label: "Organização", kind: "organization", sha256 }],
      shared: [
        { id: "office-v1", label: "Organização", kind: "organization", sha256 },
        {
          id: "department-v1",
          label: "Departamento",
          kind: "department",
          sha256: departmentSha256,
        },
      ],
    });
    expect(JSON.stringify(catalog.body)).not.toContain(bytes.toString("base64"));
    await authenticated(request(app).post("/reports/definitions/validate"))
      .send({ definition: { ...definition, letterhead: { id: "office-v1", sha256 } } })
      .expect(200);
    await authenticated(request(app).post("/reports/definitions/validate"))
      .send({
        definition: {
          ...definition,
          letterhead: { id: "department-v1", sha256: departmentSha256 },
        },
      })
      .expect(404);
  });
  it("preserva definição legada e aceita inversão da ordem dos blocos", async () => {
    const legacy = {
      sources: ["integracao.projects"],
      columns: [{ source: "integracao.projects", field: "name", alias: "name" }],
    };
    const app = createApp();
    const response = await authenticated(request(app).post("/reports/definitions/validate"))
      .send({ definition: legacy })
      .expect(200);
    expect(response.body.data.definition).toMatchObject(legacy);
    const reversed = { ...definition, areas: [...definition.areas].reverse() };
    const reverseResponse = await authenticated(request(app).post("/reports/definitions/validate"))
      .send({ definition: reversed })
      .expect(200);
    expect(reverseResponse.body.data.definition).toEqual(reversed);
  });
  it("protege todas as áreas, campos e contexto autenticado", async () => {
    await request(createApp())
      .post("/reports/definitions/validate")
      .send({ definition })
      .expect(401);
    await authenticated(request(createApp({ integracao: 0 })).post("/reports/definitions/validate"))
      .send({ definition })
      .expect(403);
    for (const area of [
      { source: "finance.ledger", fields: ["name"] },
      { source: "integracao.projects", fields: ["private_notes"] },
    ]) {
      await authenticated(request(createApp()).post("/reports/definitions/validate"))
        .send({ definition: { version: 2, areas: [definition.areas[1], area] } })
        .expect(403);
    }
  });
  it("rejeita blocos vazios, versão desconhecida, excesso e propriedades técnicas", async () => {
    const app = createApp();
    for (const invalid of [
      { version: 2, areas: [] },
      { version: 2, areas: [{ source: "integracao.projects", fields: [] }] },
      { ...definition, version: 3 },
      {
        ...definition,
        areas: Array.from({ length: 33 }, (_, index) => ({
          source: `area.source_${index}`,
          fields: ["name"],
        })),
      },
      { ...definition, joins: [] },
      { ...definition, areas: [{ ...definition.areas[0], primary: true }] },
    ]) {
      const response = await authenticated(request(app).post("/reports/definitions/validate"))
        .send({ definition: invalid })
        .expect(400);
      expect(response.body.success).toBe(false);
    }
  });
  it("entrega catálogo amigável agrupável sem incluir áreas não autorizadas", async () => {
    const response = await authenticated(request(createApp()).get("/reports/catalog")).expect(200);
    expect(response.body.data.items).toMatchObject([
      { label: "Projetos", department_label: "Integração", description: expect.any(String) },
      { label: "Clientes", department_label: "Integração", description: expect.any(String) },
    ]);
    const denied = await authenticated(
      request(createApp({ integracao: 0 })).get("/reports/catalog"),
    ).expect(200);
    expect(denied.body.data.items).toEqual([]);
  });
  it("rejeita áreas e campos repetidos", async () => {
    const app = createApp();
    for (const areas of [
      [definition.areas[0], definition.areas[0]],
      [{ source: "integracao.projects", fields: ["name", "name"] }],
    ]) {
      await authenticated(request(app).post("/reports/definitions/validate"))
        .send({ definition: { version: 2, areas } })
        .expect(400);
    }
  });
  it("aceita áreas independentes na ordem visual sem executar consultas", async () => {
    const response = await authenticated(request(createApp()).post("/reports/definitions/validate"))
      .send({ definition })
      .expect(200);
    expect(response.body).toEqual({ success: true, data: { definition } });
    expect(adapter.preview).not.toHaveBeenCalled();
  });
});
