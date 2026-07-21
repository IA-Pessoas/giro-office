import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createPayrollRoutes } from "../routes/payroll.routes.js";
import { createRouteTestApp, gatewayHeaders } from "./pessoalCoreTestUtils.js";

describe("payroll routes", () => {
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
