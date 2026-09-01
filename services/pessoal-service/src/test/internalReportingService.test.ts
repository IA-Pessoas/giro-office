import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";

describe("pessoal internal reporting service", () => {
  it("filtra LDD por organização, limita a origem e projeta somente campos publicados", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { type: "FGTS", id: "hidden-id", status: "Regular" },
      { type: "INSS", id: "hidden-id-2", status: "Pendente" },
    ]);
    const service = new InternalReportingService({ lddPessoal: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.ldd",
        fields: ["type", "status"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ type: "FGTS", status: "Regular" }],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { type: true, status: true },
      take: 2,
    });
  });

  it("rejeita campo LDD que não foi publicado", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ lddPessoal: { findMany } } as never);

    await expect(
      service.extract({ organizationId, source: "pessoal.ldd", fields: ["id"], limit: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai payroll filtrado por organização e projeta somente os campos publicados", async () => {
    const payrollFindMany = vi.fn().mockResolvedValue([
      { id: "hidden-id", advance: true, employees: 12, contact: "sensitive" },
      { id: "hidden-id-2", advance: false, employees: 4, contact: "sensitive" },
    ]);
    const service = new InternalReportingService({
      payroll: { findMany: payrollFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.payroll",
        fields: ["advance", "employees"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ advance: true, employees: 12 }],
      reachedLimit: true,
    });

    expect(payrollFindMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { advance: true, employees: true },
      take: 2,
    });
  });

  it("rejeita campo sensível de payroll antes de consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ payroll: { findMany } } as never);

    await expect(
      service.extract({ organizationId, source: "pessoal.payroll", fields: ["contact"], limit: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai sindicatos somente do tenant assinado, sem IDs e com limite da origem", async () => {
    const unionFindMany = vi.fn().mockResolvedValue([
      { id: "hidden-id", name: "Sindicato A", base_date: new Date("2026-05-01") },
      { id: "hidden-id-2", name: "Sindicato B", base_date: null },
    ]);
    const service = new InternalReportingService({
      unionPessoal: { findMany: unionFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.unions",
        fields: ["name", "base_date"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ name: "Sindicato A", base_date: new Date("2026-05-01") }],
      reachedLimit: true,
    });

    expect(unionFindMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, base_date: true },
      take: 2,
    });
  });

  it("recusa ID e CNPJ de sindicato antes de consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ unionPessoal: { findMany } } as never);

    await expect(
      service.extract({ organizationId, source: "pessoal.unions", fields: ["cnpj"], limit: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai obrigações pelo tenant assinado e retorna reachedLimit da origem", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { competence: "2026-08", advance: false, payroll: true, id: "hidden-id" },
      { competence: "2026-09", advance: true, payroll: false, id: "hidden-id-2" },
    ]);
    const service = new InternalReportingService({ obrigationsPessoal: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.obligations",
        fields: ["competence", "advance", "payroll"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ competence: "2026-08", advance: false, payroll: true }],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { competence: true, advance: true, payroll: true },
      take: 2,
    });
  });

  it("recusa campo não publicado nas obrigações antes de consultar o tenant", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ obrigationsPessoal: { findMany } } as never);

    await expect(
      service.extract({ organizationId, source: "pessoal.obligations", fields: ["id"], limit: 1 }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai situations filtradas por organização e mantém registrador e concluidor fora da projeção", async () => {
    const situationsFindMany = vi.fn().mockResolvedValue([
      {
        status: "Finalizado",
        title: "Folha",
        registration_date: new Date("2026-06-01T12:00:00.000Z"),
        completion_date: new Date("2026-06-30T12:00:00.000Z"),
        id: "hidden-id",
        registered_by_id: "hidden-registrador",
        completed_by_id: "hidden-concluidor",
        organization_id: organizationId,
      },
      {
        status: "Em andamento",
        title: "Férias",
        registration_date: new Date("2026-06-02T12:00:00.000Z"),
        completion_date: null,
        id: "hidden-id-2",
        registered_by_id: "hidden-registrador-2",
        completed_by_id: null,
        organization_id: organizationId,
      },
    ]);
    const service = new InternalReportingService({
      situationsPessoal: { findMany: situationsFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.situations" as never,
        fields: ["status", "title", "registration_date", "completion_date"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          status: "Finalizado",
          title: "Folha",
          registration_date: new Date("2026-06-01T12:00:00.000Z"),
          completion_date: new Date("2026-06-30T12:00:00.000Z"),
        },
      ],
      reachedLimit: true,
    });

    expect(situationsFindMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: {
        status: true,
        title: true,
        registration_date: true,
        completion_date: true,
      },
      take: 2,
    });
  });

  it("rejeita chaves internas de situations antes de consultar o banco", async () => {
    const situationsFindMany = vi.fn();
    const service = new InternalReportingService({
      situationsPessoal: { findMany: situationsFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.situations" as never,
        fields: ["registered_by_id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(situationsFindMany).not.toHaveBeenCalled();
  });
});
