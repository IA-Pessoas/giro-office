import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createGroupRoutes } from "../routes/group.routes.js";
import { createRouteTestApp, gatewayHeaders, recordId } from "./pessoalCoreTestUtils.js";

describe("group routes", () => {
  it("lista grupos para Pessoal >= 1", async () => {
    const service = { list: vi.fn(async () => []) };
    const app = createRouteTestApp("/pessoal/groups", createGroupRoutes(service as never));

    const response = await request(app).get("/pessoal/groups").set(gatewayHeaders(1));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ permission: 1 }));
  });

  it("valida nome antes de criar grupo", async () => {
    const service = { create: vi.fn() };
    const app = createRouteTestApp("/pessoal/groups", createGroupRoutes(service as never));

    const response = await request(app)
      .post("/pessoal/groups")
      .set(gatewayHeaders())
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("arquiva grupo sem exclusao fisica", async () => {
    const service = { archive: vi.fn(async () => ({ id: recordId, archived_at: "now" })) };
    const app = createRouteTestApp("/pessoal/groups", createGroupRoutes(service as never));

    const response = await request(app).delete(`/pessoal/groups/${recordId}`).set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { id: recordId } });
    expect(service.archive).toHaveBeenCalledWith(expect.any(Object), recordId);
  });
});
