import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createObligationRoutes } from "../routes/obligation.routes.js";
import { createRouteTestApp, gatewayHeaders, recordId } from "./pessoalCoreTestUtils.js";

describe("obligation routes", () => {
  it("rejeita competencia invalida", async () => {
    const app = createRouteTestApp(
      "/pessoal/obrigations",
      createObligationRoutes({ generateForCompetence: vi.fn() } as never),
    );

    const response = await request(app)
      .post("/pessoal/obrigations/competences/202606/generate")
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: "BAD_REQUEST" });
  });

  it("rejeita atualizacao de mais de um campo", async () => {
    const app = createRouteTestApp(
      "/pessoal/obrigations",
      createObligationRoutes({ updateField: vi.fn() } as never),
    );

    const response = await request(app)
      .patch(`/pessoal/obrigations/${recordId}`)
      .set(gatewayHeaders())
      .send({ payroll: true, charges: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: "Informe exatamente um campo para atualizar.",
    });
  });
});
