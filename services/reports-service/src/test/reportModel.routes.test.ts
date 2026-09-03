import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createReportModelRouter } from "../routes/reportModel.routes.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
const model = {
  id: "00000000-0000-4000-8000-000000000003",
  organization_id: organizationId,
  name: "Saldo",
  version: 1,
  definition: {
    sources: ["finance.ledger"],
    columns: [{ source: "finance.ledger", field: "balance", alias: "balance" }],
    joins: [],
    filters: [],
    filter_groups: [],
    parameters: [],
    aggregations: [],
    order_by: [],
  },
};

function createApp(options?: {
  modelService?: Record<string, ReturnType<typeof vi.fn>>;
  authorizationService?: Record<string, ReturnType<typeof vi.fn>>;
  previewService?: Record<string, ReturnType<typeof vi.fn>>;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    createReportModelRouter({
      modelService: {
        create: vi.fn().mockResolvedValue(model),
        list: vi.fn().mockResolvedValue([model]),
        get: vi.fn().mockResolvedValue(model),
        update: vi.fn().mockResolvedValue(model),
        delete: vi.fn().mockResolvedValue(undefined),
        ...options?.modelService,
      } as never,
      previewService: {
        preview: vi.fn().mockResolvedValue({ rows: [], hasMore: false }),
        ...options?.previewService,
      } as never,
      authorizationService: {
        validateDefinition: vi.fn().mockResolvedValue({ definition: model.definition }),
        ...options?.authorizationService,
      } as never,
    }),
  );
  return app;
}

function authenticated(requestBuilder: request.Test) {
  return requestBuilder
    .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
    .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId);
}

describe("report model routes", () => {
  it("executa modelo compartilhado somente com o grant da versão atual", async () => {
    const sharedModel = {
      ...model,
      department_id: "department-1",
      grant: { sources: { "finance.ledger": ["balance"] }, relations: [] },
    };
    const modelService = { getShared: vi.fn().mockResolvedValue(sharedModel) };
    const authorizationService = {
      getSharedExecutionContext: vi.fn().mockResolvedValue({
        department: { id: "department-1", module: "financeiro" },
        scope: { organization_id: organizationId, modules: { financeiro: 1 } },
      }),
    };
    const previewService = { preview: vi.fn().mockResolvedValue({ rows: [], hasMore: false }) };
    const app = createApp({ modelService, authorizationService, previewService });

    await authenticated(request(app).post(`/models/shared/${model.id}/preview`)).expect(200);

    expect(previewService.preview).toHaveBeenCalledWith(
      model.definition,
      {
        organization_id: organizationId,
        modules: { financeiro: 1 },
        grant: sharedModel.grant,
      },
      "reports-shared-model-preview",
    );
  });

  it("copia modelo compartilhado para acervo pessoal do membro atual", async () => {
    const modelService = {
      getShared: vi.fn().mockResolvedValue({ ...model, department_id: "department-1" }),
      create: vi.fn().mockResolvedValue({ ...model, id: "personal-copy" }),
    };
    const authorizationService = {
      getSharedDepartment: vi.fn().mockResolvedValue({ id: "department-1", module: "financeiro" }),
    };
    const app = createApp({ modelService, authorizationService });

    await authenticated(request(app).post(`/models/shared/${model.id}/copy`)).expect(201);

    expect(modelService.create).toHaveBeenCalledWith({
      organizationId,
      userId,
      name: model.name,
      definition: model.definition,
    });
  });

  it("atualiza modelo compartilhado por nova versão autorizada", async () => {
    const modelService = { updateShared: vi.fn().mockResolvedValue({ ...model, version: 2 }) };
    const authorizationService = {
      authorizeSharedModel: vi.fn().mockResolvedValue({
        definition: model.definition,
        department_id: "department-1",
      }),
    };
    const app = createApp({ modelService, authorizationService });

    await authenticated(
      request(app).patch(`/models/shared/${model.id}`).send({ definition: model.definition }),
    ).expect(200);

    expect(modelService.updateShared).toHaveBeenCalledWith({
      id: model.id,
      organizationId,
      departmentId: "department-1",
      name: undefined,
      definition: model.definition,
    });
  });

  it("lista acervo compartilhado somente no departamento atual", async () => {
    const modelService = { listShared: vi.fn().mockResolvedValue([]) };
    const authorizationService = {
      getSharedDepartment: vi.fn().mockResolvedValue({ id: "department-1", module: "financeiro" }),
    };
    const app = createApp({ modelService, authorizationService });

    await authenticated(request(app).get("/models/shared/list")).expect(200, {
      success: true,
      data: { items: [] },
    });

    expect(modelService.listShared).toHaveBeenCalledWith({
      organizationId,
      departmentId: "department-1",
    });
  });

  it("cria modelo compartilhado com departamento vindo do contexto autoritativo", async () => {
    const sharedModel = { ...model, department_id: "department-1" };
    const modelService = { createShared: vi.fn().mockResolvedValue(sharedModel) };
    const authorizationService = {
      authorizeSharedModel: vi.fn().mockResolvedValue({
        definition: model.definition,
        department_id: "department-1",
      }),
    };
    const app = createApp({ modelService, authorizationService });

    const response = await authenticated(
      request(app).post("/models/shared").send({ name: model.name, definition: model.definition }),
    ).expect(201);

    expect(response.body).toEqual({ success: true, data: sharedModel });
    expect(modelService.createShared).toHaveBeenCalledWith({
      organizationId,
      departmentId: "department-1",
      name: model.name,
      definition: model.definition,
    });
  });

  it("cria modelo pessoal somente após validar a definição atual", async () => {
    const modelService = { create: vi.fn().mockResolvedValue(model) };
    const authorizationService = {
      validateDefinition: vi.fn().mockResolvedValue({ definition: model.definition }),
    };
    const app = createApp({ modelService, authorizationService });

    const response = await authenticated(
      request(app).post("/models").send({
        name: model.name,
        definition: model.definition,
      }),
    ).expect(201);

    expect(response.body).toEqual({ success: true, data: model });
    expect(authorizationService.validateDefinition).toHaveBeenCalledWith({
      userId,
      organizationId,
      requestId: "reports-model-create",
      definition: model.definition,
    });
    expect(modelService.create).toHaveBeenCalledWith({
      userId,
      organizationId,
      name: model.name,
      definition: model.definition,
    });
  });

  it("não lista modelo cuja fonte não está mais autorizada", async () => {
    const app = createApp({
      authorizationService: {
        validateDefinition: vi
          .fn()
          .mockRejectedValue(new ServiceError(403, "Fonte não autorizada")),
      },
    });

    const response = await authenticated(request(app).get("/models/list")).expect(200);

    expect(response.body).toEqual({ success: true, data: { items: [] } });
  });
});
