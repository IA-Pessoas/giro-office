import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  certificateGatewayHeaders,
  certificateGatewayHeadersWithoutPermission,
  certificateOrganizationId,
  createCertificatePrismaMock,
  createCertificateTestApp,
} from "./testUtils.js";

const certificateId = "20000000-0000-4000-8000-000000000001";

describe("certificate PJ routes", () => {
  it("GET /certificate/pj/list requires bearer context", async () => {
    const app = createCertificateTestApp();

    const response = await request(app).get("/certificate/pj/list");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("GET /certificate/pj/list requires certificate permission", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get("/certificate/pj/list")
      .set(certificateGatewayHeadersWithoutPermission());

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("GET /certificate/pj/list returns list without password", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get("/certificate/pj/list")
      .set(certificateGatewayHeaders(1));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data[0]).not.toHaveProperty("password");
  });

  it("GET /certificate/pj/:id returns password for permission certificado 2", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(2));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.password).toBe("secret-password");
  });

  it("POST /certificate/pj preserves explicit string false booleans", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "20000000-0000-4000-8000-000000000002",
          ...data,
        }),
      },
    };
    const app = createCertificateTestApp(prisma as never);

    const response = await request(app)
      .post("/certificate/pj")
      .set(certificateGatewayHeaders(2))
      .send({
        client_castelo_status: "false",
        client_focus_status: "false",
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        responsible: "Maria Silva",
        model: "A1",
        legal_nature: "LTDA",
        password: "secret-password",
        expiration_date: "2026-12-31T00:00:00.000Z",
        was_paid: "false",
        has_certificate: "false",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      client_castelo_status: false,
      client_focus_status: false,
      was_paid: false,
      has_certificate: false,
      organization_id: certificateOrganizationId,
    });
  });

  it("POST /certificate/pj rejects invalid boolean strings", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post("/certificate/pj")
      .set(certificateGatewayHeaders(2))
      .send({
        client_castelo_status: "abc",
        client_focus_status: false,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        responsible: "Maria Silva",
        model: "A1",
        legal_nature: "LTDA",
        password: "secret-password",
        expiration_date: "2026-12-31T00:00:00.000Z",
        was_paid: false,
        has_certificate: true,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /certificate/pj returns 403 without elevated permission", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .post("/certificate/pj")
      .set(certificateGatewayHeaders(1))
      .send({
        client_castelo_status: true,
        client_focus_status: false,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        responsible: "Maria Silva",
        model: "A1",
        legal_nature: "LTDA",
        password: "secret-password",
        expiration_date: "2026-12-31T00:00:00.000Z",
        was_paid: true,
        has_certificate: true,
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("PATCH /certificate/pj/:id returns 403 without elevated permission", async () => {
    const app = createCertificateTestApp(createCertificatePrismaMock());

    const response = await request(app)
      .patch(`/certificate/pj/${certificateId}`)
      .set(certificateGatewayHeaders(1))
      .send({ notes: "Atualizado" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });
});
