import {
  createExpressErrorHandler,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createClientGroupsRouter } from "../routes/clientGroups.routes.js";

const organizationId = "550e8400-e29b-41d4-a716-446655440000";
const groupId = "660e8400-e29b-41d4-a716-446655440001";
const internalToken = "client-groups-route-test-token";

function makePrisma() {
  const group = {
    id: groupId,
    name: "Grupo A",
    status: true,
    organization_id: organizationId,
    clients: [],
  };
  const prisma = {
    group: {
      findMany: vi.fn().mockResolvedValue([group]),
      findFirst: vi.fn().mockResolvedValue(group),
      create: vi.fn().mockResolvedValue(group),
      update: vi.fn().mockResolvedValue(group),
    },
    client: { findMany: vi.fn().mockResolvedValue([]) },
    clientsGroup: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    ...prisma,
    $transaction: vi.fn((run: (transaction: typeof prisma) => unknown) => run(prisma)),
  };
}

function buildApp(prisma = makePrisma()) {
  const app = express();
  app.use(express.json());
  app.use("/client", createClientGroupsRouter({ prisma } as never));
  app.use(
    createExpressErrorHandler({
      logger: { error: vi.fn() } as never,
      event: "client-groups-test",
      fallbackMessage: "Erro",
    }),
  );
  return { app, prisma };
}

function authHeaders() {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: internalToken,
    [FORWARDED_AUTH_USER_ID_HEADER]: "user-test-1",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: 3 }),
  };
}

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/test";
  process.env.JWT_SECRET = "client-groups-route-test-secret";
  process.env.CLIENT_SERVICE_INTERNAL_TOKEN = internalToken;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-service-role-key";
});

describe("client groups routes", () => {
  it("requires authentication to list groups", async () => {
    const { app, prisma } = buildApp();

    const response = await request(app).get("/client/groups").expect(401);

    expect(response.body.success).toBe(false);
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it("lists persisted groups, including groups without clients", async () => {
    const { app } = buildApp();

    const response = await request(app).get("/client/groups").set(authHeaders()).expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: [{ id: groupId, name: "Grupo A", clients: [] }],
    });
  });

  it("validates the create body and returns a success envelope", async () => {
    const { app, prisma } = buildApp();
    vi.mocked(prisma.group.findFirst).mockResolvedValueOnce(null);

    await request(app).post("/client/groups").set(authHeaders()).send({ name: " " }).expect(400);
    const response = await request(app)
      .post("/client/groups")
      .set(authHeaders())
      .send({ name: "Grupo A" })
      .expect(201);

    expect(response.body).toMatchObject({ success: true, data: { id: groupId, clients: [] } });
    expect(prisma.group.create).toHaveBeenCalled();
  });

  it("renames a group", async () => {
    const { app, prisma } = buildApp();
    vi.mocked(prisma.group.findFirst)
      .mockResolvedValueOnce({ id: groupId } as never)
      .mockResolvedValueOnce(null);

    const response = await request(app)
      .patch(`/client/groups/${groupId}`)
      .set(authHeaders())
      .send({ name: "Grupo B" })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(prisma.group.update).toHaveBeenCalled();
  });

  it("replaces memberships with an empty list", async () => {
    const { app, prisma } = buildApp();

    const response = await request(app)
      .put(`/client/groups/${groupId}/clients`)
      .set(authHeaders())
      .send({ client_ids: [] })
      .expect(200);

    expect(response.body).toMatchObject({ success: true, data: { id: groupId, clients: [] } });
    expect(prisma.clientsGroup.deleteMany).toHaveBeenCalledWith({
      where: { group_id: groupId, organization_id: organizationId },
    });
  });
});
