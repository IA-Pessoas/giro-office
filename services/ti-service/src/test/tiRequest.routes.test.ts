import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createPrismaMock, createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const categoryId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";
const TI_VIEWER_PERMISSION = 0;
const TI_REQUESTER_PERMISSION = 1;
const TI_ADMIN_PERMISSION = 2;
const otherUserId = "00000000-0000-4000-8000-000000000002";
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

describe("ti request routes", () => {
  it("GET /ti/requests/list allows Viewer to list only own requests", async () => {
    const response = await request(createTestApp())
      .get("/ti/requests/list")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: [] });
  });

  it("POST /ti/requests allows Viewer to create an own request", async () => {
    const response = await request(createTestApp())
      .post("/ti/requests")
      .set(gatewayHeaders(TI_VIEWER_PERMISSION))
      .send({
        title: "Notebook nao liga",
        description: "Equipamento nao inicia.",
        category_id: categoryId,
        urgency: "High",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        requester_id: userId,
        status: "New",
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/requests creates a request", async () => {
    const response = await request(createTestApp())
      .post("/ti/requests")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        title: "Notebook nao liga",
        description: "Equipamento nao inicia.",
        category_id: categoryId,
        urgency: "High",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        requester_id: userId,
        status: "New",
        organization_id: organizationId,
      },
    });
  });

  it("POST /ti/requests requires forwarded auth context", async () => {
    const response = await request(createTestApp()).post("/ti/requests").send({
      title: "Notebook nao liga",
      description: "Equipamento nao inicia.",
      category_id: categoryId,
      urgency: "High",
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: "Token interno do ti-service invalido.",
      code: "UNAUTHORIZED",
    });
  });

  it("PATCH /ti/requests/:id/assign requires admin permission", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/requests/${requestId}/assign`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({ assigned_to_id: userId });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: "Permissao insuficiente para acessar o ti-service.",
      code: "FORBIDDEN",
    });
  });

  it("PATCH /ti/requests/:id/assign accepts admin level 2", async () => {
    const response = await request(createTestApp())
      .patch(`/ti/requests/${requestId}/assign`)
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({ assigned_to_id: userId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: requestId,
        assigned_to_id: userId,
      },
    });
  });

  it("POST /ti/requests validates body", async () => {
    const response = await request(createTestApp())
      .post("/ti/requests")
      .set(gatewayHeaders(TI_ADMIN_PERMISSION))
      .send({
        title: "",
        description: "Equipamento nao inicia.",
        category_id: categoryId,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /ti/requests/:id/messages creates a message", async () => {
    const response = await request(createTestApp())
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({ message: "Estou verificando o chamado." });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        request_id: requestId,
        sender_id: userId,
        message: "Estou verificando o chamado.",
        organization_id: organizationId,
      },
    });
    expect(response.body.data).not.toHaveProperty("attachment");
  });

  it("POST /ti/requests/:id/messages persists a private key and returns a signed attachment URL", async () => {
    const objectPath = `ti/organizations/${organizationId}/requests/${requestId}/11111111-1111-4111-8111-111111111111.png`;
    const upload = vi.fn(async () => objectPath);
    const createSignedAccessUrl = vi.fn(
      async () => "https://storage.example/signed/request-image.png",
    );
    const prisma = createPrismaMock();
    const response = await request(
      createTestApp(prisma, { requestImageStorage: { upload, createSignedAccessUrl } }),
    )
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .field("message", "Segue a captura de tela.")
      .attach("file", validPng, { filename: "captura.png", contentType: "image/png" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        request_id: requestId,
        message: "Segue a captura de tela.",
        attachment: "https://storage.example/signed/request-image.png",
      },
    });
    expect(upload).toHaveBeenCalledWith({
      organizationId,
      requestId,
      file: expect.objectContaining({ mimetype: "image/png" }),
    });
    expect(createSignedAccessUrl).toHaveBeenCalledWith(objectPath);
    expect(prisma.tIMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ attachment: objectPath }),
    });
  });

  it("POST /ti/requests/:id/messages does not persist an invalid storage result", async () => {
    const upload = vi.fn(async () => "https://storage.example/public/request-image.png");
    const createSignedAccessUrl = vi.fn();
    const prisma = createPrismaMock();

    const response = await request(
      createTestApp(prisma, { requestImageStorage: { upload, createSignedAccessUrl } }),
    )
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .field("message", "A chave do storage precisa ser privada.")
      .attach("file", validPng, { filename: "captura.png", contentType: "image/png" });

    expect(response.status).toBe(500);
    expect(prisma.tIMessage.create).not.toHaveBeenCalled();
    expect(createSignedAccessUrl).not.toHaveBeenCalled();
  });

  it("POST /ti/requests/:id/messages rejects JSON URLs so external images are never persisted", async () => {
    const response = await request(createTestApp())
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .send({
        message: "Nao use este URL externo.",
        attachment: "https://tracking.example/pixel.png",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("GET /ti/requests/:id/messages exposes only signed URLs for private request paths", async () => {
    const objectPath = `ti/organizations/${organizationId}/requests/${requestId}/11111111-1111-4111-8111-111111111111.webp`;
    const createSignedAccessUrl = vi.fn(
      async () => "https://storage.example/signed/message-image.webp",
    );
    const prisma = createPrismaMock() as unknown as {
      tIMessage: { findMany: ReturnType<typeof vi.fn> };
    };
    prisma.tIMessage.findMany.mockResolvedValue([
      {
        id: "message-with-image",
        request_id: requestId,
        sender_id: userId,
        message: "Imagem privada.",
        attachment: objectPath,
        type: "Message",
        organization_id: organizationId,
      },
      {
        id: "legacy-external-image",
        request_id: requestId,
        sender_id: userId,
        message: "Imagem externa antiga.",
        attachment: "https://tracking.example/pixel.png",
        type: "Message",
        organization_id: organizationId,
      },
    ]);

    const response = await request(
      createTestApp(prisma as never, {
        requestImageStorage: { upload: vi.fn(), createSignedAccessUrl },
      }),
    )
      .get(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: "message-with-image",
        attachment: "https://storage.example/signed/message-image.webp",
      }),
      expect.objectContaining({
        id: "legacy-external-image",
        attachment: null,
      }),
    ]);
    expect(createSignedAccessUrl).toHaveBeenCalledTimes(1);
    expect(createSignedAccessUrl).toHaveBeenCalledWith(objectPath);
  });

  it("POST /ti/requests/:id/messages rejects GIF attachments", async () => {
    const response = await request(createTestApp())
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .field("message", "Imagem em formato nao permitido.")
      .attach("file", Buffer.from("GIF89a"), { filename: "captura.gif", contentType: "image/gif" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.",
      code: "BAD_REQUEST",
    });
  });

  it("POST /ti/requests/:id/messages rejects a PNG with an invalid signature", async () => {
    const response = await request(createTestApp())
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .field("message", "Imagem adulterada.")
      .attach("file", Buffer.from("not-a-png"), {
        filename: "captura.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "Assinatura do arquivo não corresponde ao tipo informado.",
      code: "BAD_REQUEST",
    });
  });

  it("POST /ti/requests/:id/messages rejects images above 5 MiB", async () => {
    const response = await request(createTestApp())
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .field("message", "Imagem grande demais.")
      .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "captura.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      success: false,
      error: "A imagem deve ter no máximo 5 MB.",
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("POST /ti/requests/:id/messages checks access before storing an image", async () => {
    const upload = vi.fn(async () => "ti/organizations/other/requests/other/image.png");
    const createSignedAccessUrl = vi.fn();
    const prisma = {
      tIRequest: {
        findFirst: vi.fn(async () => ({
          id: requestId,
          requester_id: otherUserId,
          organization_id: organizationId,
        })),
      },
      tIMessage: {
        create: vi.fn(),
      },
    };

    const response = await request(
      createTestApp(prisma as never, { requestImageStorage: { upload, createSignedAccessUrl } }),
    )
      .post(`/ti/requests/${requestId}/messages`)
      .set(gatewayHeaders(TI_REQUESTER_PERMISSION))
      .field("message", "Nao deveria enviar esta imagem.")
      .attach("file", validPng, { filename: "restrita.png", contentType: "image/png" });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: "Chamado de TI nao encontrado.",
      code: "NOT_FOUND",
    });
    expect(upload).not.toHaveBeenCalled();
    expect(createSignedAccessUrl).not.toHaveBeenCalled();
  });
});
