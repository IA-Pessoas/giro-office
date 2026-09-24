import { describe, expect, it, vi } from "vitest";

import {
  assertUserAuditOutboxRuntime,
  enqueueUserAuditEvent,
} from "../integrations/auditOutbox.js";

describe("audit outbox runtime", () => {
  it("exige principal não-superuser com membership da role exclusiva", async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ is_member: true, is_superuser: false, bypass_rls: false }]),
    };

    await expect(assertUserAuditOutboxRuntime(prisma as never)).resolves.toBeUndefined();
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("recusa credenciais sem membership ou com bypass de RLS", async () => {
    for (const runtime of [
      { is_member: false, is_superuser: false, bypass_rls: false },
      { is_member: true, is_superuser: true, bypass_rls: false },
      { is_member: true, is_superuser: false, bypass_rls: true },
    ]) {
      const prisma = { $queryRaw: vi.fn().mockResolvedValue([runtime]) };
      await expect(assertUserAuditOutboxRuntime(prisma as never)).rejects.toThrow(
        "giro_user_service_audit_runtime",
      );
    }
  });

  it("cria o evento no mesmo transaction com a role exclusiva", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const executeRaw = vi.fn().mockResolvedValue(0);

    await enqueueUserAuditEvent(
      {
        $executeRaw: executeRaw,
        userAuditOutboxEvent: { create },
      } as never,
      {
        action: "platform.super_admin.impersonation_permission.updated",
        referring: "user",
        referringId: "platform-user-2",
        changes: { can_impersonate: true },
        outcome: "success",
        required: true,
      },
    );

    expect(executeRaw.mock.calls.map(([query]) => query[0].trim())).toEqual([
      'SET LOCAL ROLE "giro_user_service_audit_runtime"',
      "RESET ROLE",
    ]);
    expect(create).toHaveBeenCalledOnce();
  });
});
