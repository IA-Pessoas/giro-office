import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const departmentId = "20000000-0000-4000-8000-000000000001";
const termId = "30000000-0000-4000-8000-000000000001";
const otherUserId = "90000000-0000-4000-8000-000000000001";
const TI_VIEWER_PERMISSION = 1;
const TI_REQUESTER_PERMISSION = 1;
const TI_ADMIN_PERMISSION = 3;

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

function createPrismaMock(): PrismaClient {
  return {
    user: {
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        name: "Maria Silva",
        full_name: "Maria Silva",
        cpf: "12345678900",
        organization_id: where.organization_id,
      })),
    },
    department: {
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        organization_id: where.organization_id,
      })),
    },
    termTecnologia: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        user_id: userId,
        organization_id: where.organization_id,
        reason: null,
        signed_at: null,
      })),
      create: vi.fn(async ({ data }) => ({ id: termId, ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  } as unknown as PrismaClient;
}

describe("ti term routes", () => {
  it("GET /ti/terms/list allows viewer to list own terms", async () => {
    const response = await request(createTestApp(createPrismaMock()))
      .get("/ti/terms/list")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
  });

  it("GET /ti/terms/:id allows viewer to read own term", async () => {
    const response = await request(createTestApp(createPrismaMock()))
      .get(`/ti/terms/${termId}`)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: termId, user_id: userId, status: "pending", signed_at: null },
    });
  });

  it("GET /ti/terms/list filters by signed_at status", async () => {
    const prisma = createPrismaMock();

    const response = await request(createTestApp(prisma))
      .get("/ti/terms/list?status=signed")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(prisma.termTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ signed_at: { not: null } }),
      }),
    );
  });

  it("PATCH /ti/terms/:id/sign allows viewer to sign own term", async () => {
    const response = await request(createTestApp(createPrismaMock()))
      .patch(`/ti/terms/${termId}/sign`)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: termId, reason: "Termo assinado pelo usuario.", status: "signed" },
    });
  });

  it("POST /ti/terms keeps viewer from creating terms", async () => {
    const response = await request(createTestApp(createPrismaMock()))
      .post("/ti/terms")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({ date: "2026-05-19", asset_code: "NB-001" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("PATCH /ti/terms/:id keeps viewer from updating terms", async () => {
    const prisma = createPrismaMock();

    const response = await request(createTestApp(prisma))
      .patch(`/ti/terms/${termId}`)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({ asset_code: "NB-002" });

    expect(response.status).toBe(403);
    expect(prisma.termTecnologia.update).not.toHaveBeenCalled();
  });

  it("POST /ti/terms creates a term", async () => {
    const response = await request(createTestApp(createPrismaMock()))
      .post("/ti/terms")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        date: "2026-05-19",
        user_id: userId,
        department_id: departmentId,
        asset_code: "NB-001",
        reason: "Motivo cadastral",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: termId,
        user_id: userId,
        user_name: "Maria Silva",
        user_cpf: "12345678900",
        department_id: departmentId,
        asset_code: "NB-001",
        organization_id: organizationId,
        reason: "Motivo cadastral",
        signed_at: null,
        status: "pending",
      },
    });
  });

  it("PATCH /ti/terms/:id rejects manual user identity changes", async () => {
    const prisma = createPrismaMock();

    const response = await request(createTestApp(prisma))
      .patch(`/ti/terms/${termId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        user_id: otherUserId,
        user_name: "Outro Usuario",
        user_cpf: "00000000000",
      });

    expect(response.status).toBe(400);
    expect(prisma.termTecnologia.update).not.toHaveBeenCalled();
  });

  it("PATCH /ti/terms/:id/sign signs a term", async () => {
    const response = await request(createTestApp(createPrismaMock()))
      .patch(`/ti/terms/${termId}/sign`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: termId,
        reason: "Termo assinado pelo usuario.",
        status: "signed",
      },
    });
  });

  it("PATCH /ti/terms/:id/sign allows admin level 3 to sign another user's term", async () => {
    const prisma = createPrismaMock();
    vi.mocked(prisma.termTecnologia.findFirst).mockResolvedValueOnce({
      id: termId,
      user_id: otherUserId,
      organization_id: organizationId,
      reason: null,
    } as never);

    const response = await request(createTestApp(prisma))
      .patch(`/ti/terms/${termId}/sign`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: termId,
        reason: "Termo assinado pelo usuario.",
        status: "signed",
      },
    });
  });

  it("PATCH /ti/terms/:id/sign hides another user's term from viewer", async () => {
    const prisma = createPrismaMock();
    vi.mocked(prisma.termTecnologia.findFirst).mockResolvedValueOnce({
      id: termId,
      user_id: otherUserId,
      organization_id: organizationId,
      reason: null,
    } as never);

    const response = await request(createTestApp(prisma))
      .patch(`/ti/terms/${termId}/sign`)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({});

    expect(response.status).toBe(404);
    expect(prisma.termTecnologia.update).not.toHaveBeenCalled();
  });
});
