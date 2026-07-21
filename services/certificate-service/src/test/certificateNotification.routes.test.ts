import "./envBootstrap.js";

import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import {
  certificateGatewayHeaders,
  certificateOrganizationId,
  createCertificatePrismaMock,
  createCertificateTestApp,
} from "./testUtils.js";

describe("certificate notification routes", () => {
  it("GET /certificate/notifications requires bearer context", async () => {
    const app = createCertificateTestApp();

    const response = await request(app).get("/certificate/notifications");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("GET /certificate/notifications lists notifications for the authenticated organization", async () => {
    const prisma = createCertificatePrismaMock();
    const app = createCertificateTestApp(prisma);

    const response = await request(app)
      .get("/certificate/notifications")
      .set(certificateGatewayHeaders(1));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: [
        {
          certificate_id: "20000000-0000-4000-8000-000000000001",
          client_name: "Empresa Castelo",
          type: "PJ",
          organization_id: certificateOrganizationId,
        },
      ],
    });
    expect(prisma.certificateNotification.findMany).toHaveBeenCalledWith({
      where: { organization_id: certificateOrganizationId },
      orderBy: [{ date: "asc" }, { client_name: "asc" }],
      skip: 0,
      take: 50,
    });
  });

  it("GET /certificate/notifications rejects invalid pagination", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .get("/certificate/notifications?page_size=101")
      .set(certificateGatewayHeaders(1));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });

  it("POST /internal/notifications/run rejects missing internal token", async () => {
    const app = createCertificateTestApp();

    const response = await request(app).post("/internal/notifications/run");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("POST /internal/notifications/run rejects invalid internal token", async () => {
    const app = createCertificateTestApp();

    const response = await request(app)
      .post("/internal/notifications/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "invalid-token");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("POST /internal/notifications/run reconciles certificate notifications", async () => {
    const prisma = createCertificatePrismaMock();
    prisma.certificatePJ.findMany = vi.fn(async () => [
      {
        id: "20000000-0000-4000-8000-000000000001",
        name: "Empresa Castelo",
        expiration_date: new Date("2026-05-20T00:00:00.000Z"),
        organization_id: certificateOrganizationId,
      },
    ]) as never;
    prisma.certificatePF.findMany = vi.fn(async () => []) as never;
    Object.assign(prisma, {
      certificateNotification: {
        findMany: vi.fn(async () => []),
        upsert: vi.fn(async ({ create }) => ({
          id: "40000000-0000-4000-8000-000000000001",
          ...create,
        })),
      },
    });

    const app = createCertificateTestApp(prisma);

    const response = await request(app)
      .post("/internal/notifications/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "certificate-service-internal-token-test");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        evaluated: 1,
        created: 1,
        updated: 0,
      },
    });
  });
});
