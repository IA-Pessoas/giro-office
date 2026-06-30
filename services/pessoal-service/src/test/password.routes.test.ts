import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createPasswordRoutes } from "../routes/password.routes.js";
import { clientId, createRouteTestApp, gatewayHeaders, recordId } from "./pessoalCoreTestUtils.js";

describe("password routes", () => {
  it("lista senhas por client_id", async () => {
    const service = {
      list: vi.fn(async () => [{ id: recordId, client_id: clientId, service_name: "eSocial" }]),
    };
    const app = createRouteTestApp("/pessoal/passwords", createPasswordRoutes(service as never));

    const response = await request(app)
      .get(`/pessoal/passwords?client_id=${clientId}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [{ id: recordId, client_id: clientId, service_name: "eSocial" }],
    });
    expect(service.list).toHaveBeenCalledWith(
      { organizationId: expect.any(String) },
      { client_id: clientId },
    );
  });

  it("rejeita client_id invalido na listagem", async () => {
    const app = createRouteTestApp(
      "/pessoal/passwords",
      createPasswordRoutes({ list: vi.fn() } as never),
    );

    const response = await request(app)
      .get("/pessoal/passwords?client_id=invalido")
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: "BAD_REQUEST" });
  });

  it("detalha senha por id", async () => {
    const service = {
      detail: vi.fn(async () => ({ id: recordId, senha_main: "segredo" })),
    };
    const app = createRouteTestApp("/pessoal/passwords", createPasswordRoutes(service as never));

    const response = await request(app).get(`/pessoal/passwords/${recordId}`).set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { id: recordId, senha_main: "segredo" },
    });
    expect(service.detail).toHaveBeenCalledWith({ organizationId: expect.any(String) }, recordId);
  });

  it("cria senha com status 201", async () => {
    const service = {
      create: vi.fn(async () => ({ id: recordId, client_id: clientId, service_name: "eSocial" })),
    };
    const app = createRouteTestApp("/pessoal/passwords", createPasswordRoutes(service as never));

    const response = await request(app).post("/pessoal/passwords").set(gatewayHeaders()).send({
      client_id: clientId,
      service_name: "eSocial",
      login_main: "login",
      senha_main: "senha",
    });

    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: expect.any(String), userId: expect.any(String) }),
      expect.objectContaining({ client_id: clientId, service_name: "eSocial" }),
    );
  });

  it("rejeita PATCH sem campos alteraveis", async () => {
    const app = createRouteTestApp(
      "/pessoal/passwords",
      createPasswordRoutes({ update: vi.fn() } as never),
    );

    const response = await request(app)
      .patch(`/pessoal/passwords/${recordId}`)
      .set(gatewayHeaders())
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "Informe ao menos um campo para atualizar.",
    });
  });

  it("remove senha por id", async () => {
    const service = {
      delete: vi.fn(async () => ({ id: recordId })),
    };
    const app = createRouteTestApp("/pessoal/passwords", createPasswordRoutes(service as never));

    const response = await request(app)
      .delete(`/pessoal/passwords/${recordId}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { id: recordId } });
    expect(service.delete).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: expect.any(String), userId: expect.any(String) }),
      recordId,
    );
  });
});
