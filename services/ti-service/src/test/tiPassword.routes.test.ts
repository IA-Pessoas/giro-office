import "./envBootstrap.js";

import {
  EncryptionService,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const passwordId = "40000000-0000-4000-8000-000000000001";
const TI_REQUESTER_PERMISSION = 1;
const TI_ADMIN_PERMISSION = 2;
const encryption = new EncryptionService("MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=");

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

function passwordRecord() {
  return {
    id: passwordId,
    local: "VPN",
    user_id: userId,
    password: encryption.encrypt("segredo-vpn"),
    notes: "Acesso remoto",
    organization_id: organizationId,
    user: {
      id: userId,
      name: "Usuario TI",
      organization_id: organizationId,
    },
  };
}

function createPasswordPrismaMock(): Parameters<typeof createTestApp>[0] {
  return {
    passwordTecnologia: {
      findMany: vi.fn(async () => [passwordRecord()]),
      findFirst: vi.fn(async () => passwordRecord()),
      create: vi.fn(async ({ data }) => ({ id: passwordId, ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...passwordRecord(), ...data })),
    },
    user: {
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        organization_id: where.organization_id,
      })),
    },
  } as unknown as Parameters<typeof createTestApp>[0];
}

describe("ti password routes", () => {
  it("GET /ti/passwords/list requires admin permission", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .get("/ti/passwords/list")
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("GET /ti/passwords/list nao retorna password", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .get("/ti/passwords/list")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [
        {
          id: passwordId,
          local: "VPN",
          user_id: userId,
          organization_id: organizationId,
        },
      ],
    });
    expect(response.body.data[0]).not.toHaveProperty("password");
  });

  it("GET /ti/passwords/:id requires admin permission", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .get(`/ti/passwords/${passwordId}`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("GET /ti/passwords/:id com permissao administrativa 2 retorna password", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .get(`/ti/passwords/${passwordId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: passwordId,
        local: "VPN",
        password: "segredo-vpn",
      },
    });
  });
});
