import "./envBootstrap.js";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { VeriComparisonService } from "../services/veriComparisonService.js";
import { VERI_LIMITS, VERI_XLSX_MIME_TYPE } from "../services/veriWorkbookParser.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";
import { veriWorkbook } from "./veriFixtures.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

describe("veri routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("compara o XLSX na organização autenticada", async () => {
    const comparison = { rows: [], invalid: [], totals: {} };
    const compare = vi
      .spyOn(VeriComparisonService.prototype, "compare")
      .mockResolvedValue(comparison as never);
    const file = veriWorkbook([["a"], ["b"], ["Alfa", "", "11222333000181"]]);

    const response = await request(createTestApp({} as PrismaClient))
      .post("/regularize/veri/compare")
      .set(gatewayHeaders())
      .set("content-type", VERI_XLSX_MIME_TYPE)
      .send(file);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({ success: true, data: comparison });
    expect(compare).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, file });
  });

  it("devolve correspondências, ausências e inválidas de ponta a ponta", async () => {
    const findMany = vi.fn().mockResolvedValue([{ name: "Alfa", cpf_cnpj: "11222333000181" }]);

    const response = await request(createTestApp({ client: { findMany } } as never))
      .post("/regularize/veri/compare")
      .set(gatewayHeaders())
      .set("content-type", VERI_XLSX_MIME_TYPE)
      .send(veriWorkbook([["a"], ["b"], ["Alfa", "", "11.222.333/0001-81"], ["Beta", "", "123"]]));

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toMatchObject({ both: 1, veri_only: 0, invalid: 1 });
    expect(findMany.mock.calls[0]?.[0].where.organization_id).toBe(ORGANIZATION_ID);
  });

  it("recusa quem não está autenticado, outro tipo de conteúdo e arquivo acima do limite", async () => {
    const compare = vi.spyOn(VeriComparisonService.prototype, "compare");
    const app = createTestApp({} as PrismaClient);

    await request(app)
      .post("/regularize/veri/compare")
      .set("content-type", VERI_XLSX_MIME_TYPE)
      .send(Buffer.from([1]))
      .expect(401);
    // Como todo POST do módulo, pede permissão de escrita.
    await request(app)
      .post("/regularize/veri/compare")
      .set(gatewayHeaders({ permission: 1 }))
      .set("content-type", VERI_XLSX_MIME_TYPE)
      .send(Buffer.from([1]))
      .expect(403);
    await request(app)
      .post("/regularize/veri/compare")
      .set(gatewayHeaders())
      .send({ file: "x" })
      .expect(415);
    await request(app)
      .post("/regularize/veri/compare")
      .set(gatewayHeaders())
      .set("content-type", VERI_XLSX_MIME_TYPE)
      .send(Buffer.alloc(VERI_LIMITS.bytes + 1))
      .expect(413);

    expect(compare).not.toHaveBeenCalled();
  });
});
