/**
 * Postgres real: definir `CLIENT_SERVICE_INTEGRATION=1` e `DATABASE_URL` com schema aplicado
 * (`pnpm --filter @workspace/infra exec prisma db push` ou migrations).
 * Sem estas variáveis, esta suíte é ignorada (CI/local rápido).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { createLogger } from "@workspace/shared/logger";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { getClientServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { ClientService } from "../services/clientService.js";
import { LocalHistoryFileStorage } from "../services/historyStorageService.js";

const runIntegration = process.env.CLIENT_SERVICE_INTEGRATION === "1";

describe.skipIf(!runIntegration)("client-service Postgres integration", () => {
  const INTEGRATION_JWT_SECRET = "integration-jwt-secret-client-service";

  let prisma: PrismaClient;
  let organizationId: string;
  let clientId: string;

  beforeAll(async () => {
    const { PrismaClient } = await import("../generated/prisma/client.js");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl?.trim()) {
      throw new Error("DATABASE_URL é obrigatório quando CLIENT_SERVICE_INTEGRATION=1.");
    }

    process.env.JWT_SECRET = INTEGRATION_JWT_SECRET;

    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const cnpjDigits = `${Date.now()}${process.pid}${Math.floor(Math.random() * 1e6)}`
      .replace(/\D/g, "")
      .padEnd(14, "0")
      .slice(-14);
    const org = await prisma.organization.create({
      data: {
        name: `Integration Org ${stamp}`,
        slug: `int-org-${stamp}`,
        cnpj: cnpjDigits,
        email_created_by: `int+${stamp}@example.com`,
      },
    });
    organizationId = org.id;

    const client = await prisma.client.create({
      data: {
        name: `Cliente integração ${stamp}`,
        organization_id: organizationId,
        status: "Ativo",
        prospecting_status: "Lead",
        cpf_cnpj: "",
        service_unique: false,
      },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    if (!runIntegration || !prisma) {
      return;
    }
    await prisma.client.deleteMany({ where: { organization_id: organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("lista, desativa e reativa cliente via HTTP", async () => {
    const env = getClientServiceEnv();
    const logger = createLogger({
      service: "client-service-integration",
      env: "test",
      level: "silent",
    });
    const clientService = new ClientService(prisma);
    const historyStorage = new LocalHistoryFileStorage(".data/test-history-uploads");
    const app = createApp({ clientService, env, logger, prisma, historyStorage });

    const token = jwt.sign(
      { user_id: "integration-user", organization_id: organizationId, permission: 2 },
      INTEGRATION_JWT_SECRET,
    );

    const listRes = await request(app).get("/client/list").set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.items.some((c: { id: string }) => c.id === clientId)).toBe(true);
    expect(listRes.body.data.total).toBeGreaterThanOrEqual(1);

    const delRes = await request(app)
      .delete(`/client/${clientId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.data.status).toBe("Inativo");
    expect(delRes.body.data.deletion_date).toBeTruthy();

    const delAgain = await request(app)
      .delete(`/client/${clientId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(delAgain.status).toBe(409);

    const actRes = await request(app)
      .post(`/client/${clientId}/activate`)
      .set("Authorization", `Bearer ${token}`);

    expect(actRes.status).toBe(200);
    expect(actRes.body.data.status).toBe("Ativo");
    expect(actRes.body.data.deletion_date).toBeNull();

    const actAgain = await request(app)
      .post(`/client/${clientId}/activate`)
      .set("Authorization", `Bearer ${token}`);

    expect(actAgain.status).toBe(409);
  });

  it("filtro status=Prospect corresponde a clientes com status Prospecção na BD", async () => {
    const stamp = `${Date.now()}-prospect`;
    const prospectClient = await prisma.client.create({
      data: {
        name: `Prospect row ${stamp}`,
        organization_id: organizationId,
        status: "Prospecção",
        prospecting_status: "Lead",
        cpf_cnpj: "",
        service_unique: false,
      },
    });

    const env = getClientServiceEnv();
    const logger = createLogger({
      service: "client-service-integration",
      env: "test",
      level: "silent",
    });
    const clientService = new ClientService(prisma);
    const historyStorage = new LocalHistoryFileStorage(".data/test-history-uploads");
    const app = createApp({ clientService, env, logger, prisma, historyStorage });

    const token = jwt.sign(
      { user_id: "integration-user", organization_id: organizationId, permission: 2 },
      INTEGRATION_JWT_SECRET,
    );

    const res = await request(app)
      .get("/client/list")
      .query({ status: "Prospect", limit: 50 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((c: { id: string }) => c.id === prospectClient.id)).toBe(true);

    await prisma.client.delete({ where: { id: prospectClient.id } });
  });
});
