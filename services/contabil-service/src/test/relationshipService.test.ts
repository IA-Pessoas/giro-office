import "./envBootstrap.js";

import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import {
  RelationshipService,
  type RelationshipServicePrisma,
} from "../services/relationshipService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const RELATIONSHIP_ID = "e0000000-0000-4000-8000-000000000001";

const createPayload = {
  client_id: CLIENT_ID,
  bidding: false,
  chart_accounts: "plan",
  tool: "excel",
  system: "local",
  note: "n/a",
};

const baseRow = {
  id: RELATIONSHIP_ID,
  client_id: CLIENT_ID,
  organization_id: ORG_ID,
  bidding: false,
  chart_accounts: "plan",
  tool: "excel",
  system: "local",
  note: "n/a",
};

function createMockPrisma(): RelationshipServicePrisma {
  return {
    relationshipContabil: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as RelationshipServicePrisma;
}

describe("RelationshipService", () => {
  it("create lança 409 quando já existe para o cliente na organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockResolvedValue(baseRow);
    const service = new RelationshipService(prisma, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    await expect(
      service.create(createPayload, { userId: USER_ID, organizationId: ORG_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.relationshipContabil.create).not.toHaveBeenCalled();
  });

  it("create persiste com organization_id e audita", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.relationshipContabil.create).mockResolvedValue(baseRow);
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    const service = new RelationshipService(prisma, audit);

    const result = await service.create(createPayload, {
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 1,
    });

    expect(result).toEqual(baseRow);
    expect(prisma.relationshipContabil.create).toHaveBeenCalledWith({
      data: {
        client_id: CLIENT_ID,
        organization_id: ORG_ID,
        bidding: false,
        chart_accounts: "plan",
        tool: "excel",
        system: "local",
        note: "n/a",
      },
    });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        permission: 1,
        referring: "contabil.relationship",
        referringId: RELATIONSHIP_ID,
      }),
    );
  });

  it("update lança 404 quando não existe na organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockResolvedValue(null);
    const service = new RelationshipService(prisma, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    await expect(
      service.update(RELATIONSHIP_ID, { note: "x" }, { userId: USER_ID, organizationId: ORG_ID }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("update aplica apenas campos enviados e audita", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockResolvedValue(baseRow);
    const updated = { ...baseRow, bidding: true };
    vi.mocked(prisma.relationshipContabil.update).mockResolvedValue(updated);
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    const service = new RelationshipService(prisma, audit);

    const result = await service.update(
      RELATIONSHIP_ID,
      { bidding: true },
      { userId: USER_ID, organizationId: ORG_ID, permission: 2 },
    );

    expect(result.bidding).toBe(true);
    expect(prisma.relationshipContabil.update).toHaveBeenCalledWith({
      where: { id: RELATIONSHIP_ID },
      data: { bidding: true },
    });
    expect(audit.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        referring: "contabil.relationship",
        referringId: RELATIONSHIP_ID,
      }),
    );
  });

  it("getByClientId retorna null quando não encontra (#1325)", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockResolvedValue(null);
    const service = new RelationshipService(prisma, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    await expect(service.getByClientId(CLIENT_ID, ORG_ID)).resolves.toBeNull();
  });

  it("getByClientId retorna registro", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockResolvedValue(baseRow);
    const service = new RelationshipService(prisma, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    const row = await service.getByClientId(CLIENT_ID, ORG_ID);
    expect(row).toEqual(baseRow);
    expect(prisma.relationshipContabil.findFirst).toHaveBeenCalledWith({
      where: { client_id: CLIENT_ID, organization_id: ORG_ID },
    });
  });

  it("delete lança 404 quando não existe na organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockResolvedValue(null);
    const service = new RelationshipService(prisma, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    await expect(service.delete(RELATIONSHIP_ID, ORG_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.relationshipContabil.delete).not.toHaveBeenCalled();
  });

  it("delete remove quando existe", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockResolvedValue(baseRow);
    vi.mocked(prisma.relationshipContabil.delete).mockResolvedValue(baseRow);
    const service = new RelationshipService(prisma, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    const result = await service.delete(RELATIONSHIP_ID, ORG_ID);

    expect(result.message).toContain("sucesso");
    expect(prisma.relationshipContabil.delete).toHaveBeenCalledWith({
      where: { id: RELATIONSHIP_ID },
    });
  });

  it("create propaga ServiceError sem embrulhar em 500", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.relationshipContabil.findFirst).mockRejectedValue(
      new ServiceError(400, "Falha."),
    );
    const service = new RelationshipService(prisma, {
      createLog: vi.fn(),
      logUpdateIfChanged: vi.fn(),
    });

    await expect(
      service.create(createPayload, { userId: USER_ID, organizationId: ORG_ID }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
