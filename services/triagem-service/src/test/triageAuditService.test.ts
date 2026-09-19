import { describe, expect, it, vi } from "vitest";

import { type TriageAuditPrisma, TriageAuditService } from "../services/triageAuditService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000002";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const COMPETENCE_ID = "d0000000-0000-4000-8000-000000000001";

function editor(organizationId = ORGANIZATION_ID) {
  return {
    userId: USER_ID,
    organizationId,
    permission: 2,
    modules: { triagem: 2 },
  };
}

function createMockPrisma(): TriageAuditPrisma {
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (callback: (transaction: TriageAuditPrisma) => unknown) =>
      callback(prisma as unknown as TriageAuditPrisma),
    ),
    triageCompetence: { findFirst: vi.fn() },
    triageCompetenceHistory: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    triageOutboxEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  };

  return prisma as unknown as TriageAuditPrisma;
}

describe("TriageAuditService", () => {
  it("lista timeline paginada com ator, competência e contexto", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({ id: COMPETENCE_ID } as never);
    vi.mocked(prisma.triageCompetenceHistory.count).mockResolvedValue(3);
    vi.mocked(prisma.triageCompetenceHistory.findMany).mockResolvedValue([
      {
        id: "history-1",
        action: "archived",
        actor_user_id: USER_ID,
        before_data: { archived_at: null },
        after_data: { archived_at: "2026-09-18T12:00:00.000Z" },
        created_at: new Date("2026-09-18T12:00:00.000Z"),
        competence: { competence: "2026-09" },
        actor: { id: USER_ID, name: "Ana", full_name: "Ana Auditora" },
      },
    ] as never);

    const result = await new TriageAuditService(prisma).listTimeline(
      { competenceId: COMPETENCE_ID, page: 2, pageSize: 1 },
      editor(),
    );

    expect(result).toEqual({
      items: [
        {
          id: "history-1",
          action: "archived",
          actor: { id: USER_ID, name: "Ana", full_name: "Ana Auditora" },
          competence: "2026-09",
          occurred_at: "2026-09-18T12:00:00.000Z",
          context: {
            before: { archived_at: null },
            after: { archived_at: "2026-09-18T12:00:00.000Z" },
          },
        },
      ],
      total: 3,
      page: 2,
      page_size: 1,
    });
    expect(prisma.triageCompetenceHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORGANIZATION_ID, competence_id: COMPETENCE_ID },
        skip: 1,
        take: 1,
      }),
    );
  });

  it("não revela timeline de competência de outra organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue(null);

    await expect(
      new TriageAuditService(prisma).listTimeline(
        { competenceId: COMPETENCE_ID, page: 1, pageSize: 20 },
        editor(OTHER_ORGANIZATION_ID),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.triageCompetenceHistory.findMany).not.toHaveBeenCalled();
  });

  it("reconcilia fatos sem outbox sem reescrever e é idempotente", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.$executeRaw)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const service = new TriageAuditService(prisma);

    await expect(service.reconcile(editor())).resolves.toEqual({
      reconciled: 2,
      dispatched: 0,
      pending: 0,
    });
    await expect(service.reconcile(editor())).resolves.toEqual({
      reconciled: 0,
      dispatched: 0,
      pending: 0,
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(6);
    const insertCall = vi.mocked(prisma.$executeRaw).mock.calls[2]?.[0];
    expect(String(insertCall)).toContain("ON CONFLICT");
    expect(String(insertCall)).toContain("competence_history");
  });

  it("despacha eventos pendentes e marca a confirmação sem apagar o fato", async () => {
    const prisma = createMockPrisma();
    const event = {
      id: "event-1",
      event_key: "competence:event-1:created",
      aggregate_type: "triage_competence",
      aggregate_id: COMPETENCE_ID,
      organization_id: ORGANIZATION_ID,
      event_type: "triage.competence.created",
      payload: { actor_user_id: USER_ID, before: null, after: { id: COMPETENCE_ID } },
      occurred_at: new Date("2026-09-18T12:00:00.000Z"),
    };
    vi.mocked(prisma.triageOutboxEvent.findMany).mockResolvedValue([event] as never);
    vi.mocked(prisma.triageOutboxEvent.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.triageOutboxEvent.count).mockResolvedValue(0);
    const dispatchEvent = vi.fn().mockResolvedValue(undefined);

    await expect(
      new TriageAuditService(prisma, dispatchEvent).reconcile(editor()),
    ).resolves.toEqual({ reconciled: 0, dispatched: 1, pending: 0 });
    expect(dispatchEvent).toHaveBeenCalledWith(event);
    expect(prisma.triageOutboxEvent.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.triageOutboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { dispatched_at: expect.any(Date) } }),
    );
  });

  it("mantém o evento pendente e registra a falha do despacho para nova tentativa", async () => {
    const prisma = createMockPrisma();
    const event = {
      id: "event-2",
      event_key: "competence:event-2:created",
      aggregate_type: "triage_competence",
      aggregate_id: COMPETENCE_ID,
      organization_id: ORGANIZATION_ID,
      event_type: "triage.competence.created",
      payload: { actor_user_id: USER_ID },
      occurred_at: new Date("2026-09-18T12:00:00.000Z"),
    };
    vi.mocked(prisma.triageOutboxEvent.findMany).mockResolvedValue([event] as never);
    vi.mocked(prisma.triageOutboxEvent.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.triageOutboxEvent.count).mockResolvedValue(1);
    const dispatchEvent = vi.fn().mockRejectedValue(new Error("audit indisponível"));

    await expect(
      new TriageAuditService(prisma, dispatchEvent).reconcile(editor()),
    ).resolves.toEqual({ reconciled: 0, dispatched: 0, pending: 1 });
    expect(prisma.triageOutboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it("propaga falha de reconciliação para manter a transação abortada", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.$executeRaw).mockRejectedValueOnce(new Error("database unavailable"));

    await expect(new TriageAuditService(prisma).reconcile(editor())).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
