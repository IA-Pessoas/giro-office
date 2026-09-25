import "./envBootstrap.js";

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createParcelamentoApp } from "../app.js";
import type { ParcelamentoPrismaClient } from "../prisma/index.js";
import {
  competencyId,
  createAuditMock,
  createCreateInstallmentCompetencyBody,
  createEnv,
  createInstallmentCompetencyFixture,
  createInstallmentFixture,
  createPrismaMock,
  createTestLogger,
  installmentId,
  parcelamentoHeaders,
} from "./parcelamentoTestUtils.js";

describe("installment competency routes", () => {
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

  it("GET /parcelamento/installments/:installmentId/competencies returns page envelope", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(createInstallmentFixture());
    prisma.installmentCompetencies.count.mockResolvedValueOnce(1);
    prisma.installmentCompetencies.findMany.mockResolvedValueOnce([
      createInstallmentCompetencyFixture(),
    ]);
    const app = createTestApp(prisma);

    const response = await request(app)
      .get(`/parcelamento/installments/${installmentId}/competencies?page=1&page_size=10`)
      .set(parcelamentoHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        total: 1,
        page: 1,
        page_size: 10,
        has_more: false,
        items: [expect.objectContaining({ id: competencyId, competence: "2026-07" })],
      },
    });
    expect(response.body.data.items[0]).not.toHaveProperty("organization_id");
  });

  it("POST /parcelamento/installments/:installmentId/competencies rejects duplicate from service as 409", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(createInstallmentFixture());
    prisma.installmentCompetencies.findFirst.mockResolvedValueOnce(
      createInstallmentCompetencyFixture(),
    );
    const app = createTestApp(prisma);

    const response = await request(app)
      .post(`/parcelamento/installments/${installmentId}/competencies`)
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send(createCreateInstallmentCompetencyBody());

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: "Já existe competência para este parcelamento.",
    });
  });

  it("POST /parcelamento/installments/:installmentId/competencies rejects negative counts", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post(`/parcelamento/installments/${installmentId}/competencies`)
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send(createCreateInstallmentCompetencyBody({ how_many_paid: -1 }));

    expect(response.status).toBe(400);
  });

  it("PATCH /parcelamento/installment-competencies/:id rejects empty body", async () => {
    const app = createTestApp();

    const response = await request(app)
      .patch(`/parcelamento/installment-competencies/${competencyId}`)
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({});

    expect(response.status).toBe(400);
  });

  it("PATCH /parcelamento/installment-competencies/:id rejects unknown fields", async () => {
    const app = createTestApp();

    const response = await request(app)
      .patch(`/parcelamento/installment-competencies/${competencyId}`)
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({ notes: "ok", unknown: true });

    expect(response.status).toBe(400);
  });
});
