import { describe, expect, it, vi } from "vitest";

import {
  type TriageUrgentRequestPrisma,
  TriageUrgentRequestService,
} from "../services/triageUrgentRequestService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const RESPONSIBLE_ID = "c0000000-0000-4000-8000-000000000002";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const REQUEST_ID = "d0000000-0000-4000-8000-000000000001";
const COMPETENCE = "2026-09";

const record = {
  id: REQUEST_ID,
  organization_id: ORGANIZATION_ID,
  client_id: CLIENT_ID,
  competence: COMPETENCE,
  requester_id: USER_ID,
  responsible_id: RESPONSIBLE_ID,
  urgency_code: "HIGH",
  description: "Validar documento urgente.",
  status: "OPEN",
  resolution_note: null,
  resolved_at: null,
  created_at: new Date("2026-09-18T00:00:00.000Z"),
  updated_at: new Date("2026-09-18T00:00:00.000Z"),
  requester: { id: USER_ID, name: "Solicitante", full_name: null },
  responsible: { id: RESPONSIBLE_ID, name: "Responsável", full_name: null },
};

function createMockPrisma(): TriageUrgentRequestPrisma {
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: TriageUrgentRequestPrisma) => unknown) =>
      callback(prisma as unknown as TriageUrgentRequestPrisma),
    ),
    $executeRaw: vi.fn().mockResolvedValue(0),
    client: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    triageCompetence: { findFirst: vi.fn() },
    triageUrgentRequest: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  return prisma as unknown as TriageUrgentRequestPrisma;
}

function editor() {
  return {
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    modules: { triagem: 2 },
  };
}

describe("TriageUrgentRequestService", () => {
  it("cria solicitação com solicitante autenticado e responsável da organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: USER_ID } as never)
      .mockResolvedValueOnce({ id: RESPONSIBLE_ID } as never);
    vi.mocked(prisma.triageUrgentRequest.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageUrgentRequest.create).mockResolvedValue(record as never);

    const result = await new TriageUrgentRequestService(prisma).create(
      {
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        urgency_code: "HIGH",
        description: "Validar documento urgente.",
        responsible_id: RESPONSIBLE_ID,
      },
      editor(),
    );

    expect(result).toMatchObject({
      id: REQUEST_ID,
      requester_id: USER_ID,
      status: "OPEN",
      urgency_code: "HIGH",
    });
    expect(prisma.triageUrgentRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: ORGANIZATION_ID,
        requester_id: USER_ID,
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        urgency_code: "HIGH",
        status: "OPEN",
      }),
      select: expect.any(Object),
    });
  });

  it("recusa solicitação urgente em competência arquivada (#1326)", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({
      archived_at: new Date("2026-09-20T00:00:00.000Z"),
    } as never);

    await expect(
      new TriageUrgentRequestService(prisma).create(
        {
          client_id: CLIENT_ID,
          competence: COMPETENCE,
          urgency_code: "HIGH",
          description: "Validar documento urgente.",
          responsible_id: RESPONSIBLE_ID,
        },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.triageUrgentRequest.create).not.toHaveBeenCalled();
  });

  it("repete a mesma solicitação sem criar duplicidade na competência", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: USER_ID } as never)
      .mockResolvedValueOnce({ id: RESPONSIBLE_ID } as never);
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.triageUrgentRequest.findFirst).mockResolvedValue(record as never);

    const result = await new TriageUrgentRequestService(prisma).create(
      {
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        urgency_code: "HIGH",
        description: "Validar documento urgente.",
        responsible_id: RESPONSIBLE_ID,
      },
      editor(),
    );

    expect(result.id).toBe(REQUEST_ID);
    expect(prisma.triageUrgentRequest.create).not.toHaveBeenCalled();
  });

  it("lista solicitações somente da organização, cliente e competência informados", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageUrgentRequest.findMany).mockResolvedValue([record] as never);

    await new TriageUrgentRequestService(prisma).list(
      { clientId: CLIENT_ID, competence: COMPETENCE, status: "OPEN" },
      editor(),
    );

    expect(prisma.triageUrgentRequest.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: ORGANIZATION_ID,
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        status: "OPEN",
      },
      orderBy: [{ urgency_code: "desc" }, { created_at: "desc" }],
      select: expect.any(Object),
    });
  });

  it("não fecha, reabre nem edita urgência de competência arquivada (#1326)", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageUrgentRequest.findFirst).mockResolvedValue(record as never);
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({
      archived_at: new Date("2026-09-20T00:00:00.000Z"),
    } as never);
    const service = new TriageUrgentRequestService(prisma);

    await expect(service.close(REQUEST_ID, "Documento validado.", editor())).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      service.update(REQUEST_ID, { description: "Nova descrição." }, editor()),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.triageUrgentRequest.update).not.toHaveBeenCalled();
  });

  it("fecha somente com nota de resolução e reabre limpando a resolução", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageUrgentRequest.findFirst)
      .mockResolvedValueOnce(record as never)
      .mockResolvedValueOnce({
        ...record,
        status: "CLOSED",
        resolution_note: "Documento validado.",
      } as never);
    vi.mocked(prisma.triageUrgentRequest.update)
      .mockResolvedValueOnce({
        ...record,
        status: "CLOSED",
        resolution_note: "Documento validado.",
      } as never)
      .mockResolvedValueOnce(record as never);

    const service = new TriageUrgentRequestService(prisma);
    await service.close(REQUEST_ID, "Documento validado.", editor());
    await service.reopen(REQUEST_ID, editor());

    expect(prisma.triageUrgentRequest.update).toHaveBeenNthCalledWith(1, {
      where: { id: REQUEST_ID },
      data: expect.objectContaining({ status: "CLOSED", resolution_note: "Documento validado." }),
      select: expect.any(Object),
    });
    expect(prisma.triageUrgentRequest.update).toHaveBeenNthCalledWith(2, {
      where: { id: REQUEST_ID },
      data: { status: "OPEN", resolution_note: null, resolved_at: null },
      select: expect.any(Object),
    });
  });

  it("rejeita responsável fora da organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ id: USER_ID } as never)
      .mockResolvedValueOnce(null);

    await expect(
      new TriageUrgentRequestService(prisma).create(
        {
          client_id: CLIENT_ID,
          competence: COMPETENCE,
          urgency_code: "HIGH",
          description: "Validar documento urgente.",
          responsible_id: RESPONSIBLE_ID,
        },
        editor(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("não usa permissão de outro módulo quando o catálogo modular está presente", async () => {
    const prisma = createMockPrisma();

    await expect(
      new TriageUrgentRequestService(prisma).list(
        { clientId: CLIENT_ID, competence: COMPETENCE },
        {
          userId: USER_ID,
          organizationId: ORGANIZATION_ID,
          permission: 2,
          modules: { contabil: 2 },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
