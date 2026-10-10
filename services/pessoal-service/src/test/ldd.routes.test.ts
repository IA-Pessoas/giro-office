import "./envBootstrap.js";

import { ServiceError } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createLddRoutes } from "../routes/ldd.routes.js";
import { LDD_PDF_MAX_BASE64_LENGTH, previewLddImportBodySchema } from "../schemas/ldd.schemas.js";
import {
  clientId,
  createRouteTestApp,
  gatewayHeaders,
  organizationId,
  recordId,
  userId,
} from "./pessoalCoreTestUtils.js";

describe("LDD routes", () => {
  it("retorna envelope e repassa organizationId e userId", async () => {
    const service = {
      list: vi.fn(async () => [{ id: recordId, client_id: clientId }]),
    };
    const app = createRouteTestApp("/pessoal/ldd", createLddRoutes(service as never));

    const response = await request(app)
      .get(`/pessoal/ldd?client_id=${clientId}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [{ id: recordId, client_id: clientId }],
    });
    expect(service.list).toHaveBeenCalledWith({ organizationId }, { client_id: clientId });
  });

  it("permite listar LDD sem filtro de cliente", async () => {
    const service = {
      list: vi.fn(async () => [{ id: recordId, client_id: clientId }]),
    };
    const app = createRouteTestApp("/pessoal/ldd", createLddRoutes(service as never));

    const response = await request(app).get("/pessoal/ldd").set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [{ id: recordId, client_id: clientId }],
    });
    expect(service.list).toHaveBeenCalledWith({ organizationId }, {});
  });

  it("rejeita UUID invalido na query", async () => {
    const app = createRouteTestApp("/pessoal/ldd", createLddRoutes({ list: vi.fn() } as never));

    const response = await request(app)
      .get("/pessoal/ldd?client_id=invalido")
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: "BAD_REQUEST" });
  });

  it("serializa ServiceError vindo do service", async () => {
    const service = {
      update: vi.fn(async () => {
        throw new ServiceError(409, "LDD duplicado.");
      }),
    };
    const app = createRouteTestApp("/pessoal/ldd", createLddRoutes(service as never));

    const response = await request(app)
      .patch(`/pessoal/ldd/${recordId}`)
      .set(gatewayHeaders())
      .send({ status: "Regular" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: "LDD duplicado.",
      code: "CONFLICT",
    });
    expect(service.update).toHaveBeenCalledWith(
      { organizationId, userId, permission: 2, requestId: expect.any(String) },
      recordId,
      { status: "Regular" },
    );
  });

  it("rejeita saldo negativo antes do service", async () => {
    const service = {
      create: vi.fn(),
      update: vi.fn(),
    };
    const app = createRouteTestApp("/pessoal/ldd", createLddRoutes(service as never));

    const createResponse = await request(app).post("/pessoal/ldd").set(gatewayHeaders()).send({
      client_id: clientId,
      type: "INSS",
      balance_amount: -1,
    });
    const updateResponse = await request(app)
      .patch(`/pessoal/ldd/${recordId}`)
      .set(gatewayHeaders())
      .send({ balance_amount: -1 });

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });
  it("devolve a prévia do PDF LDD e valida o corpo antes do service", async () => {
    const preview = { file_name: "ldd.pdf", rows: [] };
    const service = { previewImport: vi.fn(async () => preview) };
    const app = createRouteTestApp("/pessoal/ldd", createLddRoutes(service as never));
    const body = { client_id: clientId, file_name: "ldd.pdf", content_base64: "JVBERi0=" };

    const response = await request(app)
      .post("/pessoal/ldd/import/preview")
      .set(gatewayHeaders())
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: preview });
    expect(service.previewImport).toHaveBeenCalledWith(
      { organizationId, userId, permission: 2, requestId: expect.any(String) },
      body,
    );

    for (const invalid of [
      { ...body, client_id: "invalido" },
      { ...body, content_base64: "não é base64" },
      { ...body, file_name: "" },
      { ...body, extra: true },
    ]) {
      const rejected = await request(app)
        .post("/pessoal/ldd/import/preview")
        .set(gatewayHeaders())
        .send(invalid);
      expect(rejected.status).toBe(400);
    }
    expect(service.previewImport).toHaveBeenCalledTimes(1);
  });

  it("barra no schema o PDF acima de 700 KB", () => {
    const body = { client_id: clientId, file_name: "ldd.pdf" };
    const parse = (length: number) =>
      previewLddImportBodySchema.safeParse({ ...body, content_base64: "A".repeat(length) });

    expect(parse(LDD_PDF_MAX_BASE64_LENGTH).success).toBe(true);
    expect(parse(LDD_PDF_MAX_BASE64_LENGTH + 4).error?.issues[0]?.message).toBe(
      "O PDF excede o limite de 700 KB.",
    );
  });
});
