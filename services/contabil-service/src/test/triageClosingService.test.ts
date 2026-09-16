import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TriageClosingService } from "../services/triageClosingService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const COMPETENCE = "2026-09";

function createPrisma() {
  return {
    triageClosing: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe("TriageClosingService", () => {
  it("representa ausência como NOT_RECEIVED sem persistir", async () => {
    const prisma = createPrisma();
    vi.mocked(prisma.triageClosing.findFirst).mockResolvedValue(null);
    const service = new TriageClosingService(prisma as never, {
      logUpdateIfChanged: vi.fn(),
    });

    await expect(
      service.get({ client_id: CLIENT_ID, competence: COMPETENCE }, ORGANIZATION_ID),
    ).resolves.toEqual({
      client_id: CLIENT_ID,
      competence: COMPETENCE,
      status: "NOT_RECEIVED",
      archived_at: null,
    });
    expect(prisma.triageClosing.upsert).not.toHaveBeenCalled();
    expect(prisma.triageClosing.update).not.toHaveBeenCalled();
  });

  it("atualiza somente o fechamento da organização e registra antes e depois", async () => {
    const prisma = createPrisma();
    const previous = {
      id: "d0000000-0000-4000-8000-000000000001",
      client_id: CLIENT_ID,
      competence: COMPETENCE,
      organization_id: ORGANIZATION_ID,
      status: "RECEIVED",
      archived_at: null,
    };
    const updated = { ...previous, status: "UNDER_REVIEW" };
    vi.mocked(prisma.triageClosing.findFirst).mockResolvedValue(previous);
    vi.mocked(prisma.triageClosing.upsert).mockResolvedValue(updated);
    const audit = { logUpdateIfChanged: vi.fn() };
    const service = new TriageClosingService(prisma as never, audit);

    await expect(
      service.update(
        { client_id: CLIENT_ID, competence: COMPETENCE, status: "UNDER_REVIEW" },
        { userId: "user", organizationId: ORGANIZATION_ID, modules: { contabil: 2 } },
      ),
    ).resolves.toEqual(updated);
    expect(prisma.triageClosing.upsert).toHaveBeenCalledWith({
      where: {
        organization_id_client_id_competence: {
          organization_id: ORGANIZATION_ID,
          client_id: CLIENT_ID,
          competence: COMPETENCE,
        },
      },
      create: expect.objectContaining({ status: "UNDER_REVIEW" }),
      update: { status: "UNDER_REVIEW", archived_at: null },
    });
    expect(audit.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({ oldData: previous, updatedData: updated }),
    );
  });

  it("rejeita mutação de viewer antes de consultar ou gravar", async () => {
    const prisma = createPrisma();
    const service = new TriageClosingService(prisma as never, {
      logUpdateIfChanged: vi.fn(),
    });

    await expect(
      service.update(
        { client_id: CLIENT_ID, competence: COMPETENCE, status: "RECEIVED" },
        { userId: "viewer", organizationId: ORGANIZATION_ID, modules: { contabil: 1 } },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.triageClosing.findFirst).not.toHaveBeenCalled();
    expect(prisma.triageClosing.upsert).not.toHaveBeenCalled();
  });
});
