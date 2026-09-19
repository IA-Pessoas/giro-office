import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { assertTriagemDatabaseRuntime } from "../integrations/prisma.js";

function createPrismaMock(rows: unknown[]): PrismaClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue(rows),
  } as unknown as PrismaClient;
}

describe("triagem database runtime", () => {
  it("aceita somente principal membro sem bypass de RLS", async () => {
    await expect(
      assertTriagemDatabaseRuntime(
        createPrismaMock([{ is_member: true, is_superuser: false, bypass_rls: false }]),
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    { is_member: false, is_superuser: false, bypass_rls: false },
    { is_member: true, is_superuser: true, bypass_rls: false },
    { is_member: true, is_superuser: false, bypass_rls: true },
  ])("rejeita configuração insegura: $is_member/$is_superuser/$bypass_rls", async (runtime) => {
    await expect(assertTriagemDatabaseRuntime(createPrismaMock([runtime]))).rejects.toThrow(
      "membro de giro_user_runtime",
    );
  });
});
