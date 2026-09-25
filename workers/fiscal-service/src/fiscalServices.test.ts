import { ServiceError } from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { FiscalSearchService, IpiService, NcmService } from "./fiscalServices.js";

const ORG = "a0000000-0000-4000-8000-000000000001";
const ID = "e0000000-0000-4000-8000-000000000001";
const AUTH = { userId: "user-1", organizationId: ORG, permission: 3 };

function delegate() {
  return {
    findFirst: vi.fn(),
    findMany: vi.fn(async () => [{ id: ID }]),
    count: vi.fn(async () => 7),
    create: vi.fn(async () => ({ id: ID })),
    update: vi.fn(async () => ({ id: ID, ncm: "0102" })),
    delete: vi.fn(async () => ({ id: ID })),
  };
}

function audit() {
  return { createLog: vi.fn(async () => {}), logUpdateIfChanged: vi.fn(async () => {}) };
}

describe("serviços fiscais portados para o Worker", () => {
  it("IPI: 409 em duplicado, cria com organização e audita Cadastro", async () => {
    const ipi = delegate();
    const log = audit();
    const service = new IpiService({ ipi } as never, log);

    ipi.findFirst.mockResolvedValueOnce({ id: ID });
    await expect(service.create({ ...AUTH, ncm: "0101" })).rejects.toMatchObject({
      statusCode: 409,
      message: "Já cadastrado.",
    });

    ipi.findFirst.mockResolvedValueOnce(null);
    await expect(service.create({ ...AUTH, ncm: "0101", aliquot: "5" })).resolves.toEqual({
      create: { id: ID },
    });
    expect(ipi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organization_id: ORG,
          ncm: "0101",
          ex: undefined,
          description: undefined,
          aliquot: "5",
        },
      }),
    );
    expect(log.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Cadastro", referring: "fiscal.ipi", referringId: ID }),
    );
  });

  it("IPI: update/delete/detail respeitam tenant e mensagens do Node", async () => {
    const ipi = delegate();
    const log = audit();
    const service = new IpiService({ ipi } as never, log);
    ipi.findFirst.mockResolvedValue(null);

    await expect(service.update({ ...AUTH, ipi_id: ID, ncm: "1" })).rejects.toMatchObject({
      statusCode: 404,
      message: "IPI não existe.",
    });
    await expect(service.delete({ ...AUTH, ipi_id: ID })).rejects.toMatchObject({
      statusCode: 404,
      message: "IPI não existe.",
    });
    await expect(service.detail(ID, ORG)).rejects.toMatchObject({
      statusCode: 404,
      message: "IPI não encontrado.",
    });
    expect(ipi.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID, organization_id: ORG } }),
    );
    expect(ipi.update).not.toHaveBeenCalled();
    expect(ipi.delete).not.toHaveBeenCalled();

    ipi.findFirst.mockResolvedValue({ id: ID, ncm: "0101" });
    await service.update({ ...AUTH, ipi_id: ID, ncm: "0102" });
    expect(log.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Atualização", oldData: { id: ID, ncm: "0101" } }),
    );
    ipi.update.mockRejectedValueOnce(new Error("db down"));
    await expect(service.update({ ...AUTH, ipi_id: ID, ncm: "0102" })).rejects.toMatchObject({
      statusCode: 500,
      message: "Erro ao atualizar.",
    });
  });

  it("IPI/NCM: lista paginada com filtro insensitive, ordenação e hasMore", async () => {
    const ipi = delegate();
    const ncm = delegate();
    const ipiService = new IpiService({ ipi } as never, audit());
    const ncmService = new NcmService({ ncm } as never, audit());

    await expect(
      ipiService.list({ ipiCodes: [" 0101 ", ""], page: 2, page_size: 3 }, ORG),
    ).resolves.toEqual({ data: [{ id: ID }], total: 7, page: 2, limit: 3, hasMore: true });
    expect(ipi.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORG,
          OR: [{ ncm: { contains: "0101", mode: "insensitive" } }],
        },
        orderBy: { ncm: "asc" },
        skip: 3,
        take: 3,
      }),
    );

    await expect(ncmService.list({}, ORG)).resolves.toMatchObject({
      page: 1,
      limit: 50,
      hasMore: false,
    });
    expect(ncm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG },
        orderBy: { ncm_code: "asc" },
        skip: 0,
        take: 50,
      }),
    );
  });

  it("NCM: create usa todos os campos na checagem de duplicidade e delete audita Exclusao", async () => {
    const ncm = delegate();
    const log = audit();
    const service = new NcmService({ ncm } as never, log);
    const body = {
      tax_regime: "Lucro Real",
      ncm_code: "0101",
      federal_taxation_type: "Tributado",
      description: "Cavalos",
      validity_start_date: new Date("2026-01-01"),
    };
    ncm.findFirst.mockResolvedValueOnce(null);

    await service.create({ ...AUTH, ...body });
    expect(ncm.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ organization_id: ORG, ...body }),
    });

    ncm.findFirst.mockResolvedValueOnce({ id: ID, ncm_code: "0101" });
    await expect(service.delete({ ...AUTH, ncm_id: ID })).resolves.toEqual({
      deleted: { id: ID },
    });
    expect(log.createLog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "Exclusao",
        referring: "fiscal.ncm",
        changes: { id: ID, ncm_code: "0101" },
      }),
    );
    await expect(service.detail(ID, ORG)).rejects.toBeInstanceOf(ServiceError);
  });

  it("busca fiscal consulta NCM/ICMS/IPI na mesma transação e escopo", async () => {
    const prisma = {
      ncm: { findFirst: vi.fn(() => "ncm-query") },
      icms: { findMany: vi.fn(() => "icms-query") },
      ipi: { findMany: vi.fn(() => "ipi-query") },
      $transaction: vi.fn(async () => [{ id: "n" }, [{ id: "i" }], [{ id: "p" }]]),
    };
    const service = new FiscalSearchService(prisma as never);

    await expect(service.searchByNcmCode("01012100", ORG)).resolves.toEqual({
      ncm: { id: "n" },
      icms: [{ id: "i" }],
      ipi: [{ id: "p" }],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(["ncm-query", "icms-query", "ipi-query"]);
    expect(prisma.icms.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, description: { contains: "0101", mode: "insensitive" } },
      }),
    );
    expect(prisma.ipi.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG, ncm: "01012100" } }),
    );
  });
});
