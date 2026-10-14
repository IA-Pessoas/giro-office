import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { EmployeeMeetingMinuteService } from "../services/employeeMeetingMinuteService.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000002";
const targetId = "00000000-0000-4000-8000-000000000003";
const minuteId = "00000000-0000-4000-8000-000000000020";
const departmentId = "00000000-0000-4000-8000-000000000010";

function buildDb() {
  const minute = {
    id: minuteId,
    organization_id: organizationId,
    user_id: targetId,
    meeting_date: new Date("2026-04-15T00:00:00.000Z"),
    agenda: "Planejamento trimestral",
    agenda_key: "planejamento trimestral",
    participants: "Ana e Bruno",
    report: "",
    version: 1,
    created_by_id: actorId,
    updated_by_id: actorId,
    created_at: new Date("2026-04-15T10:00:00.000Z"),
    updated_at: new Date("2026-04-15T10:00:00.000Z"),
  };
  const revision = {
    id: "00000000-0000-4000-8000-000000000021",
    minute_id: minuteId,
    version: 1,
    action: "Created",
    meeting_date: minute.meeting_date,
    agenda: minute.agenda,
    participants: minute.participants,
    report: minute.report,
    changed_by_id: actorId,
    changed_at: minute.created_at,
    changed_by: { id: actorId, name: "Ana Silva", full_name: "Ana Silva" },
  };
  const db = {
    user: { findFirst: vi.fn() },
    rhEmployeeMeetingMinute: {
      findMany: vi.fn().mockResolvedValue([{ ...minute, revisions: [revision] }]),
      create: vi.fn().mockResolvedValue(minute),
      findUnique: vi.fn().mockResolvedValue({ ...minute, revisions: [revision] }),
      findFirst: vi.fn().mockResolvedValue(minute),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    rhEmployeeMeetingMinuteRevision: { create: vi.fn().mockResolvedValue(revision) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((callback) => callback(db));
  db.user.findFirst
    .mockResolvedValueOnce({ id: actorId, department_id: departmentId })
    .mockResolvedValueOnce({ id: targetId, department_id: departmentId });
  return db;
}

describe("EmployeeMeetingMinuteService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria uma ata distinta com pauta normalizada e primeira versão imutável", async () => {
    const db = buildDb();
    const result = await new EmployeeMeetingMinuteService(db as unknown as PrismaClient).create(
      { actorUserId: actorId, organizationId, targetUserId: targetId, rhPermission: 2 },
      {
        meeting_date: new Date("2026-04-15T00:00:00.000Z"),
        agenda: "  Planejamento   Trimestral ",
        participants: "Ana e Bruno",
        report: "",
      },
    );

    expect(db.rhEmployeeMeetingMinute.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: organizationId,
        user_id: targetId,
        agenda: "  Planejamento   Trimestral ",
        agenda_key: "planejamento trimestral",
        created_by_id: actorId,
        updated_by_id: actorId,
        version: 1,
      }),
    });
    expect(db.rhEmployeeMeetingMinuteRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 1,
        action: "Created",
        changed_by_id: actorId,
      }),
    });
    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0].changed_by_name).toBe("Ana Silva");
  });

  it("converte violação de unicidade em conflito funcional", async () => {
    const db = buildDb();
    db.rhEmployeeMeetingMinute.create.mockRejectedValueOnce({ code: "P2002" });

    await expect(
      new EmployeeMeetingMinuteService(db as unknown as PrismaClient).create(
        { actorUserId: actorId, organizationId, targetUserId: targetId, rhPermission: 2 },
        {
          meeting_date: new Date("2026-04-15T00:00:00.000Z"),
          agenda: "Planejamento trimestral",
          participants: "",
          report: "",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("registra cada edição com a próxima versão e preserva autoria", async () => {
    const db = buildDb();
    db.user.findFirst.mockReset();
    db.user.findFirst.mockResolvedValue({ id: actorId, department_id: departmentId });
    db.rhEmployeeMeetingMinute.findUnique.mockResolvedValueOnce({
      ...{
        id: minuteId,
        organization_id: organizationId,
        user_id: targetId,
        meeting_date: new Date("2026-04-15T00:00:00.000Z"),
        agenda: "Planejamento trimestral",
        agenda_key: "planejamento trimestral",
        participants: "Ana e Bruno",
        report: "Relato inicial",
        version: 2,
        created_by_id: actorId,
        updated_by_id: actorId,
        created_at: new Date("2026-04-15T10:00:00.000Z"),
        updated_at: new Date("2026-04-16T10:00:00.000Z"),
      },
      revisions: [],
    });

    await new EmployeeMeetingMinuteService(db as unknown as PrismaClient).update(
      { actorUserId: actorId, organizationId, rhPermission: 3 },
      minuteId,
      { report: "Relato revisado" },
    );

    expect(db.rhEmployeeMeetingMinute.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 1, user_id: targetId }),
        data: expect.objectContaining({
          report: "Relato revisado",
          version: { increment: 1 },
          updated_by_id: actorId,
        }),
      }),
    );
    expect(db.rhEmployeeMeetingMinuteRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        minute_id: minuteId,
        version: 2,
        action: "Updated",
        report: "Relato revisado",
        changed_by_id: actorId,
      }),
    });
  });

  it("nega ata de outro departamento ao gestor", async () => {
    const db = buildDb();
    db.user.findFirst.mockReset();
    db.user.findFirst
      .mockResolvedValueOnce({ id: actorId, department_id: departmentId })
      .mockResolvedValueOnce({
        id: targetId,
        department_id: "00000000-0000-4000-8000-000000000011",
      });

    await expect(
      new EmployeeMeetingMinuteService(db as unknown as PrismaClient).create(
        { actorUserId: actorId, organizationId, targetUserId: targetId, rhPermission: 2 },
        {
          meeting_date: new Date("2026-04-15T00:00:00.000Z"),
          agenda: "Pauta",
          participants: "",
          report: "",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.rhEmployeeMeetingMinute.create).not.toHaveBeenCalled();

    db.user.findFirst.mockReset();
    db.user.findFirst
      .mockResolvedValueOnce({ id: actorId, department_id: departmentId })
      .mockResolvedValueOnce({
        id: targetId,
        department_id: "00000000-0000-4000-8000-000000000011",
      });
    await expect(
      new EmployeeMeetingMinuteService(db as unknown as PrismaClient).list({
        actorUserId: actorId,
        organizationId,
        targetUserId: targetId,
        rhPermission: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.rhEmployeeMeetingMinute.findMany).not.toHaveBeenCalled();
  });
});
