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
const clientId = "d0000000-0000-4000-8000-000000000001";
const controlId = "f0000000-0000-4000-8000-000000000001";

function headers(permission = 2) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function control(status = "PENDING" as const) {
  return {
    id: controlId,
    client_id: clientId,
    competence: "2026-08",
    status,
    no_movement: false,
    regime: null,
    opening_reason: null,
    updated_by: userId,
    updatedAt: "2026-09-01T12:00:00.000Z",
  };
}

function deps() {
  return {
    list: vi.fn(async () => ({
      competence: "2026-08",
      items: [{ ...control(), client_name: "Alfa", pending_obligations: 0 }],
    })),
    open: vi.fn(async () => ({ control: control(), created: true })),
    update: vi.fn(async () => control()),
  };
}

describe("fiscal monthly control routes", () => {
  it("Fiscal nível 1 lista a competência e não altera", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyControlRouteDeps: service });

    const listed = await request(app)
      .get("/fiscal/monthly-controls?competence=2026-08")
      .set(headers(1));
    expect(listed.status).toBe(200);
    expect(listed.body.data.items[0].client_name).toBe("Alfa");
    expect(service.list).toHaveBeenCalledWith(
      { competence: "2026-08" },
      { userId, organizationId, permission: 1 },
    );

    const opened = await request(app)
      .post("/fiscal/monthly-controls")
      .set(headers(1))
      .send({ client_id: clientId, competence: "2026-08", reason: "Avulso" });
    expect(opened.status).toBe(403);
    const updated = await request(app)
      .patch(`/fiscal/monthly-controls/${controlId}`)
      .set(headers(1))
      .send({ status: "COMPLETED" });
    expect(updated.status).toBe(403);
    expect(service.open).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it("abre controle: 201 quando cria e 200 quando já existia", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyControlRouteDeps: service });

    const created = await request(app)
      .post("/fiscal/monthly-controls")
      .set(headers())
      .send({ client_id: clientId, competence: "2026-08", reason: "  Apuração avulsa  " });
    expect(created.status).toBe(201);
    expect(service.open).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, userId, reason: "Apuração avulsa" }),
    );

    service.open.mockResolvedValueOnce({ control: control(), created: false });
    const again = await request(app)
      .post("/fiscal/monthly-controls")
      .set(headers())
      .send({ client_id: clientId, competence: "2026-08" });
    expect(again.status).toBe(200);
    expect(again.body.data.created).toBe(false);
  });

  it("altera situação e movimento e recusa valores fora do contrato", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyControlRouteDeps: service });

    const updated = await request(app)
      .patch(`/fiscal/monthly-controls/${controlId}`)
      .set(headers(3))
      .send({ status: "IN_PROGRESS", no_movement: true, reason: "Retificação" });
    expect(updated.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith({
      id: controlId,
      status: "IN_PROGRESS",
      no_movement: true,
      reason: "Retificação",
      userId,
      organizationId,
      permission: 3,
    });

    for (const body of [{}, { status: "DONE" }, { no_movement: "sim" }, { reason: "x" }]) {
      const invalid = await request(app)
        .patch(`/fiscal/monthly-controls/${controlId}`)
        .set(headers())
        .send(body);
      expect(invalid.status).toBe(400);
    }
    const badCompetence = await request(app)
      .get("/fiscal/monthly-controls?competence=2026-13")
      .set(headers());
    expect(badCompetence.status).toBe(400);
    expect(service.update).toHaveBeenCalledTimes(1);
  });
});
