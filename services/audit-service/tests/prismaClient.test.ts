import { beforeEach, expect, it, vi } from "vitest";

const prismaPgConstructor = vi.hoisted(() => vi.fn(function PrismaPg() {}));
const disconnect = vi.hoisted(() => vi.fn(async () => {}));
const prismaClientConstructor = vi.hoisted(() =>
  vi.fn(function PrismaClient() {
    return { $disconnect: disconnect };
  }),
);

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: prismaPgConstructor }));
vi.mock("../generated/prisma/client.js", () => ({ PrismaClient: prismaClientConstructor }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  process.env.DATABASE_POOL_MAX = "1";
});

it("reutiliza um unico PrismaClient em producao", async () => {
  const { getPrismaClient } = await import("../src/integrations/prisma/prismaClient.js");

  const first = getPrismaClient();
  const second = getPrismaClient();

  expect(second).toBe(first);
  expect(prismaPgConstructor).toHaveBeenCalledTimes(1);
  expect(prismaPgConstructor).toHaveBeenCalledWith(expect.objectContaining({ max: 1 }));
  expect(prismaClientConstructor).toHaveBeenCalledTimes(1);
});

it("desconecta o singleton uma unica vez durante shutdown", async () => {
  const { disconnectPrismaClient, getPrismaClient } = await import(
    "../src/integrations/prisma/prismaClient.js"
  );
  getPrismaClient();

  await disconnectPrismaClient();
  await disconnectPrismaClient();

  expect(disconnect).toHaveBeenCalledTimes(1);
});
