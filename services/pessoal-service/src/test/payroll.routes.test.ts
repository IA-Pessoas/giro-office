import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createPayrollRoutes } from "../routes/payroll.routes.js";
import {
  clientId,
  createRouteTestApp,
  gatewayHeaders,
  groupId,
  responsibleId,
  unionId,
} from "./pessoalCoreTestUtils.js";

const payrollBody = {
  client_id: clientId,
  responsible_id: responsibleId,
  advance: true,
  advance_type: null,
  advance_amount: 100,
  info: "Folha mensal",
  previous: false,
  onvio: true,
  group_id: groupId,
  vt: true,
  vt_value: 250,
  vt_type: null,
  va: false,
  assistance_fee: false,
  union_id: unionId,
  bem_mais: false,
  bsf: false,
  reinf: false,
  employees: 12,
  contact: null,
};

describe("payroll routes", () => {
  it("retorna sucesso com data null quando folha ainda nao existe", async () => {
    const service = { detail: vi.fn(async () => null) };
    const app = createRouteTestApp("/pessoal/payroll", createPayrollRoutes(service as never));

    const response = await request(app).get(`/pessoal/payroll/${clientId}`).set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: null });
  });

  it("rejeita client_id invalido em params", async () => {
    const app = createRouteTestApp(
      "/pessoal/payroll",
      createPayrollRoutes({ detail: vi.fn() } as never),
    );

    const response = await request(app).get("/pessoal/payroll/invalido").set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, code: "BAD_REQUEST" });
  });

  it("rejeita valores monetarios negativos antes do service", async () => {
    const service = {
      create: vi.fn(),
      update: vi.fn(),
    };
    const app = createRouteTestApp("/pessoal/payroll", createPayrollRoutes(service as never));

    const createResponse = await request(app)
      .post("/pessoal/payroll")
      .set(gatewayHeaders())
      .send({ ...payrollBody, advance_amount: -1 });
    const updateResponse = await request(app)
      .patch(`/pessoal/payroll/${clientId}`)
      .set(gatewayHeaders())
      .send({ vt_value: -1 });

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it("rejeita group_id nulo antes do service", async () => {
    const service = { update: vi.fn() };
    const app = createRouteTestApp("/pessoal/payroll", createPayrollRoutes(service as never));

    const response = await request(app)
      .patch(`/pessoal/payroll/${clientId}`)
      .set(gatewayHeaders())
      .send({ group_id: null });

    expect(response.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it("exige group_id em alteracoes", async () => {
    const service = { update: vi.fn() };
    const app = createRouteTestApp("/pessoal/payroll", createPayrollRoutes(service as never));

    const response = await request(app)
      .patch(`/pessoal/payroll/${clientId}`)
      .set(gatewayHeaders())
      .send({ info: "Novo prazo" });

    expect(response.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it("rejeita o grupo textual legado antes do service", async () => {
    const service = { create: vi.fn(), update: vi.fn() };
    const app = createRouteTestApp("/pessoal/payroll", createPayrollRoutes(service as never));

    const createResponse = await request(app)
      .post("/pessoal/payroll")
      .set(gatewayHeaders())
      .send({ ...payrollBody, group_id: undefined, group: "Grupo textual legado" });
    const updateResponse = await request(app)
      .patch(`/pessoal/payroll/${clientId}`)
      .set(gatewayHeaders())
      .send({ group: "Grupo textual legado" });

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });
});
