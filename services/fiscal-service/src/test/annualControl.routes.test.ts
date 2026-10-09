import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createFiscalApp } from "../app.js";
import { getFiscalServiceEnv } from "../config/env.js";

const env = getFiscalServiceEnv();
const logger = createLogger({ service: "fiscal-service", env: env.nodeEnv, level: env.logLevel });
const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const controlId = "f0000000-0000-4000-8000-000000000001";

function headers(permission = 2) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

const declaration = {
  code: "DEFIS" as const,
  name: "DEFIS",
  note: "",
  source: "https://www.gov.br/",
  origin: "SUGGESTED",
  status: "PENDING" as const,
  not_applicable_reason: null,
  completed_on: null,
  completed_by: null,
  protocol: null,
  updatedAt: "2026-03-01T12:00:00.000Z",
};

function deps() {
  return {
    list: vi.fn(async () => ({ year: 2025, items: [] })),
    items: vi.fn(async () => ({ control_id: controlId, items: [declaration], addable: [] })),
    addItem: vi.fn(async () => declaration),
    updateItem: vi.fn(async () => declaration),
  };
}

describe("fiscal annual control routes", () => {
  it("nível 1 consulta; escrita exige nível 2", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, annualControlRouteDeps: service });

    const listed = await request(app).get("/fiscal/annual-controls?year=2025").set(headers(1));
    expect(listed.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(
      { year: 2025 },
      { userId, organizationId, permission: 1 },
    );
    const items = await request(app)
      .get(`/fiscal/annual-controls/${controlId}/items`)
      .set(headers(1));
    expect(items.status).toBe(200);

    const add = await request(app)
      .post(`/fiscal/annual-controls/${controlId}/items`)
      .set(headers(1))
      .send({ code: "DMED", reason: "Clínica" });
    expect(add.status).toBe(403);
    expect(service.addItem).not.toHaveBeenCalled();
  });

  it("inclui e altera com o contrato; recusa ano, código e data inválidos", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, annualControlRouteDeps: service });

    const add = await request(app)
      .post(`/fiscal/annual-controls/${controlId}/items`)
      .set(headers())
      .send({ code: "DMED", reason: "Clínica" });
    expect(add.status).toBe(201);
    expect(service.addItem).toHaveBeenCalledWith(
      controlId,
      { code: "DMED", reason: "Clínica" },
      { userId, organizationId, permission: 2 },
    );
    const updated = await request(app)
      .patch(`/fiscal/annual-controls/${controlId}/items/DEFIS`)
      .set(headers())
      .send({ completed_on: "2026-03-10" });
    expect(updated.status).toBe(200);

    expect((await request(app).get("/fiscal/annual-controls?year=99").set(headers())).status).toBe(
      400,
    );
    for (const [code, body] of [
      ["DIRBI", { completed_on: "2026-03-10" }],
      ["DEFIS", { completed_on: "2026-02-30" }],
      ["DEFIS", {}],
    ] as const) {
      const response = await request(app)
        .patch(`/fiscal/annual-controls/${controlId}/items/${code}`)
        .set(headers())
        .send(body);
      expect(response.status).toBe(400);
    }
    expect(service.updateItem).toHaveBeenCalledTimes(1);
  });
});
