import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";

describe("pessoal internal reporting service", () => {
  it("filtra por organização, limita a origem e projeta somente campos publicados", async () => {
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

  it("rejeita campo que não foi publicado", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ lddPessoal: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.ldd",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("extrai payroll filtrado por organização e projeta somente os campos publicados", async () => {
    const lddFindMany = vi.fn();
    const payrollFindMany = vi.fn((input: { where: { organization_id: string } }) =>
      Promise.resolve(
        new Map([
          [
            organizationId,
            [
              { id: "hidden-id", advance: true, employees: 12, contact: "sensitive" },
              { id: "hidden-id-2", advance: false, employees: 4, contact: "sensitive" },
            ],
          ],
          [
            "00000000-0000-4000-8000-000000000003",
            [{ id: "other-tenant-id", advance: false, employees: 999, contact: "sensitive" }],
          ],
        ]).get(input.where.organization_id) ?? [],
      ),
    );
    const service = new InternalReportingService({
      lddPessoal: { findMany: lddFindMany },
      payroll: { findMany: payrollFindMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.payroll" as never,
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
    expect(lddFindMany).not.toHaveBeenCalled();
  });

  it("rejeita campo sensível de payroll antes de consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ payroll: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "pessoal.payroll" as never,
        fields: ["contact"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
