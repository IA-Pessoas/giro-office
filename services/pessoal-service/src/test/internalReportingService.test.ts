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
});
