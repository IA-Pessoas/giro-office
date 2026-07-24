import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createFiscalApp } from "../app.js";
import { getFiscalServiceEnv } from "../config/env.js";
import type { FiscalSearchRouteDeps } from "../routes/fiscalSearch.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";
const env = getFiscalServiceEnv();
const logger = createLogger({
  service: "fiscal-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
  };
}

function createMockFiscalSearchDeps(): FiscalSearchRouteDeps {
  return {
    searchByNcmCode: vi.fn(async () => ({
      ncm: { id: "n1" },
      icms: [],
      ipi: [],
    })),
  };
}

describe("fiscal search routes", () => {
  it("GET /fiscal/ncm-search sem query ncmCode retorna 400", async () => {
    const deps = createMockFiscalSearchDeps();
    const app = createFiscalApp({ env, logger, fiscalSearchRouteDeps: deps });

    const res = await request(app).get("/fiscal/ncm-search").set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.searchByNcmCode).not.toHaveBeenCalled();
  });

  it("GET /fiscal/ncm-search com ncmCode vazio retorna 400", async () => {
    const deps = createMockFiscalSearchDeps();
    const app = createFiscalApp({ env, logger, fiscalSearchRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm-search")
      .query({ ncmCode: "" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.searchByNcmCode).not.toHaveBeenCalled();
  });

  it("GET /fiscal/ncm-search com ncmCode chama o serviço e retorna 200", async () => {
    const payload = { ncm: { id: "n1" }, icms: [{ id: "i" }], ipi: [] };
    const deps = createMockFiscalSearchDeps();
    deps.searchByNcmCode = vi.fn(async () => payload);
    const app = createFiscalApp({ env, logger, fiscalSearchRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm-search")
      .query({ ncmCode: "84719012" })
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(deps.searchByNcmCode).toHaveBeenCalledWith("84719012", ORG_ID);
  });
});
