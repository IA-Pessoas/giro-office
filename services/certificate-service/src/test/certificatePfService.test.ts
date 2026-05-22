import "./envBootstrap.js";

import type { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { CertificatePfService } from "../services/certificatePfService.js";
import { certificateOrganizationId } from "./testUtils.js";

const certificateId = "30000000-0000-4000-8000-000000000001";

function createCertificatePfRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: certificateId,
    client_castelo_status: true,
    client_focus_status: false,
    name: "Joao Silva",
    cpf: "12345678901",
    model: "A1",
    password: "secret-password",
    expiration_date: new Date("2026-12-31T00:00:00.000Z"),
    notes: "Renovar com antecedencia",
    enterprise: "Empresa Castelo",
    cnpj: "11222333000144",
    was_paid: true,
    payment_date: new Date("2026-01-10T00:00:00.000Z"),
    payment_amount: 250,
    contact_info: "certificados@example.com",
    file_path: "/certificates/pf/joao.pfx",
    has_certificate: true,
    organization_id: certificateOrganizationId,
    ...overrides,
  };
}

describe("CertificatePfService", () => {
  it("listCertificatePf filters by organization_id and never selects password", async () => {
    const prisma = {
      certificatePF: {
        findMany: vi.fn(async () => [createCertificatePfRecord()]),
      },
    };
    const service = new CertificatePfService(prisma as never);

    const result = await service.listCertificatePf({
      organizationId: certificateOrganizationId,
      query: { search: "Joao", has_certificate: true },
    });

    expect(prisma.certificatePF.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: certificateOrganizationId,
        OR: [
          { name: { contains: "Joao", mode: "insensitive" } },
          { cpf: { contains: "Joao" } },
          { enterprise: { contains: "Joao", mode: "insensitive" } },
          { cnpj: { contains: "Joao" } },
        ],
        has_certificate: true,
      },
      orderBy: [{ expiration_date: "asc" }, { name: "asc" }],
      select: expect.not.objectContaining({ password: true }),
    });
    expect(result[0]).not.toHaveProperty("password");
  });

  it("getCertificatePf returns password when canViewPassword is true", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord()),
      },
    };
    const service = new CertificatePfService(prisma as never);

    const result = await service.getCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: true,
    });

    expect(result.password).toBe("secret-password");
  });

  it("getCertificatePf removes password when canViewPassword is false", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord()),
      },
    };
    const service = new CertificatePfService(prisma as never);

    const result = await service.getCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: false,
    });

    expect(result).not.toHaveProperty("password");
  });

  it("createCertificatePf blocks duplicates by organization_id, name, cpf and model", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => ({ id: certificateId })),
        create: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.createCertificatePf({
        organizationId: certificateOrganizationId,
        data: {
          client_castelo_status: true,
          client_focus_status: false,
          name: "Joao Silva",
          cpf: "12345678901",
          model: "A1",
          password: "secret-password",
          expiration_date: new Date("2026-12-31T00:00:00.000Z"),
          was_paid: true,
          has_certificate: true,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePF.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: certificateOrganizationId,
        name: "Joao Silva",
        cpf: "12345678901",
        model: "A1",
      },
    });
    expect(prisma.certificatePF.create).not.toHaveBeenCalled();
  });

  it("updateCertificatePf returns 404 when record does not exist in organization", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.updateCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        data: { notes: "Atualizado" },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePF.findFirst).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
    expect(prisma.certificatePF.update).not.toHaveBeenCalled();
  });

  it("updateCertificatePf blocks duplicates when name, cpf or model change", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(createCertificatePfRecord())
          .mockResolvedValueOnce(createCertificatePfRecord({ id: "duplicate-id" })),
        update: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.updateCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        data: { model: "A3" },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePF.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        organization_id: certificateOrganizationId,
        name: "Joao Silva",
        cpf: "12345678901",
        model: "A3",
        NOT: { id: certificateId },
      },
    });
    expect(prisma.certificatePF.update).not.toHaveBeenCalled();
  });
});
