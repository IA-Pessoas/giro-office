import "./envBootstrap.js";

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { GroupAssignmentService } from "../services/groupAssignmentService.js";
import {
  clientId,
  createAuditMock,
  groupId,
  organizationId,
  userId,
} from "./pessoalCoreTestUtils.js";

const secondClientId = "20000000-0000-4000-8000-000000000003";
const previewId = "30000000-0000-4000-8000-000000000003";
const fingerprint = "a".repeat(64);
const fixedNow = new Date("2026-09-15T12:00:00.000Z");

function preview(overrides: Record<string, unknown> = {}) {
  return {
    id: previewId,
    fingerprint,
    version: 1,
    totals: { changed: 1, no_op: 1, skipped: 0, requested: 2 },
    expires_at: new Date("2026-09-15T12:15:00.000Z"),
    applied_at: null,
    target_group_id: groupId,
    targetGroup: { id: groupId, name: "Mensal", archived_at: null },
    ...overrides,
  };
}

function createPrismaMock() {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    pessoalGroupAssignmentConfirmation: {
      findUnique: vi.fn(async (): Promise<unknown | null> => null),
      create: vi.fn(async () => ({})),
    },
    pessoalGroupAssignmentPreview: {
      findFirst: vi.fn(async () => preview()),
      update: vi.fn(async () => ({})),
    },
    pessoalGroupAssignmentPreviewDetail: {
      findMany: vi.fn(
        async (): Promise<unknown[]> => [
          {
            client_id: clientId,
            payroll_id: "payroll-1",
            previous_group_id: "old-group",
            outcome: "CHANGED",
          },
          {
            client_id: secondClientId,
            payroll_id: "payroll-2",
            previous_group_id: groupId,
            outcome: "NO_OP",
          },
        ],
      ),
      count: vi.fn(async () => 2),
    },
    client: {
      findMany: vi.fn(
        async (): Promise<unknown[]> => [
          { id: clientId, status: "Ativo", pessoal: true },
          { id: secondClientId, status: "Ativo", pessoal: true },
        ],
      ),
    },
    payroll: {
      findMany: vi.fn(
        async (): Promise<unknown[]> => [
          { id: "payroll-1", client_id: clientId, group_id: "old-group" },
          { id: "payroll-2", client_id: secondClientId, group_id: groupId },
        ],
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    pessoalAuditOutboxEvent: { create: vi.fn(async () => ({ id: "outbox-1" })) },
  };
  return {
    tx,
    pessoalGroup: { findFirst: vi.fn(async () => ({ id: groupId, name: "Mensal" })) },
    client: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
    payroll: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
    pessoalGroupAssignmentPreview: {
      create: vi.fn(async () => ({})),
      findFirst: vi.fn(async () => preview()),
    },
    pessoalGroupAssignmentPreviewDetail: {
      count: vi.fn(async () => 2),
      findMany: vi.fn(async () => []),
    },
    pessoalAuditOutboxEvent: { update: vi.fn(async () => ({})) },
    $queryRaw: vi.fn(async (): Promise<unknown[]> => []),
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
}

describe("GroupAssignmentService", () => {
  it("lista somente folhas de clientes ativos e marcados como pessoal", async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        client_id: clientId,
        client_name: "Cliente ativo",
        payroll_id: "payroll-1",
        group_id: groupId,
        group_name: "Mensal",
        total: 1,
      },
    ]);
    const service = new GroupAssignmentService(prisma as never, createAuditMock(), () => fixedNow);

    const result = await service.listEligible(
      { organizationId, userId, permission: 1 },
      { page: 1, limit: 25 },
    );

    expect(result).toMatchObject({
      total: 1,
      data: [{ client_id: clientId, payroll_id: "payroll-1" }],
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("persiste previa com alterados, no-op e ignorados sem invalidar os elegiveis", async () => {
    const prisma = createPrismaMock();
    prisma.client.findMany.mockResolvedValueOnce([
      { id: clientId, name: "Alterar", status: "Ativo", pessoal: true },
      { id: secondClientId, name: "Sem folha", status: "Ativo", pessoal: true },
    ]);
    prisma.payroll.findMany.mockResolvedValueOnce([
      { id: "payroll-1", client_id: clientId, group_id: "old-group", group: { name: "Anterior" } },
    ]);
    const service = new GroupAssignmentService(prisma as never, createAuditMock(), () => fixedNow);
    vi.spyOn(service, "detailPreview").mockResolvedValue({
      preview_id: previewId,
      fingerprint,
      version: 1,
      expires_at: new Date("2026-09-15T12:15:00.000Z"),
      ttl_seconds: 900,
      applied_at: null,
      target_group: { id: groupId, name: "Mensal" },
      totals: { changed: 1, no_op: 0, skipped: 1, requested: 2 },
      details: { data: [], total: 2, page: 1, limit: 25, hasMore: false },
    });

    await service.createPreview(
      { organizationId, userId, permission: 2 },
      { group_id: groupId, client_ids: [clientId, secondClientId] },
    );

    expect(prisma.pessoalGroupAssignmentPreview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
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

  it("devolve a resposta original para a mesma idempotency key", async () => {
    const prisma = createPrismaMock();
    prisma.tx.pessoalGroupAssignmentConfirmation.findUnique.mockResolvedValueOnce({
      command_hash: createHash("sha256")
        .update(JSON.stringify({ preview_id: previewId, fingerprint }))
        .digest("hex"),
      response_snapshot: { preview_id: previewId, changed: 1, no_op: 0, skipped: 0 },
    });
    const service = new GroupAssignmentService(prisma as never, createAuditMock(), () => fixedNow);

    await expect(
      service.apply(
        { organizationId, userId, permission: 2 },
        { preview_id: previewId, fingerprint },
        "same-key",
      ),
    ).resolves.toMatchObject({ preview_id: previewId, changed: 1, idempotent: true });
    expect(prisma.tx.payroll.updateMany).not.toHaveBeenCalled();
  });

  it("rejeita previa expirada antes de alterar uma folha", async () => {
    const prisma = createPrismaMock();
    prisma.tx.pessoalGroupAssignmentPreview.findFirst.mockResolvedValueOnce(
      preview({ expires_at: new Date("2026-09-15T11:59:59.000Z") }),
    );
    const service = new GroupAssignmentService(prisma as never, createAuditMock(), () => fixedNow);

    await expect(
      service.apply(
        { organizationId, userId, permission: 2 },
        { preview_id: previewId, fingerprint },
        "expired-key",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.tx.payroll.updateMany).not.toHaveBeenCalled();
  });

  it("rejeita a mesma idempotency key quando o comando mudou", async () => {
    const prisma = createPrismaMock();
    prisma.tx.pessoalGroupAssignmentConfirmation.findUnique.mockResolvedValueOnce({
      command_hash: "b".repeat(64),
      response_snapshot: {},
    });
    const service = new GroupAssignmentService(prisma as never, createAuditMock(), () => fixedNow);

    await expect(
      service.apply(
        { organizationId, userId, permission: 2 },
        { preview_id: previewId, fingerprint },
        "reused-key",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("permite que outro usuario autorizado da organizacao aplique a previa", async () => {
    const prisma = createPrismaMock();
    const service = new GroupAssignmentService(prisma as never, createAuditMock(), () => fixedNow);

    await expect(
      service.apply(
        { organizationId, userId: "another-authorized-user", permission: 2 },
        { preview_id: previewId, fingerprint },
        "other-user-key",
      ),
    ).resolves.toMatchObject({ preview_id: previewId, idempotent: false });
    expect(prisma.tx.payroll.updateMany).toHaveBeenCalledTimes(1);
  });

  it("aplica de modo atomico, sem criar folha ou reescrever obrigacoes, e confirma auditoria", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    (audit.recordChange as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    const service = new GroupAssignmentService(prisma as never, audit, () => fixedNow);

    const result = await service.apply(
      { organizationId, userId, permission: 2, requestId: "request-1" },
      { preview_id: previewId, fingerprint },
      "new-key",
    );

    expect(result).toMatchObject({
      preview_id: previewId,
      changed: 1,
      no_op: 1,
      idempotent: false,
    });
    expect(prisma.tx.payroll.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.tx.payroll.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { group_id: groupId } }),
    );
    expect(prisma.tx.pessoalGroupAssignmentConfirmation.create).toHaveBeenCalledTimes(1);
    expect(prisma.pessoalAuditOutboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "processed" }) }),
    );
  });

  it("mantem evento pendente na outbox quando a auditoria remota falha", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    (audit.recordChange as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const service = new GroupAssignmentService(prisma as never, audit, () => fixedNow);

    await service.apply(
      { organizationId, userId, permission: 2 },
      { preview_id: previewId, fingerprint },
      "audit-failure-key",
    );

    expect(prisma.tx.pessoalAuditOutboxEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.pessoalAuditOutboxEvent.update).not.toHaveBeenCalled();
  });
});
