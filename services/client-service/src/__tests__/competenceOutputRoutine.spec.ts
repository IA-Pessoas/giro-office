import { describe, expect, it, vi } from "vitest";
import { runCompetenceOutputUpdate } from "../services/competenceOutputRoutine.js";

describe("runCompetenceOutputUpdate", () => {
  it("atualiza clientes elegíveis", async () => {
    const prisma = {
      client: {
        findMany: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const result = await runCompetenceOutputUpdate(prisma as never);
    expect(result.updated).toBe(2);
    expect(prisma.client.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
      data: { status: "Inativo" },
    });
  });

  it("retorna zero quando não há clientes", async () => {
    const prisma = {
      client: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
    };
    const result = await runCompetenceOutputUpdate(prisma as never);
    expect(result.updated).toBe(0);
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
  });
});
