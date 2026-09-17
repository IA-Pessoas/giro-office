import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createContabilApp } from "../app.js";
import { getContabilServiceEnv } from "../config/env.js";
import type { TriageClosingRouteDeps } from "../routes/triageClosing.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const env = getContabilServiceEnv();
const logger = createLogger({
  service: "contabil-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

function headers(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: "c0000000-0000-4000-8000-000000000001",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
    [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ contabil: 2 }),
  };
}

function deps(): TriageClosingRouteDeps {
  return {
    get: vi.fn(async () => ({ client_id: CLIENT_ID, status: "NOT_RECEIVED" })),
    update: vi.fn(async () => ({ client_id: CLIENT_ID, status: "CLOSED" })),
    archive: vi.fn(async () => ({ client_id: CLIENT_ID, archived_at: "2026-09-01" })),
  };
}

describe("triage closing routes", () => {
  it("consulta o fechamento com organização autenticada", async () => {
    const service = deps();
    const app = createContabilApp({ env, logger, triageClosingRouteDeps: service });

    const res = await request(app)
      .get("/triagem/closing")
      .query({ client_id: CLIENT_ID, competence: "2026-09" })
      .set(headers());

    expect(res.status).toBe(200);
    expect(service.get).toHaveBeenCalledWith(
      { client_id: CLIENT_ID, competence: "2026-09" },
      ORGANIZATION_ID,
    );
  });

  it("rejeita status fora do contrato antes da mutação", async () => {
    const service = deps();
    const app = createContabilApp({ env, logger, triageClosingRouteDeps: service });

    const res = await request(app)
      .put("/triagem/closing")
      .set(headers())
      .send({ client_id: CLIENT_ID, competence: "2026-09", status: "INVALID" });

    expect(res.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it("exige autenticação para arquivar", async () => {
    const service = deps();
    const app = createContabilApp({ env, logger, triageClosingRouteDeps: service });

    const res = await request(app)
      .delete("/triagem/closing")
      .send({ client_id: CLIENT_ID, competence: "2026-09" });

    expect(res.status).toBe(401);
    expect(service.archive).not.toHaveBeenCalled();
  });
});
