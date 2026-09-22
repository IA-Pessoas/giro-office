import { describe, expect, it, vi } from "vitest";
import { runInTaskContext } from "../context.js";
import { workerEnv } from "../test/env.js";
import prismaClient from "./prisma.js";

function fakeClient() {
  const client = {
    task: { count: vi.fn(async () => 3) },
    $transaction: vi.fn(async function (this: unknown, callback: (tx: unknown) => unknown) {
      if (this !== client) throw new Error("$transaction perdeu o this");
      return callback(client);
    }),
    $disconnect: vi.fn(async () => {}),
  };
  return client;
}

describe("prisma shim", () => {
  it("usa o client da requisição, criado uma vez e desconectado no fim", async () => {
    const client = fakeClient();
    const createPrisma = vi.fn(() => client);

    await runInTaskContext({ env: workerEnv(), createPrisma }, async () => {
      expect(await prismaClient.task.count()).toBe(3);
      expect(await prismaClient.$transaction(async () => "ok")).toBe("ok");
    });

    expect(createPrisma).toHaveBeenCalledTimes(1);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it("não abre conexão quando a requisição não toca o banco", async () => {
    const createPrisma = vi.fn(fakeClient);
    await runInTaskContext({ env: workerEnv(), createPrisma }, async () => "sem banco");
    expect(createPrisma).not.toHaveBeenCalled();
  });

  it("isola requisições concorrentes", async () => {
    const a = fakeClient();
    const b = fakeClient();
    b.task.count.mockResolvedValue(7);
    const [ra, rb] = await Promise.all([
      runInTaskContext({ env: workerEnv(), createPrisma: () => a }, () =>
        prismaClient.task.count(),
      ),
      runInTaskContext({ env: workerEnv(), createPrisma: () => b }, () =>
        prismaClient.task.count(),
      ),
    ]);
    expect([ra, rb]).toEqual([3, 7]);
  });

  it("falha alto fora de uma requisição", () => {
    expect(() => prismaClient.task).toThrow(/fora de uma requisição/i);
  });
});
