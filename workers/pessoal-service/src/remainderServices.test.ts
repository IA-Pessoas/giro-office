import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  GroupAssignmentService,
  type PessoalAssignmentPrisma,
  type PessoalNotificationPrisma,
  UnionNotificationService,
} from "./remainderServices.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const GROUP_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "f0000000-0000-4000-8000-000000000001";
const SECOND_CLIENT_ID = "f0000000-0000-4000-8000-000000000002";
const PREVIEW_ID = "30000000-0000-4000-8000-000000000003";
const FIXED_NOW = new Date("2026-09-15T12:00:00.000Z");
const FINGERPRINT = "a".repeat(64);

function preview(overrides: Record<string, unknown> = {}) {
  return {
    id: PREVIEW_ID,
    fingerprint: FINGERPRINT,
    version: 1,
    totals: { changed: 1, no_op: 1, skipped: 0, requested: 2 },
    expires_at: new Date("2026-09-15T12:15:00.000Z"),
    applied_at: null,
    target_group_id: GROUP_ID,
    targetGroup: { id: GROUP_ID, name: "Mensal", archived_at: null },
    ...overrides,
  };
}

function assignmentPrisma() {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    pessoalGroupAssignmentConfirmation: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
    pessoalGroupAssignmentPreview: {
      findFirst: vi.fn(async () => preview()),
      update: vi.fn(async () => ({})),
    },
    pessoalGroupAssignmentPreviewDetail: {
      findMany: vi.fn(async () => [
        {
          client_id: CLIENT_ID,
          payroll_id: "payroll-1",
          previous_group_id: "old",
          outcome: "CHANGED",
        },
        {
          client_id: SECOND_CLIENT_ID,
          payroll_id: "payroll-2",
          previous_group_id: GROUP_ID,
          outcome: "NO_OP",
        },
      ]),
      count: vi.fn(async () => 2),
    },
    client: {
      findMany: vi.fn(async () => [
        { id: CLIENT_ID, status: "Ativo", pessoal: true },
        { id: SECOND_CLIENT_ID, status: "Ativo", pessoal: true },
      ]),
    },
    payroll: {
      findMany: vi.fn(async () => [
        { id: "payroll-1", client_id: CLIENT_ID, group_id: "old" },
        { id: "payroll-2", client_id: SECOND_CLIENT_ID, group_id: GROUP_ID },
      ]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    pessoalAuditOutboxEvent: { create: vi.fn(async () => ({ id: "outbox-1" })) },
  };
  return {
    tx,
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (callback) => callback(tx)),
    pessoalGroup: {
      findFirst: vi.fn(async () => ({ id: GROUP_ID, name: "Mensal", archived_at: null })),
      findMany: vi.fn(async () => [{ id: "old", name: "Anterior" }]),
    },
    client: {
      findMany: vi.fn(async () => [
        { id: CLIENT_ID, name: "Alterar", status: "Ativo", pessoal: true },
        { id: SECOND_CLIENT_ID, name: "Sem folha", status: "Ativo", pessoal: true },
      ]),
    },
    payroll: {
      findMany: vi.fn(async () => [{ id: "payroll-1", client_id: CLIENT_ID, group_id: "old" }]),
    },
    pessoalGroupAssignmentPreview: {
      create: vi.fn(async () => ({})),
      findFirst: vi.fn(async () => preview()),
    },
    pessoalGroupAssignmentPreviewDetail: {
      count: vi.fn(async () => 2),
      findMany: vi.fn(async () => []),
    },
    pessoalAuditOutboxEvent: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as PessoalAssignmentPrisma & { tx: typeof tx };
}

describe("GroupAssignmentService do Worker", () => {
  it("persiste preview com escopo da organização e classifica itens sem folha", async () => {
    const prisma = assignmentPrisma();
    const service = new GroupAssignmentService(
      prisma,
      vi.fn(async () => true),
      () => FIXED_NOW,
    );
    vi.spyOn(service, "detailPreview").mockResolvedValue({
      preview_id: PREVIEW_ID,
      fingerprint: FINGERPRINT,
      version: 1,
      expires_at: new Date("2026-09-15T12:15:00.000Z"),
      ttl_seconds: 900,
      applied_at: null,
      target_group: { id: GROUP_ID, name: "Mensal" },
      totals: { changed: 1, no_op: 0, skipped: 1, requested: 2 },
      details: { data: [], total: 2, page: 1, limit: 25, hasMore: false },
    });

    await service.createPreview(
      { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
      { group_id: GROUP_ID, client_ids: [CLIENT_ID, SECOND_CLIENT_ID] },
    );

    expect(prisma.pessoalGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GROUP_ID, organization_id: ORGANIZATION_ID, archived_at: null },
      }),
    );
    expect(prisma.pessoalGroupAssignmentPreview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: ORGANIZATION_ID,
          totals: { changed: 1, no_op: 0, skipped: 1, requested: 2 },
          details: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ outcome: "CHANGED" }),
              expect.objectContaining({ skip_reason: "PAYROLL_NOT_FOUND" }),
            ]),
          }),
        }),
      }),
    );
  });

  it("devolve snapshot para a mesma chave e não repete atualização", async () => {
    const prisma = assignmentPrisma();
    const commandHash = createHash("sha256")
      .update(JSON.stringify({ preview_id: PREVIEW_ID, fingerprint: FINGERPRINT }))
      .digest("hex");
    prisma.tx.pessoalGroupAssignmentConfirmation.findUnique.mockResolvedValueOnce({
      command_hash: commandHash,
      response_snapshot: { preview_id: PREVIEW_ID, changed: 1, no_op: 0, skipped: 0 },
    });
    const service = new GroupAssignmentService(
      prisma,
      vi.fn(async () => true),
      () => FIXED_NOW,
    );

    await expect(
      service.apply(
        { organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 },
        { preview_id: PREVIEW_ID, fingerprint: FINGERPRINT },
        "same-key",
      ),
    ).resolves.toMatchObject({ preview_id: PREVIEW_ID, idempotent: true });
    expect(prisma.tx.payroll.updateMany).not.toHaveBeenCalled();
  });

  it("reconcilia apenas auditoria pendente e não altera folha", async () => {
    const prisma = assignmentPrisma();
    prisma.pessoalAuditOutboxEvent.findMany.mockResolvedValueOnce([
      {
        id: "outbox-pending",
        payload: {
          requestId: "audit-request-1",
          organizationId: ORGANIZATION_ID,
          userId: USER_ID,
          action: "Atualizacao",
          referring: "pessoal.group-assignment",
          referringId: PREVIEW_ID,
        },
      },
    ]);
    const audit = vi.fn(async () => true);
    const service = new GroupAssignmentService(prisma, audit, () => FIXED_NOW);

    await expect(service.reconcilePendingAuditEvents()).resolves.toEqual({
      processed: 1,
      pending: 0,
    });
    expect(audit).toHaveBeenCalledOnce();
    expect(prisma.pessoalAuditOutboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "outbox-pending", status: "pending" },
      data: { status: "processed", processed_at: FIXED_NOW },
    });
    expect(prisma.tx.payroll.updateMany).not.toHaveBeenCalled();
  });
});

function notificationPrisma(): PessoalNotificationPrisma {
  return {
    unionPessoal: {
      findMany: vi.fn(async ({ select, where }) => {
        if (select?.organization_id && !select?.id) {
          return [{ organization_id: ORGANIZATION_ID }];
        }
        if (where?.organization_id === ORGANIZATION_ID) {
          return [
            {
              id: "union-1",
              name: "Sindicato",
              base_date: new Date("2020-07-01T00:00:00.000Z"),
              organization_id: ORGANIZATION_ID,
            },
          ];
        }
        return [];
      }),
    },
    permission: {
      findMany: vi.fn(async ({ where }) =>
        where?.organization_id === ORGANIZATION_ID ? [{ user_id: USER_ID }] : [],
      ),
    },
    user: { findMany: vi.fn(async () => [{ id: USER_ID, status: "Ativo" }]) },
    pessoalNotification: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

describe("UnionNotificationService do Worker", () => {
  it("cria uma notificação por usuário e ciclo, sem sair da organização", async () => {
    const prisma = notificationPrisma();
    const service = new UnionNotificationService(prisma);

    await expect(
      service.runForDate({ now: new Date("2026-06-30T12:00:00.000Z") }),
    ).resolves.toEqual({
      organizations: 1,
      unionsMatched: 1,
      notificationsCreated: 1,
      duplicatesSkipped: 0,
    });
    expect(prisma.permission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: ORGANIZATION_ID,
          pessoal: { gte: 1 },
        }),
      }),
    );
    expect(prisma.pessoalNotification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          user_id: USER_ID,
          organization_id: ORGANIZATION_ID,
          regarding: "union",
          reference_date: new Date("2026-07-01T00:00:00.000Z"),
        }),
      ],
      skipDuplicates: true,
    });
  });
});
