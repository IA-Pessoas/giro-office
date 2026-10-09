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
const batchId = "b0000000-0000-4000-8000-000000000001";

function headers(permission = 2) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

const batch = {
  id: batchId,
  client_id: clientId,
  competence: "2026-09",
  file_name: "notas.zip",
  status: "pending_review" as const,
  responsible_id: userId,
  reviewer_id: null,
  entry_count: 1,
  note_count: 1,
  item_count: 1,
  issues: [],
  created_by: userId,
  createdAt: "2026-10-09T12:00:00.000Z",
  updatedAt: "2026-10-09T12:00:00.000Z",
};

function deps() {
  return {
    importBatch: vi.fn(async () => ({ ...batch, items: [] })),
    list: vi.fn(async () => ({ data: [batch], total: 1, page: 1, limit: 50, hasMore: false })),
    detail: vi.fn(async () => ({ ...batch, items: [], history: [] })),
    updateItem: vi.fn(async () => ({}) as never),
    submit: vi.fn(async () => ({ ...batch, status: "awaiting_check" as const })),
    check: vi.fn(async () => ({ ...batch, status: "checked" as const })),
  };
}

// Acima do limite padrão de 100 kB do express.json(), abaixo do 1 MB do gateway.
const body = {
  client_id: clientId,
  competence: "2026-09",
  file_name: "notas.zip",
  zip_base64: "A".repeat(200_000),
};

describe("fiscal anticipation routes", () => {
  it("importa ZIP grande, lista e detalha na organização autenticada", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, anticipationRouteDeps: service });

    const created = await request(app)
      .post("/fiscal/anticipations/batches")
      .set(headers())
      .send(body);
    expect(created.status).toBe(201);
    expect(service.importBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId,
        client_id: clientId,
        competence: "2026-09",
      }),
    );

    const listed = await request(app)
      .get(`/fiscal/anticipations/batches/list?client_id=${clientId}&competence=2026-09`)
      .set(headers(1));
    expect(listed.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: clientId, competence: "2026-09" }),
      organizationId,
    );

    const detail = await request(app)
      .get(`/fiscal/anticipations/batches/${batchId}`)
      .set(headers(1));
    expect(detail.status).toBe(200);
    expect(service.detail).toHaveBeenCalledWith(batchId, organizationId);
  });

  it("nível 1 consulta mas não importa", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, anticipationRouteDeps: service });

    const created = await request(app)
      .post("/fiscal/anticipations/batches")
      .set(headers(1))
      .send(body);

    expect(created.status).toBe(403);
    expect(service.importBatch).not.toHaveBeenCalled();
  });

  it("recusa competência, cliente e base64 inválidos", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, anticipationRouteDeps: service });

    const response = await request(app)
      .post("/fiscal/anticipations/batches")
      .set(headers())
      .send({ ...body, competence: "2026-13", zip_base64: "não é base64" });

    expect(response.status).toBe(400);
    expect(service.importBatch).not.toHaveBeenCalled();
  });

  it("revisa item, envia e conferente decide, com o ator autenticado", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, anticipationRouteDeps: service });
    const itemId = "e0000000-0000-4000-8000-000000000001";
    const reviewerId = "c0000000-0000-4000-8000-000000000002";

    const item = await request(app)
      .put(`/fiscal/anticipations/batches/${batchId}/items/${itemId}`)
      .set(headers())
      .send({ classification: "freight", corrections: { cfop: "6353" }, reason: "Frete" });
    expect(item.status).toBe(200);
    expect(service.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId,
        itemId,
        organizationId,
        userId,
        classification: "freight",
        corrections: { cfop: "6353" },
        reason: "Frete",
      }),
    );

    const submitted = await request(app)
      .post(`/fiscal/anticipations/batches/${batchId}/submit`)
      .set(headers())
      .send({ reviewer_id: reviewerId });
    expect(submitted.status).toBe(200);
    expect(service.submit).toHaveBeenCalledWith(
      expect.objectContaining({ batchId, reviewer_id: reviewerId, userId }),
    );

    const checked = await request(app)
      .post(`/fiscal/anticipations/batches/${batchId}/check`)
      .set(headers())
      .send({ decision: "return", reason: "Rever item 2" });
    expect(checked.status).toBe(200);
    expect(service.check).toHaveBeenCalledWith(
      expect.objectContaining({ batchId, decision: "return", reason: "Rever item 2" }),
    );
  });

  it("recusa revisão sem motivo, devolução sem motivo e escrita de nível 1", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, anticipationRouteDeps: service });
    const itemPath = `/fiscal/anticipations/batches/${batchId}/items/e0000000-0000-4000-8000-000000000001`;

    const noReason = await request(app)
      .put(itemPath)
      .set(headers())
      .send({ classification: "total" });
    const badReturn = await request(app)
      .post(`/fiscal/anticipations/batches/${batchId}/check`)
      .set(headers())
      .send({ decision: "return" });
    const viewer = await request(app)
      .put(itemPath)
      .set(headers(1))
      .send({ classification: "total", reason: "x" });

    expect([noReason.status, badReturn.status, viewer.status]).toEqual([400, 400, 403]);
    expect(service.updateItem).not.toHaveBeenCalled();
    expect(service.check).not.toHaveBeenCalled();
  });
});
