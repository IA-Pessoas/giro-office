import "./envBootstrap.js";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { GroupMapService } from "../services/groupMapService.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const GROUP_ID = "d0000000-0000-4000-8000-000000000001";

describe("group map routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gera o mapa do grupo na organização de quem consulta, com permissão de leitura", async () => {
    const map = { group: { id: GROUP_ID, name: "Grupo Um" }, cities: [] };
    const generate = vi.spyOn(GroupMapService.prototype, "generate").mockResolvedValue(map);

    const response = await request(createTestApp({} as PrismaClient))
      .get(`/regularize/groups/${GROUP_ID}/map`)
      .set(gatewayHeaders({ permission: 1 }));

    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, groupId: GROUP_ID });
    expect(response.body).toEqual({ success: true, data: map });
  });

  it("recusa quem não tem acesso ao Regularize", async () => {
    const generate = vi.spyOn(GroupMapService.prototype, "generate");

    const response = await request(createTestApp({} as PrismaClient))
      .get(`/regularize/groups/${GROUP_ID}/map`)
      .set(gatewayHeaders({ permission: 0 }));

    expect(response.status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });

  it("recusa id que não é de grupo", async () => {
    const generate = vi.spyOn(GroupMapService.prototype, "generate");

    const response = await request(createTestApp({} as PrismaClient))
      .get("/regularize/groups/abc/map")
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
});
