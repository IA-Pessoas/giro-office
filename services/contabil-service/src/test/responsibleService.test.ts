import "./envBootstrap.js";

import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import {
  ResponsibleService,
  type ResponsibleServicePrisma,
} from "../services/responsibleService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const RESPONSIBLE_ID = "e0000000-0000-4000-8000-000000000001";
const PERSON_ID = "f0000000-0000-4000-8000-000000000001";
const POSTED_BY_ID = "10000000-0000-4000-8000-000000000001";

const baseRow = {
  id: RESPONSIBLE_ID,
  client_id: CLIENT_ID,
  organization_id: ORG_ID,
  person_responsible_id: null as string | null,
  posted_by_id: null as string | null,
  customer_with_movement: false,
};

function createMockPrisma(): ResponsibleServicePrisma {
  return {
    responsibleContabil: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as ResponsibleServicePrisma;
}

describe("ResponsibleService", () => {
  it("create lança 409 quando já existe para o cliente na organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockResolvedValue(baseRow);
    const service = new ResponsibleService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(
      service.create({ client_id: CLIENT_ID }, { userId: USER_ID, organizationId: ORG_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.responsibleContabil.create).not.toHaveBeenCalled();
  });

  it("create persiste com organization_id e audita", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.responsibleContabil.create).mockResolvedValue(baseRow);
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    const service = new ResponsibleService(prisma, audit);

    const result = await service.create(
      {
        client_id: CLIENT_ID,
        person_responsible_id: PERSON_ID,
        posted_by_id: POSTED_BY_ID,
        customer_with_movement: true,
      },
      { userId: USER_ID, organizationId: ORG_ID, permission: 1 },
    );

    expect(result).toEqual(baseRow);
    expect(prisma.responsibleContabil.create).toHaveBeenCalledWith({
      data: {
        client_id: CLIENT_ID,
        organization_id: ORG_ID,
        person_responsible_id: PERSON_ID,
        posted_by_id: POSTED_BY_ID,
        customer_with_movement: true,
      },
    });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        permission: 1,
        referring: "contabil.responsibles",
        referringId: RESPONSIBLE_ID,
      }),
    );
  });

  it("update lança 404 quando não existe na organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockResolvedValue(null);
    const service = new ResponsibleService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(
      service.update(
        RESPONSIBLE_ID,
        { customer_with_movement: true },
        { userId: USER_ID, organizationId: ORG_ID },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("update aplica apenas campos enviados e audita", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockResolvedValue(baseRow);
    const updated = { ...baseRow, customer_with_movement: true };
    vi.mocked(prisma.responsibleContabil.update).mockResolvedValue(updated);
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    const service = new ResponsibleService(prisma, audit);

    const result = await service.update(
      RESPONSIBLE_ID,
      { customer_with_movement: true },
      { userId: USER_ID, organizationId: ORG_ID, permission: 2 },
    );

    expect(result.customer_with_movement).toBe(true);
    expect(prisma.responsibleContabil.update).toHaveBeenCalledWith({
      where: { id: RESPONSIBLE_ID },
      data: { customer_with_movement: true },
    });
    expect(audit.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        referring: "contabil.responsibles",
        referringId: RESPONSIBLE_ID,
      }),
    );
  });

  it("getByClientId lança 404 quando não encontra", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockResolvedValue(null);
    const service = new ResponsibleService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(service.getByClientId(CLIENT_ID, ORG_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("getByClientId retorna registro", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockResolvedValue(baseRow);
    const service = new ResponsibleService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    const row = await service.getByClientId(CLIENT_ID, ORG_ID);
    expect(row).toEqual(baseRow);
    expect(prisma.responsibleContabil.findFirst).toHaveBeenCalledWith({
      where: { client_id: CLIENT_ID, organization_id: ORG_ID },
    });
  });

  it("delete lança 404 quando não existe na organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockResolvedValue(null);
    const service = new ResponsibleService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(service.delete(RESPONSIBLE_ID, ORG_ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.responsibleContabil.delete).not.toHaveBeenCalled();
  });

  it("delete remove quando existe", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockResolvedValue(baseRow);
    vi.mocked(prisma.responsibleContabil.delete).mockResolvedValue(baseRow);
    const service = new ResponsibleService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    const result = await service.delete(RESPONSIBLE_ID, ORG_ID);

    expect(result.message).toContain("sucesso");
    expect(prisma.responsibleContabil.delete).toHaveBeenCalledWith({ where: { id: RESPONSIBLE_ID } });
  });

  it("create propaga ServiceError sem embrulhar em 500", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.responsibleContabil.findFirst).mockRejectedValue(new ServiceError(400, "Falha."));
    const service = new ResponsibleService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(
      service.create({ client_id: CLIENT_ID }, { userId: USER_ID, organizationId: ORG_ID }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
