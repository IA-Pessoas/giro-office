import { PrismaPg } from "@prisma/adapter-pg";
import type { WorkerEnv } from "./env.js";

export interface WorkerPrismaClient {
  $disconnect(): Promise<void>;
}

export type WorkerPrismaClientConstructor<Client extends WorkerPrismaClient = WorkerPrismaClient> =
  new (options: {
    adapter: PrismaPg;
  }) => Client;

const getConnectionString = (env: WorkerEnv) => {
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Prisma connection string is not configured");
  }

  return connectionString;
};

export function createWorkerPrismaClient<Client extends WorkerPrismaClient>(
  env: WorkerEnv,
  PrismaClientConstructor: WorkerPrismaClientConstructor<Client>,
): Client {
  const adapter = new PrismaPg({ connectionString: getConnectionString(env) });
  return new PrismaClientConstructor({ adapter });
}

export async function withWorkerPrisma<Client extends WorkerPrismaClient, Result>(
  env: WorkerEnv,
  PrismaClientConstructor: WorkerPrismaClientConstructor<Client>,
  callback: (client: Client) => Result | Promise<Result>,
): Promise<Result> {
  const client = createWorkerPrismaClient(env, PrismaClientConstructor);

  try {
    return await callback(client);
  } finally {
    await client.$disconnect();
  }
}
