import "./envBootstrap.js";

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createParcelamentoApp } from "../app.js";
import type { ParcelamentoPrismaClient } from "../prisma/index.js";
import {
  clientId,
  createAuditMock,
  createCreateInstallmentBody,
  createEnv,
  createInstallmentFixture,
  createPrismaMock,
  createTestLogger,
  installmentId,
  organizationId,
  parcelamentoHeaders,
  userId,
} from "./parcelamentoTestUtils.js";

describe("installment routes", () => {
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

  it("POST /parcelamento/installments cria parcelamento e retorna envelope de sucesso", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const app = createTestApp(prisma, audit);

    const response = await request(app)
      .post("/parcelamento/installments")
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send(createCreateInstallmentBody());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: installmentId,
        client_id: clientId,
        agreement_number: "AC-123",
      },
    });
    expect(response.body.data).not.toHaveProperty("organization_id");
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId,
        referring: "parcelamento.installments",
      }),
    );
  });

  it("GET /parcelamento/installments valida query, pagina e retorna envelope", async () => {
    const prisma = createPrismaMock();
    prisma.installment.count.mockResolvedValueOnce(2);
    prisma.installment.findMany.mockResolvedValueOnce([
      createInstallmentFixture({ id: installmentId }),
    ]);
    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/parcelamento/installments?page=2&page_size=1&search=pgfn")
      .set(parcelamentoHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        total: 2,
        page: 2,
        page_size: 1,
        has_more: false,
        items: [expect.objectContaining({ id: installmentId })],
      },
    });
    expect(prisma.installment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 1 }),
    );
  });

  it("GET /parcelamento/installments/:id valida params e detalha", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(createInstallmentFixture());
    const app = createTestApp(prisma);

    const response = await request(app)
      .get(`/parcelamento/installments/${installmentId}`)
      .set(parcelamentoHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: installmentId },
    });
    expect(response.body.data).not.toHaveProperty("organization_id");
  });

  it("PATCH /parcelamento/installments/:id valida body parcial e atualiza", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst
      .mockResolvedValueOnce(createInstallmentFixture({ id: installmentId }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        createInstallmentFixture({ id: installmentId, agreement_number: "AC-999" }),
      );
    const app = createTestApp(prisma);

    const response = await request(app)
      .patch(`/parcelamento/installments/${installmentId}`)
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({ agreement_number: " AC-999 " });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: installmentId, agreement_number: "AC-999" },
    });
  });

  it("retorna 400 quando contexto de organizacao nao foi encaminhado", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/parcelamento/installments")
      .set(parcelamentoHeaders({ "x-organization-id": "" }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "Contexto de organizacao ausente.",
    });
  });

  it("retorna 400 quando contexto de usuario nao foi encaminhado", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/parcelamento/installments")
      .set(parcelamentoHeaders({ "x-user-id": "" }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "Contexto de usuario ausente.",
    });
  });

  it("POST /parcelamento/installments rejects missing organization context", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/parcelamento/installments")
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders({ "x-organization-id": "" }))
      .send(createCreateInstallmentBody());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "Contexto de organizacao ausente.",
    });
  });

  it("POST /parcelamento/installments rejects negative amounts", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/parcelamento/installments")
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send(createCreateInstallmentBody({ first_installment_amount: -1 }));

    expect(response.status).toBe(400);
  });

  it("retorna 400 para query invalida", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/parcelamento/installments?page=0")
      .set(parcelamentoHeaders());

    expect(response.status).toBe(400);
  });

  it("retorna 400 para params invalidos", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/parcelamento/installments/not-a-uuid")
      .set(parcelamentoHeaders());

    expect(response.status).toBe(400);
  });

  it("retorna 400 para PATCH vazio", async () => {
    const app = createTestApp();

    const response = await request(app)
      .patch(`/parcelamento/installments/${installmentId}`)
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({});

    expect(response.status).toBe(400);
  });

  it("retorna 400 para campo desconhecido no POST", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/parcelamento/installments")
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({ ...createCreateInstallmentBody(), unknown: true });

    expect(response.status).toBe(400);
  });

  it("PATCH /parcelamento/installments/:id rejects unknown fields", async () => {
    const app = createTestApp();

    const response = await request(app)
      .patch(`/parcelamento/installments/${installmentId}`)
      .set("Content-Type", "application/json")
      .set(parcelamentoHeaders())
      .send({ agreement_number: "AC-999", unknown: true });

    expect(response.status).toBe(400);
  });

  it("GET /parcelamento/installments/:id returns 404 from service", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(null);
    const app = createTestApp(prisma);

    const response = await request(app)
      .get(`/parcelamento/installments/${installmentId}`)
      .set(parcelamentoHeaders());

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: "Parcelamento nao encontrado.",
    });
  });
});
