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

const item = {
  code: "PGDAS_D" as const,
  name: "PGDAS-D",
  note: "",
  source: "https://www.gov.br/",
  origin: "SUGGESTED",
  status: "PENDING" as const,
  not_applicable_reason: null,
  completed_on: null,
  completed_by: null,
  protocol: null,
  updatedAt: "2026-09-10T12:00:00.000Z",
};

function deps() {
  return {
    list: vi.fn(async () => ({ control_id: controlId, items: [item], addable: [] })),
    add: vi.fn(async () => item),
    update: vi.fn(async () => item),
  };
}

describe("fiscal monthly obligation routes", () => {
  it("nível 1 lista; escrita exige nível 2", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyObligationRouteDeps: service });

    const listed = await request(app)
      .get(`/fiscal/monthly-controls/${controlId}/obligations`)
      .set(headers(1));
    expect(listed.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(controlId, { userId, organizationId, permission: 1 });

    const added = await request(app)
      .post(`/fiscal/monthly-controls/${controlId}/obligations`)
      .set(headers(1))
      .send({ code: "DIRBI", reason: "Benefício" });
    expect(added.status).toBe(403);
    const updated = await request(app)
      .patch(`/fiscal/monthly-controls/${controlId}/obligations/PGDAS_D`)
      .set(headers(1))
      .send({ completed_on: "2026-09-10" });
    expect(updated.status).toBe(403);
    expect(service.add).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it("inclui e altera com os dados do contrato; recusa código e data inválidos", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyObligationRouteDeps: service });

    const added = await request(app)
      .post(`/fiscal/monthly-controls/${controlId}/obligations`)
      .set(headers())
      .send({ code: "DIRBI", reason: "Benefício" });
    expect(added.status).toBe(201);
    expect(service.add).toHaveBeenCalledWith(
      controlId,
      { code: "DIRBI", reason: "Benefício" },
      { userId, organizationId, permission: 2 },
    );

    const updated = await request(app)
      .patch(`/fiscal/monthly-controls/${controlId}/obligations/PGDAS_D`)
      .set(headers())
      .send({ completed_on: "2026-09-10", protocol: " REC-1 " });
    expect(updated.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(
      controlId,
      "PGDAS_D",
      { completed_on: "2026-09-10", protocol: "REC-1" },
      { userId, organizationId, permission: 2 },
    );

    const cases: Array<[string, Record<string, unknown>]> = [
      ["PGDAS_D", {}],
      ["PGDAS_D", { completed_on: "2026-02-31" }],
      ["PGDAS_D", { completed_on: "10/09/2026" }],
      ["XPTO", { completed_on: "2026-09-10" }],
      ["PGDAS_D", { applicable: "não" }],
    ];
    for (const [code, body] of cases) {
      const invalid = await request(app)
        .patch(`/fiscal/monthly-controls/${controlId}/obligations/${code}`)
        .set(headers())
        .send(body);
      expect(invalid.status).toBe(400);
    }
    expect(service.update).toHaveBeenCalledTimes(1);
  });
});
