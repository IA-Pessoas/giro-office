import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSituationRoutes } from "../routes/situation.routes.js";
import { createRouteTestApp, gatewayHeaders, recordId } from "./pessoalCoreTestUtils.js";

describe("situation routes", () => {
  it("rejeita UUID invalido em params", async () => {
    const app = createRouteTestApp(
      "/pessoal/situations",
      createSituationRoutes({ detail: vi.fn() } as never),
    );

    const response = await request(app).get("/pessoal/situations/invalido").set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: "BAD_REQUEST" });
  });

  it("retorna detalhe em envelope", async () => {
    const service = { detail: vi.fn(async () => ({ id: recordId, status: "Em andamento" })) };
    const app = createRouteTestApp("/pessoal/situations", createSituationRoutes(service as never));

    const response = await request(app)
      .get(`/pessoal/situations/${recordId}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { id: recordId, status: "Em andamento" },
    });
  });
});
