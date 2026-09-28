import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { MonthlyRevenueService } from "../services/monthlyRevenueService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const clientId = "d0000000-0000-4000-8000-000000000001";
const revenueId = "f0000000-0000-4000-8000-000000000001";

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: revenueId,
    organization_id: organizationId,
    client_id: clientId,
    competence: new Date("2026-08-01T00:00:00.000Z"),
    amount: { toString: () => "12345.67" },
    created_by: userId,
    updated_by: userId,
    createdAt: new Date("2026-09-28T12:00:00.000Z"),
    updatedAt: new Date("2026-09-28T12:00:00.000Z"),
    ...overrides,
  };
}

function dependencies() {
  const prisma = {
    client: { findFirst: vi.fn(async () => ({ id: clientId })) },
    fiscalMonthlyRevenue: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        stored({ ...data, amount: { toString: () => String(data.amount) } }),
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        stored({ amount: { toString: () => String(data.amount) }, updated_by: data.updated_by }),
      ),
      findFirst: vi.fn(async () => null as ReturnType<typeof stored> | null),
      findMany: vi.fn(async () => [stored()]),
      count: vi.fn(async () => 1),
    },
  };
  const audit = { createLog: vi.fn(async () => {}) };
  return { prisma, audit };
}

describe("MonthlyRevenueService", () => {
  it("registra a receita da competência para cliente do mesmo tenant", async () => {
    const { prisma, audit } = dependencies();
    const service = new MonthlyRevenueService(prisma as never, audit);

    const result = await service.create({
      organizationId,
      userId,
      client_id: clientId,
      competence: "2026-08",
      amount: "12345.67",
    });

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.fiscalMonthlyRevenue.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        client_id: clientId,
        competence: new Date("2026-08-01T00:00:00.000Z"),
        amount: "12345.67",
        created_by: userId,
        updated_by: userId,
      },
    });
    expect(result).toMatchObject({ id: revenueId, competence: "2026-08", amount: "12345.67" });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Cadastro", referring: "fiscal.monthly_revenues" }),
    );
  });

  it("aceita receita zero informada explicitamente", async () => {
    const { prisma, audit } = dependencies();
    const service = new MonthlyRevenueService(prisma as never, audit);

    const result = await service.create({
      organizationId,
      userId,
      client_id: clientId,
      competence: "2026-08",
      amount: "0",
    });

    expect(result.amount).toBe("0");
  });

  it("recusa segunda receita para o mesmo cliente e competência", async () => {
    const { prisma, audit } = dependencies();
    prisma.fiscalMonthlyRevenue.findFirst.mockResolvedValueOnce(stored());
    const service = new MonthlyRevenueService(prisma as never, audit);

    await expect(
      service.create({
        organizationId,
        userId,
        client_id: clientId,
        competence: "2026-08",
        amount: "10",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.fiscalMonthlyRevenue.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        competence: new Date("2026-08-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
    expect(prisma.fiscalMonthlyRevenue.create).not.toHaveBeenCalled();
  });

  it("traduz violação do índice único em conflito", async () => {
    const { prisma, audit } = dependencies();
    prisma.fiscalMonthlyRevenue.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );
    const service = new MonthlyRevenueService(prisma as never, audit);

    await expect(
      service.create({
        organizationId,
        userId,
        client_id: clientId,
        competence: "2026-08",
        amount: "10",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("recusa cliente de outra organização antes de gravar", async () => {
    const { prisma, audit } = dependencies();
    prisma.client.findFirst.mockResolvedValueOnce(null as never);
    const service = new MonthlyRevenueService(prisma as never, audit);

    await expect(
      service.create({
        organizationId,
        userId,
        client_id: clientId,
        competence: "2026-08",
        amount: "10",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.fiscalMonthlyRevenue.create).not.toHaveBeenCalled();
  });

  it("corrige o valor só dentro do tenant e registra a alteração", async () => {
    const { prisma, audit } = dependencies();
    prisma.fiscalMonthlyRevenue.findFirst.mockResolvedValueOnce(stored());
    const service = new MonthlyRevenueService(prisma as never, audit);

    const result = await service.update({
      organizationId,
      userId,
      id: revenueId,
      amount: "999.10",
    });

    expect(prisma.fiscalMonthlyRevenue.findFirst).toHaveBeenCalledWith({
      where: { id: revenueId, organization_id: organizationId },
    });
    expect(prisma.fiscalMonthlyRevenue.update).toHaveBeenCalledWith({
      where: { id: revenueId },
      data: { amount: "999.10", updated_by: userId },
    });
    expect(result.amount).toBe("999.10");
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Atualização",
        referringId: revenueId,
        changes: { amount: { from: "12345.67", to: "999.10" } },
      }),
    );
  });

  it("não corrige receita de outra organização", async () => {
    const { prisma, audit } = dependencies();
    const service = new MonthlyRevenueService(prisma as never, audit);

    await expect(
      service.update({ organizationId, userId, id: revenueId, amount: "1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.fiscalMonthlyRevenue.update).not.toHaveBeenCalled();
  });

  it("lista as receitas do cliente no tenant, filtrando o intervalo de competências", async () => {
    const { prisma, audit } = dependencies();
    const service = new MonthlyRevenueService(prisma as never, audit);

    const result = await service.list(
      { client_id: clientId, from: "2025-09", to: "2026-08", page: 1, page_size: 24 },
      organizationId,
    );

    const where = {
      organization_id: organizationId,
      client_id: clientId,
      competence: {
        gte: new Date("2025-09-01T00:00:00.000Z"),
        lte: new Date("2026-08-01T00:00:00.000Z"),
      },
    };
    expect(prisma.fiscalMonthlyRevenue.count).toHaveBeenCalledWith({ where });
    expect(prisma.fiscalMonthlyRevenue.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ competence: "desc" }],
      skip: 0,
      take: 24,
    });
    expect(result).toMatchObject({ total: 1, page: 1, limit: 24, hasMore: false });
    expect(result.data[0]).toMatchObject({ competence: "2026-08", amount: "12345.67" });
  });

  it("não lista receitas de cliente de outra organização", async () => {
    const { prisma, audit } = dependencies();
    prisma.client.findFirst.mockResolvedValueOnce(null as never);
    const service = new MonthlyRevenueService(prisma as never, audit);

    await expect(service.list({ client_id: clientId }, organizationId)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.fiscalMonthlyRevenue.findMany).not.toHaveBeenCalled();
  });
});
