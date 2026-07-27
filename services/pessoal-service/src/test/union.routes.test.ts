import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createUnionRoutes } from "../routes/union.routes.js";
import { createRouteTestApp, gatewayHeaders, organizationId } from "./pessoalCoreTestUtils.js";

describe("union routes", () => {
  it("lista sindicatos em envelope", async () => {
    const service = { list: vi.fn(async () => []) };
    const app = createRouteTestApp("/pessoal/unions", createUnionRoutes(service as never));

    const response = await request(app).get("/pessoal/unions").set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
    expect(service.list).toHaveBeenCalledWith({ organizationId });
  });
});
