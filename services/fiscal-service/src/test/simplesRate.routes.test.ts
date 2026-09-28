import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createFiscalApp } from "../app.js";
import { getFiscalServiceEnv } from "../config/env.js";

const env = getFiscalServiceEnv();
const logger = createLogger({ service: "fiscal-service", env: env.nodeEnv, level: env.logLevel });
const organizationId = "a0000000-0000-4000-8000-000000000001";
const clientId = "d0000000-0000-4000-8000-000000000001";

function headers(permission = 1) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_USER_ID_HEADER]: "c0000000-0000-4000-8000-000000000001",
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function deps() {
  return {
    preview: vi.fn(async () => ({
      client_id: clientId,
      competence: "2026-08",
      applies_to: "2026-09",
      status: "ok" as const,
      message: null,
      months: [],
      estimated_month: { competence: "2026-08", amount: "0.00" },
      rbt12: "0.00",
      annexes: [],
    })),
    emission: vi.fn(async () => ({
      client_id: clientId,
      client_name: "Padaria Exemplo Ltda",
      client_document: "12.345.678/0001-90",
      competence: "2026-08",
      applies_to: "2026-09",
      annex: "I" as const,
      tax: "ICMS" as const,
      rate: "5.00",
    })),
  };
}

describe("fiscal Simples rate routes", () => {
  it("entrega prévia e PDF para leitura no tenant autenticado", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, simplesRateRouteDeps: service });

    const preview = await request(app)
      .get(`/fiscal/simples/preview?client_id=${clientId}&competence=2026-08`)
      .set(headers());
    expect(preview.status).toBe(200);
    expect(service.preview).toHaveBeenCalledWith(
      { client_id: clientId, competence: "2026-08" },
      organizationId,
    );

    const pdf = await request(app)
      .get(`/fiscal/simples/pdf?client_id=${clientId}&competence=2026-08&annex=I`)
      .set(headers());
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect(pdf.headers["cache-control"]).toBe("no-store");
    expect(pdf.headers["content-disposition"]).toContain("aliquota-ICMS-anexo-I-2026-09-");
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(service.emission).toHaveBeenCalledWith(
      { client_id: clientId, competence: "2026-08", annex: "I" },
      organizationId,
    );
  });

  it("devolve o erro de emissão sem entregar documento", async () => {
    const service = deps();
    service.emission.mockRejectedValueOnce(new ServiceError(422, "Não há base para calcular."));
    const app = createFiscalApp({ env, logger, simplesRateRouteDeps: service });

    const response = await request(app)
      .get(`/fiscal/simples/pdf?client_id=${clientId}&competence=2026-08&annex=III`)
      .set(headers());
    expect(response.status).toBe(422);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toMatchObject({ success: false, error: "Não há base para calcular." });
  });

  it("valida anexo e competência e exige autenticação", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, simplesRateRouteDeps: service });

    for (const query of ["competence=2026-08&annex=VI", "competence=2026-13&annex=I", "annex=I"]) {
      const response = await request(app)
        .get(`/fiscal/simples/pdf?client_id=${clientId}&${query}`)
        .set(headers());
      expect(response.status).toBe(400);
    }
    const unauthenticated = await request(app).get(
      `/fiscal/simples/pdf?client_id=${clientId}&competence=2026-08&annex=I`,
    );
    expect(unauthenticated.status).toBe(401);
    expect(service.emission).not.toHaveBeenCalled();
  });
});
