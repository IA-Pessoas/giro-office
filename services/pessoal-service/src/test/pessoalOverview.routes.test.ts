import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createPessoalOverviewRoutes } from "../routes/pessoalOverview.routes.js";
import { createRouteTestApp, gatewayHeaders } from "./pessoalCoreTestUtils.js";

describe("pessoal overview routes", () => {
  it("retorna resumo consolidado para a visao geral", async () => {
    const service = {
      getSummary: vi.fn(async () => ({
        unions: { total: 3, withBaseDate: 2, withoutBaseDate: 1, withCnpj: 1 },
        ldd: { total: 11, open: 5, overdue: 2, paid: 4 },
      })),
    };
    const app = createRouteTestApp("/pessoal/overview", createPessoalOverviewRoutes(service));

    const response = await request(app).get("/pessoal/overview").set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        unions: { total: 3, withBaseDate: 2, withoutBaseDate: 1, withCnpj: 1 },
        ldd: { total: 11, open: 5, overdue: 2, paid: 4 },
      },
    });
  });
});
