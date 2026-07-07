import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export type CertificatePrismaClient = PrismaClient;

export function createCertificatePrismaClient(databaseUrl: string): CertificatePrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
  });

  return new PrismaClient({ adapter });
}
