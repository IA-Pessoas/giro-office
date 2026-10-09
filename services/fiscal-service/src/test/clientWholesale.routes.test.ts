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

function headers(permission = 2) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function deps() {
  const state = {
    client_id: clientId,
    is_wholesale: true,
    updated_at: "2026-10-09T12:00:00.000Z",
    updated_by: userId,
    history: [],
  };
  return { get: vi.fn(async () => state), set: vi.fn(async () => state) };
}

describe("fiscal client wholesale routes", () => {
  it("nível 1 consulta; nível 2 altera no tenant autenticado", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, clientWholesaleRouteDeps: service });

    const read = await request(app).get(`/fiscal/clients/${clientId}/wholesale`).set(headers(1));
    expect(read.status).toBe(200);
    expect(service.get).toHaveBeenCalledWith(clientId, organizationId);

    const updated = await request(app)
      .put(`/fiscal/clients/${clientId}/wholesale`)
      .set(headers())
      .send({ is_wholesale: true });
    expect(updated.status).toBe(200);
    expect(service.set).toHaveBeenCalledWith(
      expect.objectContaining({ clientId, isWholesale: true, organizationId, userId }),
    );
  });

  it("nível 1 não altera; corpo inválido é recusado", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, clientWholesaleRouteDeps: service });

    const viewer = await request(app)
      .put(`/fiscal/clients/${clientId}/wholesale`)
      .set(headers(1))
      .send({ is_wholesale: true });
    const notBoolean = await request(app)
      .put(`/fiscal/clients/${clientId}/wholesale`)
      .set(headers())
      .send({ is_wholesale: "sim" });
    const extra = await request(app)
      .put(`/fiscal/clients/${clientId}/wholesale`)
      .set(headers())
      .send({ is_wholesale: true, organization_id: "x" });
    const badClient = await request(app).get("/fiscal/clients/abc/wholesale").set(headers());

    expect([viewer.status, notBoolean.status, extra.status, badClient.status]).toEqual([
      403, 400, 400, 400,
    ]);
    expect(service.set).not.toHaveBeenCalled();
    expect(service.get).not.toHaveBeenCalled();
  });
});
