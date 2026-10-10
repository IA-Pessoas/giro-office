import "./envBootstrap.js";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { DTE_IMPORT_LIMITS } from "../services/dteImportParser.js";
import { DteImportService } from "../services/dteImportService.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

describe("dte routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("importa a colagem na organização e no usuário autenticados", async () => {
    const importNotices = vi
      .spyOn(DteImportService.prototype, "importNotices")
      .mockResolvedValue({ id: "import-1", created_count: 1 });

    const response = await request(createTestApp({} as PrismaClient))
      .post("/regularize/dte/import")
      .set(gatewayHeaders())
      .send({ format: "html", content: "<table></table>" });

    expect(response.status).toBe(201);
    expect(importNotices).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: "user-1",
      format: "html",
      content: "<table></table>",
    });
  });

  it("recusa a importação para quem só tem leitura", async () => {
    const importNotices = vi.spyOn(DteImportService.prototype, "importNotices");

    const response = await request(createTestApp({} as PrismaClient))
      .post("/regularize/dte/import")
      .set(gatewayHeaders({ permission: 1 }))
      .send({ format: "html", content: "<table></table>" });

    expect(response.status).toBe(403);
    expect(importNotices).not.toHaveBeenCalled();
  });

  it.each([
    ["formato desconhecido", { format: "xml", content: "x" }],
    ["conteúdo vazio", { format: "html", content: "" }],
    [
      "conteúdo acima do limite",
      { format: "html", content: "x".repeat(DTE_IMPORT_LIMITS.maxContentLength + 1) },
    ],
    ["campo extra", { format: "html", content: "x", organization_id: "outra" }],
  ])("rejeita %s", async (_name, body) => {
    const response = await request(createTestApp({} as PrismaClient))
      .post("/regularize/dte/import")
      .set(gatewayHeaders())
      .send(body);

    expect(response.status).toBe(400);
  });

  it("lista as importações paginadas para conferência", async () => {
    const page = { data: [], total: 0, page: 2, limit: 10, hasMore: false };
    const listImports = vi.spyOn(DteImportService.prototype, "listImports").mockResolvedValue(page);

    const response = await request(createTestApp({} as PrismaClient))
      .get("/regularize/dte/imports?page=2&limit=10")
      .set(gatewayHeaders({ permission: 1 }));

    expect(response.status).toBe(200);
    expect(listImports).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      page: 2,
      limit: 10,
    });
    expect(response.body).toEqual({ success: true, data: page });
  });
});
