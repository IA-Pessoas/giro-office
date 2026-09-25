import "./envBootstrap.js";

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createParcelamentoApp } from "../app.js";
import type { ParcelamentoPrismaClient } from "../prisma/index.js";
import {
  clientId,
  createAuditMock,
  createCreatePanoramaBody,
  createEnv,
  createPanoramaFixture,
  createPrismaMock,
  createTestLogger,
  panoramaId,
  parcelamentoHeaders,
} from "./parcelamentoTestUtils.js";

describe("panorama routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createTestApp(prisma = createPrismaMock(), audit = createAuditMock()) {
    return createParcelamentoApp({
      env: createEnv(),
      logger: createTestLogger(),
      prisma: prisma as unknown as ParcelamentoPrismaClient,
      auditService: audit,
    });
  }

  it("GET /parcelamento/panoramas returns page envelope", async () => {
    const prisma = createPrismaMock();
    prisma.panoramaParcelameto.count.mockResolvedValueOnce(1);
    prisma.panoramaParcelameto.findMany.mockResolvedValueOnce([createPanoramaFixture()]);
    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/parcelamento/panoramas?page=1&page_size=10&competence=2026-07")
      .set(parcelamentoHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        total: 1,
        page: 1,
        page_size: 10,
        has_more: false,
        items: [expect.objectContaining({ id: panoramaId, competence: "2026-07" })],
      },
    });
    expect(response.body.data.items[0]).not.toHaveProperty("organization_id");
  });

  it("POST /parcelamento/panoramas rejects missing client_id", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/parcelamento/panoramas")
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({ competence: "2026-07" });

    expect(response.status).toBe(400);
  });

  it("POST /parcelamento/panoramas maps duplicate to 409", async () => {
    const prisma = createPrismaMock();
    prisma.panoramaParcelameto.findFirst.mockResolvedValueOnce(createPanoramaFixture());
    const app = createTestApp(prisma);

    const response = await request(app)
      .post("/parcelamento/panoramas")
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send(createCreatePanoramaBody());

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: "Já existe panorama para este cliente e competência.",
    });
  });

  it("PATCH /parcelamento/panoramas/:id rejects unknown fields", async () => {
    const app = createTestApp();

    const response = await request(app)
      .patch(`/parcelamento/panoramas/${panoramaId}`)
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({ cnd_fgts: true, unknown: true });

    expect(response.status).toBe(400);
  });

  it("POST /parcelamento/panoramas/competences/:competence/generate rejects competence in body", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/parcelamento/panoramas/competences/2026-07/generate")
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({ competence: "2026-08" });

    expect(response.status).toBe(400);
  });

  it("POST /parcelamento/panoramas/competences/:competence/generate returns counters", async () => {
    const prisma = createPrismaMock();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientId }]);
    prisma.panoramaParcelameto.findMany.mockResolvedValueOnce([]);
    prisma.panoramaParcelameto.createMany.mockResolvedValueOnce({ count: 1 });
    const app = createTestApp(prisma);

    const response = await request(app)
      .post("/parcelamento/panoramas/competences/2026-07/generate")
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { created: 1, existing: 0, totalActiveClients: 1 },
    });
  });
});
