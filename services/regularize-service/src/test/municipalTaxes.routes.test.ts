import "./envBootstrap.js";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { MunicipalTaxesService } from "../services/municipalTaxesService.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

const municipalTaxesPage = {
  data: [],
  total: 0,
  page: 2,
  limit: 20,
  hasMore: false,
};

describe("municipal taxes routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards validated municipal tax filters and pagination to the service", async () => {
    const list = vi
      .spyOn(MunicipalTaxesService.prototype, "list")
      .mockResolvedValue(municipalTaxesPage);
    const app = createTestApp({} as PrismaClient);

    const response = await request(app)
      .get("/regularize/municipal-taxes?year=2026&search=Castelo&status=Criado&page=2&limit=20")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({
      organizationId: "a0000000-0000-4000-8000-000000000001",
      year: 2026,
      search: "Castelo",
      status: "Criado",
      page: 2,
      limit: 20,
    });
    expect(response.body).toEqual({ success: true, data: municipalTaxesPage });
  });

  it.each([
    ["status", "Invalido"],
    ["page", "0"],
    ["limit", "101"],
  ])("rejects invalid %s query values", async (key, value) => {
    const app = createTestApp({} as PrismaClient);

    const response = await request(app)
      .get("/regularize/municipal-taxes")
      .query({ year: "2026", [key]: value })
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
  });
});
