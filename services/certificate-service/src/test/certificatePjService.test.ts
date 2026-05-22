import "./envBootstrap.js";

import type { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { CertificatePjService } from "../services/certificatePjService.js";
import { certificateOrganizationId } from "./testUtils.js";

const certificateId = "20000000-0000-4000-8000-000000000001";

function createCertificatePjRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: certificateId,
    client_castelo_status: true,
    client_focus_status: false,
    name: "Empresa Castelo",
    cnpj: "11222333000144",
    responsible: "Maria Silva",
    model: "A1",
    legal_nature: "LTDA",
    password: "secret-password",
    expiration_date: new Date("2026-12-31T00:00:00.000Z"),
    notes: "Renovar com antecedencia",
    was_paid: true,
    payment_date: new Date("2026-01-10T00:00:00.000Z"),
    payment_amount: 250,
    contact_info: "certificados@example.com",
    file_path: "/certificates/pj/empresa.pfx",
    has_certificate: true,
    organization_id: certificateOrganizationId,
    ...overrides,
  };
}

describe("CertificatePjService", () => {
  it("listCertificatePj filters by organization_id and never selects password", async () => {
    const prisma = {
      certificatePJ: {
        findMany: vi.fn(async () => [createCertificatePjRecord()]),
      },
    };
    const service = new CertificatePjService(prisma as never);

    const result = await service.listCertificatePj({
      organizationId: certificateOrganizationId,
      query: { has_certificate: true },
    });

    expect(prisma.certificatePJ.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: certificateOrganizationId,
        has_certificate: true,
      },
      orderBy: [{ expiration_date: "asc" }, { name: "asc" }],
      select: expect.not.objectContaining({ password: true }),
    });
    expect(result[0]).not.toHaveProperty("password");
  });

  it("getCertificatePj returns password when canViewPassword is true", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => createCertificatePjRecord()),
      },
    };
    const service = new CertificatePjService(prisma as never);

    const result = await service.getCertificatePj({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: true,
    });

    expect(result.password).toBe("secret-password");
  });

  it("getCertificatePj removes password when canViewPassword is false", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => createCertificatePjRecord()),
      },
    };
    const service = new CertificatePjService(prisma as never);

    const result = await service.getCertificatePj({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: false,
    });

    expect(result).not.toHaveProperty("password");
  });

  it("createCertificatePj blocks duplicates by organization_id, name, cnpj and model", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => ({ id: certificateId })),
        create: vi.fn(),
      },
    };
    const service = new CertificatePjService(prisma as never);

    await expect(
      service.createCertificatePj({
        organizationId: certificateOrganizationId,
        data: {
          client_castelo_status: true,
          client_focus_status: false,
          name: "Empresa Castelo",
          cnpj: "11222333000144",
          responsible: "Maria Silva",
          model: "A1",
          legal_nature: "LTDA",
          password: "secret-password",
          expiration_date: new Date("2026-12-31T00:00:00.000Z"),
          was_paid: true,
          has_certificate: true,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePJ.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: certificateOrganizationId,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        model: "A1",
      },
    });
    expect(prisma.certificatePJ.create).not.toHaveBeenCalled();
  });

  it("updateCertificatePj returns 404 when record does not exist in organization", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    };
    const service = new CertificatePjService(prisma as never);

    await expect(
      service.updateCertificatePj({
        id: certificateId,
        organizationId: certificateOrganizationId,
        data: { notes: "Atualizado" },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePJ.findFirst).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
    expect(prisma.certificatePJ.update).not.toHaveBeenCalled();
  });

  it("updateCertificatePj blocks duplicates when name, cnpj or model change", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(createCertificatePjRecord())
          .mockResolvedValueOnce(createCertificatePjRecord({ id: "duplicate-id" })),
        update: vi.fn(),
      },
    };
    const service = new CertificatePjService(prisma as never);

    await expect(
      service.updateCertificatePj({
        id: certificateId,
        organizationId: certificateOrganizationId,
        data: { model: "A3" },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePJ.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        organization_id: certificateOrganizationId,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        model: "A3",
        NOT: { id: certificateId },
      },
    });
    expect(prisma.certificatePJ.update).not.toHaveBeenCalled();
  });
});
