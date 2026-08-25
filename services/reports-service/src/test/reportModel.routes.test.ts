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
