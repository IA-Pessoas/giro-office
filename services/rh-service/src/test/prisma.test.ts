import { expect, it, vi } from "vitest";

const { prismaPgMock, prismaClientMock } = vi.hoisted(() => ({
  prismaPgMock: vi.fn(function PrismaPg() {}),
  prismaClientMock: vi.fn(function PrismaClient() {}),
}));

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: prismaPgMock }));
vi.mock("../config/env.js", () => ({
  getRhEnv: () => ({ databaseUrl: "postgres://test", databasePoolMax: 5 }),
}));
vi.mock("../generated/prisma/client.js", () => ({ PrismaClient: prismaClientMock }));

it("configura o limite de conexoes do adapter PrismaPg", async () => {
  await import("../integrations/prisma.js");

  expect(prismaPgMock).toHaveBeenCalledWith({
    connectionString: "postgres://test",
    max: 5,
  });
});
