import "./envBootstrap.js";

import { ServiceError } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createUnionRoutes } from "../routes/union.routes.js";
import {
  createRouteTestApp,
  gatewayHeaders,
  organizationId,
  unionId,
} from "./pessoalCoreTestUtils.js";

describe("union routes", () => {
  it("lista sindicatos em envelope", async () => {
    const service = { list: vi.fn(async () => []) };
    const app = createRouteTestApp("/pessoal/unions", createUnionRoutes(service as never));

    const response = await request(app).get("/pessoal/unions").set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
    expect(service.list).toHaveBeenCalledWith(
      { organizationId },
      { search: "", page: 1, limit: 20, paginationRequested: false },
    );
  });

  it("pagina busca de sindicatos", async () => {
    const service = {
      list: vi.fn(async () => ({
        data: [{ id: "union-21", name: "Metalúrgicos" }],
        total: 21,
        page: 2,
        limit: 20,
        hasMore: false,
      })),
    };
    const app = createRouteTestApp("/pessoal/unions", createUnionRoutes(service as never));

    const response = await request(app)
      .get("/pessoal/unions")
      .query({ search: "metal", page: "2", limit: "20" })
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(21);
    expect(service.list).toHaveBeenCalledWith(
      { organizationId },
      { search: "metal", page: 2, limit: 20, paginationRequested: true },
    );
  });

  it("rejeita limite invalido", async () => {
    const service = { list: vi.fn() };
    const app = createRouteTestApp("/pessoal/unions", createUnionRoutes(service as never));

    const response = await request(app)
      .get("/pessoal/unions")
      .query({ limit: "101" })
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("remove sindicato em envelope", async () => {
    const deletedUnion = { id: unionId, name: "Metalurgicos" };
    const service = { delete: vi.fn(async () => deletedUnion) };
    const app = createRouteTestApp("/pessoal/unions", createUnionRoutes(service as never));

    const response = await request(app).delete(`/pessoal/unions/${unionId}`).set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: deletedUnion });
    expect(service.delete).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      unionId,
    );
  });

  it("rejeita id de sindicato invalido antes de chamar a exclusao", async () => {
    const service = { delete: vi.fn() };
    const app = createRouteTestApp("/pessoal/unions", createUnionRoutes(service as never));

    const response = await request(app).delete("/pessoal/unions/id-invalido").set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(service.delete).not.toHaveBeenCalled();
  });

  it("encaminha conflito da exclusao para o envelope de erro", async () => {
    const service = {
      delete: vi.fn(async () => {
        throw new ServiceError(409, "Sindicato vinculado a folha.");
      }),
    };
    const app = createRouteTestApp("/pessoal/unions", createUnionRoutes(service as never));

    const response = await request(app).delete(`/pessoal/unions/${unionId}`).set(gatewayHeaders());

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, error: "Sindicato vinculado a folha." });
  });
});
