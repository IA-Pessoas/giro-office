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
const revenueId = "f0000000-0000-4000-8000-000000000001";

function headers(permission = 2) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function revenue(amount = "12345.67") {
  return {
    id: revenueId,
    client_id: clientId,
    competence: "2026-08",
    amount,
    created_by: userId,
    updated_by: userId,
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:00.000Z",
  };
}

function deps() {
  return {
    create: vi.fn(async () => revenue()),
    update: vi.fn(async () => revenue("100.00")),
    list: vi.fn(async () => ({ data: [revenue()], total: 1, page: 1, limit: 24, hasMore: false })),
    simplesPreview: vi.fn(async () => ({
      client_id: clientId,
      competence: "2026-09",
      status: "ok" as const,
      message: null,
      months: [],
      estimated_month: { competence: "2026-09", amount: "0.00" },
      rbt12: "0.00",
      annexes: [],
    })),
  };
}

describe("fiscal monthly revenue routes", () => {
  it("registra, lista por período e corrige a receita no tenant autenticado", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyRevenueRouteDeps: service });

    const created = await request(app)
      .post("/fiscal/revenues")
      .set(headers())
      .send({ client_id: clientId, competence: "2026-08", amount: "12345.67" });
    expect(created.status).toBe(201);
    expect(created.body.data.amount).toBe("12345.67");
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, userId, client_id: clientId, amount: "12345.67" }),
    );

    const listed = await request(app)
      .get(`/fiscal/revenues/list?client_id=${clientId}&from=2025-09&to=2026-08&page_size=24`)
      .set(headers(1));
    expect(listed.status).toBe(200);
    expect(listed.body.data.data).toHaveLength(1);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: clientId,
        from: "2025-09",
        to: "2026-08",
        page_size: 24,
      }),
      organizationId,
    );

    const updated = await request(app)
      .put(`/fiscal/revenues/${revenueId}`)
      .set(headers())
      .send({ amount: "100.00" });
    expect(updated.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: revenueId, amount: "100.00", organizationId, userId }),
    );
  });

  it("rejeita valor negativo, malformado ou ausente em vez de gravar zero", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyRevenueRouteDeps: service });

    for (const amount of ["-1", "1.234,56", "abc", "", undefined, 10]) {
      const response = await request(app)
        .post("/fiscal/revenues")
        .set(headers())
        .send({ client_id: clientId, competence: "2026-08", amount });
      expect(response.status).toBe(400);
    }
    const badUpdate = await request(app)
      .put(`/fiscal/revenues/${revenueId}`)
      .set(headers())
      .send({ amount: "1.2.3" });
    expect(badUpdate.status).toBe(400);
    const badRange = await request(app)
      .get(`/fiscal/revenues/list?client_id=${clientId}&from=2026-08&to=2025-09`)
      .set(headers(1));
    expect(badRange.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
  });

  it("entrega a prévia do Simples para leitura e valida a competência", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyRevenueRouteDeps: service });

    const preview = await request(app)
      .get(`/fiscal/simples/preview?client_id=${clientId}&competence=2026-09`)
      .set(headers(1));
    expect(preview.status).toBe(200);
    expect(service.simplesPreview).toHaveBeenCalledWith(
      { client_id: clientId, competence: "2026-09" },
      organizationId,
    );

    const invalid = await request(app)
      .get(`/fiscal/simples/preview?client_id=${clientId}&competence=2026-13`)
      .set(headers(1));
    expect(invalid.status).toBe(400);
    const unauthenticated = await request(app).get(
      `/fiscal/simples/preview?client_id=${clientId}&competence=2026-09`,
    );
    expect(unauthenticated.status).toBe(401);
    expect(service.simplesPreview).toHaveBeenCalledOnce();
  });

  it("bloqueia escrita de visualizador e acesso sem autenticação", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, monthlyRevenueRouteDeps: service });

    const forbiddenCreate = await request(app)
      .post("/fiscal/revenues")
      .set(headers(1))
      .send({ client_id: clientId, competence: "2026-08", amount: "1" });
    expect(forbiddenCreate.status).toBe(403);
    const forbiddenUpdate = await request(app)
      .put(`/fiscal/revenues/${revenueId}`)
      .set(headers(1))
      .send({ amount: "1" });
    expect(forbiddenUpdate.status).toBe(403);
    const unauthenticated = await request(app).get(`/fiscal/revenues/list?client_id=${clientId}`);
    expect(unauthenticated.status).toBe(401);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
  });
});
