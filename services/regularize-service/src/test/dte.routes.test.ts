import "./envBootstrap.js";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { DTE_IMPORT_LIMITS } from "../services/dteImportParser.js";
import { DteImportService } from "../services/dteImportService.js";
import { DteNoticeService } from "../services/dteNoticeService.js";
import { DteQueryService } from "../services/dteQueryService.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const NOTICE_ID = "c0000000-0000-4000-8000-000000000001";
const QUERY_DATE = new Date("2026-10-09T00:00:00.000Z");

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

  it("lista os avisos com os filtros validados para quem tem leitura", async () => {
    const page = { data: [], total: 0, page: 1, limit: 20, hasMore: false };
    const list = vi.spyOn(DteNoticeService.prototype, "list").mockResolvedValue(page);

    const response = await request(createTestApp({} as PrismaClient))
      .get("/regularize/dte/notices")
      .query({
        from: "2026-09-01",
        tipo: "badge badge-important",
        search: " aviso ",
        reading: "Lido",
      })
      .set(gatewayHeaders({ permission: 1 }));

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      from: new Date("2026-09-01"),
      tipo: "badge badge-important",
      search: "aviso",
      reading: "Lido",
      page: 1,
      limit: 20,
    });
  });

  it.each([
    ["reading", "Talvez"],
    ["from", "ontem"],
    ["limit", "101"],
  ])("rejeita filtro %s inválido na lista de avisos", async (key, value) => {
    const response = await request(createTestApp({} as PrismaClient))
      .get("/regularize/dte/notices")
      .query({ [key]: value })
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
  });

  it("altera a leitura do aviso só com permissão de escrita", async () => {
    const setReading = vi
      .spyOn(DteNoticeService.prototype, "setReading")
      .mockResolvedValue({ id: NOTICE_ID, pending_reading: false });
    const app = createTestApp({} as PrismaClient);
    const body = { id: NOTICE_ID, pending_reading: false };

    const denied = await request(app)
      .put("/regularize/dte/notices/reading")
      .set(gatewayHeaders({ permission: 1 }))
      .send(body);
    const updated = await request(app)
      .put("/regularize/dte/notices/reading")
      .set(gatewayHeaders())
      .send(body);

    expect([denied.status, updated.status]).toEqual([403, 200]);
    expect(setReading).toHaveBeenCalledTimes(1);
    expect(setReading).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: "user-1",
      id: NOTICE_ID,
      pendingReading: false,
    });
  });

  it("mostra a grade de consultas do dia para quem tem leitura", async () => {
    const grid = {
      date: "2026-10-09",
      rows: [],
      totals: { feita: 0, nao_feita: 0, sem_registro: 0 },
    };
    const gridSpy = vi.spyOn(DteQueryService.prototype, "grid").mockResolvedValue(grid);
    const app = createTestApp({} as PrismaClient);

    const response = await request(app)
      .get("/regularize/dte/queries?date=2026-10-09")
      .set(gatewayHeaders({ permission: 1 }));
    const invalid = await request(app)
      .get("/regularize/dte/queries?date=2026-02-31")
      .set(gatewayHeaders());
    const missing = await request(app).get("/regularize/dte/queries").set(gatewayHeaders());

    expect([response.status, invalid.status, missing.status]).toEqual([200, 400, 400]);
    expect(gridSpy).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, date: QUERY_DATE });
    expect(response.body).toEqual({ success: true, data: grid });
  });

  it("altera a situação da consulta só com permissão de escrita", async () => {
    const setStatus = vi
      .spyOn(DteQueryService.prototype, "setStatus")
      .mockResolvedValue({ client_id: NOTICE_ID, date: "2026-10-09", status: "nao_feita" });
    const app = createTestApp({} as PrismaClient);
    const body = { client_id: NOTICE_ID, date: "2026-10-09", status: "nao_feita" };
    const put = (permission: number, payload: Record<string, unknown>) =>
      request(app)
        .put("/regularize/dte/queries/status")
        .set(gatewayHeaders({ permission }))
        .send(payload);

    const statuses = [
      (await put(1, body)).status,
      (await put(2, body)).status,
      (await put(2, { ...body, status: "talvez" })).status,
    ];

    expect(statuses).toEqual([403, 200, 400]);
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: "user-1",
      clientId: NOTICE_ID,
      date: QUERY_DATE,
      status: "nao_feita",
    });
  });

  it("registra as listas de consultas só com permissão de escrita", async () => {
    const importLists = vi.spyOn(DteQueryService.prototype, "importLists").mockResolvedValue({
      date: "2026-10-09",
      done_count: 1,
      not_done_count: 0,
      conflicts: [],
      unknown: [],
    });
    const app = createTestApp({} as PrismaClient);
    const body = { date: "2026-10-09", done: "11111111000111", not_done: "" };
    const post = (permission: number) =>
      request(app)
        .post("/regularize/dte/queries/import")
        .set(gatewayHeaders({ permission }))
        .send(body);

    expect([(await post(1)).status, (await post(2)).status]).toEqual([403, 201]);
    expect(importLists).toHaveBeenCalledTimes(1);
    expect(importLists).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: "user-1",
      date: QUERY_DATE,
      done: "11111111000111",
      notDone: "",
    });
  });
});
