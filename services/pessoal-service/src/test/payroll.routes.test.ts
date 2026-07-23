import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createPayrollRoutes } from "../routes/payroll.routes.js";
import { clientId, createRouteTestApp, gatewayHeaders } from "./pessoalCoreTestUtils.js";

describe("payroll routes", () => {
  it("retorna sucesso com data null quando folha ainda nao existe", async () => {
    const service = { detail: vi.fn(async () => null) };
    const app = createRouteTestApp("/pessoal/payroll", createPayrollRoutes(service as never));

    const response = await request(app)
      .get(`/pessoal/payroll/${clientId}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: null });
  });

  it("rejeita client_id invalido em params", async () => {
    const app = createRouteTestApp(
      "/pessoal/payroll",
      createPayrollRoutes({ detail: vi.fn() } as never),
    );

    const response = await request(app).get("/pessoal/payroll/invalido").set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: "BAD_REQUEST" });
  });
});
