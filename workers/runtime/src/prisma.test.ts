import { describe, expect, it } from "vitest";
import type { WorkerEnv } from "./env.js";
import {
  createWorkerPrismaClient,
  type WorkerPrismaClient,
  type WorkerPrismaClientConstructor,
  withWorkerPrisma,
} from "./prisma.js";

type FakeOptions = { adapter: unknown };

class FakePrismaClient implements WorkerPrismaClient {
  static options: FakeOptions[] = [];
  static instances: FakePrismaClient[] = [];
  disconnectCalls = 0;
  connectCalls = 0;

  constructor(options: FakeOptions) {
    FakePrismaClient.options.push(options);
    FakePrismaClient.instances.push(this);
  }

  async $disconnect() {
    this.disconnectCalls += 1;
  }

  async $connect() {
    this.connectCalls += 1;
  }
}

const Constructor = FakePrismaClient as WorkerPrismaClientConstructor<FakePrismaClient>;

const connectionStringFrom = (options: FakeOptions) =>
  (options.adapter as { config: { connectionString: string } }).config.connectionString;

describe("worker Prisma runtime", () => {
  it("prefers Hyperdrive and does not connect while creating the client", () => {
    FakePrismaClient.options = [];
    FakePrismaClient.instances = [];

    const client = createWorkerPrismaClient(
      {
        HYPERDRIVE: { connectionString: "postgres://hyperdrive.example/db" },
        DATABASE_URL: "postgres://local.example/db",
      },
      Constructor,
    );

    expect(connectionStringFrom(FakePrismaClient.options[0])).toBe(
      "postgres://hyperdrive.example/db",
    );
    expect(client.connectCalls).toBe(0);
  });

  it("uses DATABASE_URL explicitly as the local fallback", () => {
    FakePrismaClient.options = [];

    createWorkerPrismaClient({ DATABASE_URL: "postgres://local.example/db" }, Constructor);

    expect(connectionStringFrom(FakePrismaClient.options[0])).toBe("postgres://local.example/db");
  });

  it("fails without a connection string without exposing secrets", () => {
    const secret = "postgres://user:password@example/db";

    expect(() => createWorkerPrismaClient({} satisfies WorkerEnv, Constructor)).toThrow(
      "Prisma connection string is not configured",
    );
    expect(() => createWorkerPrismaClient({} satisfies WorkerEnv, Constructor)).not.toThrow(secret);
  });

  it("runs the callback and disconnects after success", async () => {
    FakePrismaClient.instances = [];
    const result = await withWorkerPrisma(
      { DATABASE_URL: "postgres://local.example/db" },
      Constructor,
      async (client) => {
        expect(client).toBe(FakePrismaClient.instances[0]);
        return "done";
      },
    );

    expect(result).toBe("done");
    expect(FakePrismaClient.instances[0].disconnectCalls).toBe(1);
  });

  it("disconnects after callback failure and preserves the error", async () => {
    FakePrismaClient.instances = [];
    const error = new Error("callback failed");

    await expect(
      withWorkerPrisma({ DATABASE_URL: "postgres://local.example/db" }, Constructor, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(FakePrismaClient.instances[0].disconnectCalls).toBe(1);
  });
});
