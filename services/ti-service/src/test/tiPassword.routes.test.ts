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
const TI_VIEWER_PERMISSION = 1;
const TI_ADMIN_PERMISSION = 3;
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
    active: true,
    deactivated_at: null,
    deactivated_by_user_id: null,
    deactivation_reason: null,
    organization_id: organizationId,
    user: {
      id: userId,
      name: "Usuario TI",
      organization_id: organizationId,
    },
  };
}

function inactivePasswordRecord() {
  return {
    ...passwordRecord(),
    active: false,
    deactivated_at: new Date("2026-07-27T12:00:00.000Z"),
    deactivated_by_user_id: userId,
    deactivation_reason: "Vendor retired",
  };
}

function createPasswordPrismaMock(): Parameters<typeof createTestApp>[0] {
  return {
    passwordTecnologia: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [passwordRecord()]),
      findFirst: vi.fn(async () => passwordRecord()),
      create: vi.fn(async ({ data }) => ({ id: passwordId, ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...passwordRecord(), ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
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
  it("GET /ti/passwords/list rejects viewer permission", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .get("/ti/passwords/list")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

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
      data: {
        items: [
          {
            id: passwordId,
            local: "VPN",
            user_id: userId,
            organization_id: organizationId,
          },
        ],
        total: 1,
        page: 1,
        page_size: 50,
        hasMore: false,
      },
    });
    expect(response.body.data.items[0]).not.toHaveProperty("password");
  });

  it("GET /ti/passwords/list aceita busca textual sem retornar 400", async () => {
    const prisma = createPasswordPrismaMock();
    const response = await request(createTestApp(prisma))
      .get("/ti/passwords/list")
      .query({ search: "discord", page: 2, page_size: 10 })
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        total: 1,
        page: 2,
        page_size: 10,
        hasMore: false,
      },
    });
    expect(prisma.passwordTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it.each(["active", "inactive", "all"])("GET list accepts status=%s", async (status) => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .get("/ti/passwords/list")
      .query({ status })
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(200);
  });

  it("GET list rejects an unknown status", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .get("/ti/passwords/list")
      .query({ status: "deleted" })
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(400);
  });

  it("GET /ti/passwords/:id rejects viewer permission", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .get(`/ti/passwords/${passwordId}`)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

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

  it("GET /ti/passwords/:id reports decryption failure without exposing stored ciphertext", async () => {
    const prisma = createPasswordPrismaMock();
    prisma.passwordTecnologia.findFirst = vi.fn(async () => ({
      ...passwordRecord(),
      password: "invalid-ciphertext-fixture",
    }));

    const response = await request(createTestApp(prisma))
      .get(`/ti/passwords/${passwordId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      error: "Não foi possível revelar esta senha. Solicite à equipe de TI a revisão do cadastro.",
      code: "INTERNAL_ERROR",
    });
    expect(JSON.stringify(response.body)).not.toContain("invalid-ciphertext-fixture");
  });

  it("POST /ti/passwords/:id/deactivate requires authentication", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .post(`/ti/passwords/${passwordId}/deactivate`)
      .send({ reason: "Vendor retired" });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, code: "UNAUTHORIZED" });
  });

  it("POST /ti/passwords/:id/deactivate requires admin permission", async () => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .post(`/ti/passwords/${passwordId}/deactivate`)
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({ reason: "Vendor retired" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, code: "FORBIDDEN" });
  });

  it("POST /ti/passwords/:id/deactivate trims reason and returns safe lifecycle data", async () => {
    const prisma = createPasswordPrismaMock();
    prisma.passwordTecnologia.findFirst = vi
      .fn()
      .mockResolvedValueOnce(passwordRecord())
      .mockResolvedValueOnce({
        ...passwordRecord(),
        active: false,
        deactivated_at: new Date("2026-07-27T12:00:00.000Z"),
        deactivated_by_user_id: userId,
        deactivation_reason: "Vendor retired",
      });

    const response = await request(createTestApp(prisma))
      .post(`/ti/passwords/${passwordId}/deactivate`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ reason: "  Vendor retired  " });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: passwordId,
        active: false,
        deactivated_by_user_id: userId,
        deactivation_reason: "Vendor retired",
      },
    });
    expect(response.body.data).not.toHaveProperty("password");
    expect(prisma.passwordTecnologia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deactivation_reason: "Vendor retired" }),
      }),
    );
  });

  it.each([
    ["not-a-uuid", { reason: "Vendor retired" }],
    [passwordId, {}],
    [passwordId, { reason: "   " }],
    [passwordId, { reason: 42 }],
    [passwordId, { reason: "x".repeat(501) }],
    [passwordId, { reason: "Vendor retired", active: false }],
  ])("rejects invalid deactivation request %#", async (id, body) => {
    const response = await request(createTestApp(createPasswordPrismaMock()))
      .post(`/ti/passwords/${id}/deactivate`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: "BAD_REQUEST" });
  });

  it("GET /ti/passwords/:id serializes inactive conflict", async () => {
    const prisma = createPasswordPrismaMock();
    prisma.passwordTecnologia.findFirst = vi.fn(async () => inactivePasswordRecord());

    const response = await request(createTestApp(prisma))
      .get(`/ti/passwords/${passwordId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, code: "CONFLICT" });
  });

  it("PATCH /ti/passwords/:id serializes inactive conflict", async () => {
    const prisma = createPasswordPrismaMock();
    prisma.passwordTecnologia.findFirst = vi.fn(async () => inactivePasswordRecord());

    const response = await request(createTestApp(prisma))
      .patch(`/ti/passwords/${passwordId}`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ notes: "Too late" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, code: "CONFLICT" });
    expect(prisma.passwordTecnologia.updateMany).not.toHaveBeenCalled();
  });

  it("POST /ti/passwords/:id/deactivate serializes repeated conflict", async () => {
    const prisma = createPasswordPrismaMock();
    prisma.passwordTecnologia.findFirst = vi.fn(async () => inactivePasswordRecord());

    const response = await request(createTestApp(prisma))
      .post(`/ti/passwords/${passwordId}/deactivate`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ reason: "Second reason" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, code: "CONFLICT" });
    expect(prisma.passwordTecnologia.updateMany).not.toHaveBeenCalled();
  });
});
