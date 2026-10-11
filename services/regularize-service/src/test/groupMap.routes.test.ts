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

  it("lê a versão salva com permissão de leitura, inclusive quando não existe", async () => {
    const getSaved = vi.spyOn(GroupMapService.prototype, "getSaved").mockResolvedValue(null);

    const response = await request(createTestApp({} as PrismaClient))
      .get(`/regularize/groups/${GROUP_ID}/map/saved`)
      .set(gatewayHeaders({ permission: 1 }));

    expect(response.status).toBe(200);
    expect(getSaved).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, groupId: GROUP_ID });
    expect(response.body).toEqual({ success: true, data: null });
  });

  it("salva o mapa editado só com permissão de escrita", async () => {
    const tree = { id: "raiz", lines: ["Grupo Um"], color: "#ffff00", children: [] };
    const save = vi.spyOn(GroupMapService.prototype, "save").mockResolvedValue({
      tree,
      updated_at: new Date("2026-10-10T12:00:00.000Z"),
      updated_by_user_id: "user-1",
    });
    const app = createTestApp({} as PrismaClient);
    const put = (permission: number, body: unknown) =>
      request(app)
        .put(`/regularize/groups/${GROUP_ID}/map/saved`)
        .set(gatewayHeaders({ permission }))
        .send(body as object);

    const statuses = [
      (await put(1, { tree })).status,
      (await put(2, { tree })).status,
      (await put(2, { tree: { ...tree, color: "red" } })).status,
      (await put(2, {})).status,
    ];

    expect(statuses).toEqual([403, 200, 400, 400]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: "user-1",
      groupId: GROUP_ID,
      tree,
    });
  });
});
