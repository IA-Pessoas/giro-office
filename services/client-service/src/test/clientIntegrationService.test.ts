import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { auditUnavailable } from "../integrations/audit.js";
import {
  createIntegrationClient,
  updateIntegrationClient,
} from "../services/clientIntegrationService.js";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440001";
const ORGANIZATION_ID = "550e8400-e29b-41d4-a716-446655440000";

function createPrisma() {
  const findFirst = vi.fn().mockResolvedValue({ id: CLIENT_ID, type: "PJ", cpf_cnpj: "" });
  const update = vi.fn().mockResolvedValue({ id: CLIENT_ID, instagram: "@acme" });
  const create = vi.fn();
  const audit = vi.fn(async () => {});
  const client = { findFirst, update, create };
  const $transaction = vi.fn((run: (tx: unknown) => unknown) => run({ client }));
  return {
    prisma: { client, $transaction } as unknown as PrismaClient,
    findFirst,
    update,
    create,
    audit,
    $transaction,
  };
}

describe("updateIntegrationClient Instagram binding", () => {
  it("allows a Marketing editor to update only the canonical Instagram field", async () => {
    const { prisma, findFirst, update, audit } = createPrisma();

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 0, isOwner: false, marketingLevel: 2 },
        audit,
      ),
    ).resolves.toMatchObject({ id: CLIENT_ID, instagram: "@acme" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ID },
        data: { instagram: "@acme" },
        select: { id: true, name: true, status: true, instagram: true },
      }),
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORGANIZATION_ID },
      select: { id: true, type: true, cpf_cnpj: true, instagram: true },
    });
  });

  it("denies Marketing editors changes to fields beyond Instagram", async () => {
    const { prisma, findFirst, update, audit } = createPrisma();

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme", name: "Outro nome" },
        { userId: "user-1", level: 0, isOwner: false, marketingLevel: 2 },
        audit,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(update).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("denies Marketing viewers Instagram edits", async () => {
    const { prisma, findFirst, update, audit } = createPrisma();

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 0, isOwner: false, marketingLevel: 1 },
        audit,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(update).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("updates the profile on the canonical client and requires Office edit permission", async () => {
    const { prisma, findFirst, update, audit } = createPrisma();

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 2, isOwner: false },
        audit,
      ),
    ).resolves.toMatchObject({ id: CLIENT_ID, instagram: "@acme" });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORGANIZATION_ID },
      select: { id: true, type: true, cpf_cnpj: true, instagram: true },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CLIENT_ID }, data: { instagram: "@acme" } }),
    );
  });

  it("does not edit a client when the Office permission is below editor", async () => {
    const { prisma, findFirst, update, audit } = createPrisma();

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 1, isOwner: false },
        audit,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(findFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("does not edit a client outside the authenticated organization", async () => {
    const { prisma, findFirst, update, audit } = createPrisma();
    findFirst.mockResolvedValue(null);

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 2, isOwner: false },
        audit,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(update).not.toHaveBeenCalled();
  });
  it("records actor, organization, client and previous profile of a Marketing Instagram edit", async () => {
    const { prisma, findFirst, audit } = createPrisma();
    findFirst.mockResolvedValue({ id: CLIENT_ID, type: "PJ", cpf_cnpj: "", instagram: "@antigo" });

    await updateIntegrationClient(
      prisma,
      CLIENT_ID,
      ORGANIZATION_ID,
      { instagram: "@acme" },
      { userId: "user-1", level: 0, isOwner: false, marketingLevel: 2 },
      audit,
    );

    expect(audit).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: "user-1",
      action: "update",
      referring: "clients",
      referringId: CLIENT_ID,
      changes: { instagram: { from: "@antigo", to: "@acme" } },
    });
  });

  it("leaves no trail for denied or cross-organization Instagram edits", async () => {
    const denied = createPrisma();
    await expect(
      updateIntegrationClient(
        denied.prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 0, isOwner: false, marketingLevel: 1 },
        denied.audit,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(denied.audit).not.toHaveBeenCalled();

    const foreign = createPrisma();
    foreign.findFirst.mockResolvedValue(null);
    await expect(
      updateIntegrationClient(
        foreign.prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 0, isOwner: false, marketingLevel: 2 },
        foreign.audit,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(foreign.audit).not.toHaveBeenCalled();
  });

  it("does not report success for an Instagram edit whose trail cannot be written", async () => {
    const { prisma, audit, $transaction } = createPrisma();
    audit.mockRejectedValueOnce(auditUnavailable());

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 0, isOwner: false, marketingLevel: 2 },
        audit,
      ),
    ).rejects.toMatchObject({ statusCode: 503, expose: true });
    expect($transaction).toHaveBeenCalledTimes(1);

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 0, isOwner: false, marketingLevel: 2 },
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe("integration tax regime persistence", () => {
  it("persists and returns the tax regime on client creation", async () => {
    const { prisma, findFirst, create } = createPrisma();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({
      id: CLIENT_ID,
      name: "Acme",
      cpf_cnpj: "12345678000195",
      regime: "Simples Nacional",
    });

    await expect(
      createIntegrationClient(
        prisma,
        {
          organization_id: ORGANIZATION_ID,
          type: "PJ",
          name: "Acme",
          cpf_cnpj: "12345678000195",
          type_registration: "Novo",
          service_unique: false,
          regime: "Simples Nacional",
        },
        { userId: "user-1", level: 2, isOwner: false },
      ),
    ).resolves.toMatchObject({ regime: "Simples Nacional" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ regime: "Simples Nacional" }),
        select: expect.objectContaining({ regime: true }),
      }),
    );
  });

  it("keeps the existing permission rule for setting tax regime", async () => {
    const { prisma, findFirst, create } = createPrisma();
    findFirst.mockResolvedValue(null);

    await expect(
      createIntegrationClient(
        prisma,
        {
          organization_id: ORGANIZATION_ID,
          type: "PJ",
          name: "Acme",
          cpf_cnpj: "12345678000195",
          type_registration: "Novo",
          service_unique: false,
          regime: "Simples Nacional",
        },
        { userId: "user-1", level: 1, isOwner: false },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(create).not.toHaveBeenCalled();
  });

  it("persists and returns the tax regime on client update", async () => {
    const { prisma, update, audit } = createPrisma();
    update.mockResolvedValue({ id: CLIENT_ID, regime: "Lucro Real" });

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { regime: "Lucro Real" },
        { userId: "user-1", level: 2, isOwner: false },
        audit,
      ),
    ).resolves.toMatchObject({ regime: "Lucro Real" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { regime: "Lucro Real" },
        select: expect.objectContaining({ regime: true }),
      }),
    );
  });
});

describe("integration address persistence", () => {
  it("persists and returns all address fields on integration client update", async () => {
    const { prisma, update } = createPrisma();
    const address = {
      address: "Rua B, 20",
      cep: "02002-000",
      neighborhood: "Bairro",
      state: "RJ",
      city: "Rio de Janeiro",
    };
    update.mockResolvedValue({ id: CLIENT_ID, ...address });

    await expect(
      updateIntegrationClient(prisma, CLIENT_ID, ORGANIZATION_ID, address, {
        userId: "user-1",
        level: 2,
        isOwner: false,
      }),
    ).resolves.toMatchObject({ id: CLIENT_ID, ...address });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ID },
        data: address,
        select: expect.objectContaining({
          address: true,
          cep: true,
          neighborhood: true,
          state: true,
          city: true,
        }),
      }),
    );
  });

  it("persists the optional address without changing contact or identity fields", async () => {
    const { prisma, findFirst, create } = createPrisma();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({
      id: CLIENT_ID,
      name: "Acme",
      cpf_cnpj: "12345678000195",
      regime: "Simples Nacional",
      address: "Rua A, 10",
      cep: "01001-000",
      neighborhood: "Centro",
      state: "SP",
      city: "São Paulo",
      number: "11999999999",
      email: "contato@acme.com",
    });

    const contact = {
      cpf_cnpj: "12.345.678/0001-95",
      number: "11999999999",
      email: "contato@acme.com",
      address: "Rua A, 10",
      cep: "01001-000",
      neighborhood: "Centro",
      state: "SP",
      city: "São Paulo",
    };
    await createIntegrationClient(
      prisma,
      {
        organization_id: ORGANIZATION_ID,
        type: "PJ",
        name: "Acme",
        type_registration: "Novo",
        service_unique: false,
        ...contact,
      },
      { userId: "user-1", level: 2, isOwner: false },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpf_cnpj: "12345678000195",
          number: contact.number,
          email: contact.email,
          address: contact.address,
          cep: contact.cep,
          neighborhood: contact.neighborhood,
          state: contact.state,
          city: contact.city,
        }),
        select: expect.objectContaining({ id: true, cpf_cnpj: true }),
      }),
    );
  });
});
