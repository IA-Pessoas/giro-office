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
      })),
      create: vi.fn(async ({ data }) => ({ id: termId, ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
  } as unknown as PrismaClient;
}

describe("ti term routes", () => {
  it("POST /ti/terms creates a term", async () => {
    const response = await request(createTestApp(createPrismaMock()))
      .post("/ti/terms")
      .set(gatewayHeaders(3))
      .send({
        date: "2026-05-19",
        user_id: userId,
        user_name: "Maria Silva",
        user_cpf: "12345678900",
        department_id: departmentId,
        asset_code: "NB-001",
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
      },
    });
  });

  it("PATCH /ti/terms/:id/sign signs a term", async () => {
    const response = await request(createTestApp(createPrismaMock()))
      .patch(`/ti/terms/${termId}/sign`)
      .set(gatewayHeaders(1))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: termId,
        reason: "Termo assinado pelo usuario.",
      },
    });
  });
});
