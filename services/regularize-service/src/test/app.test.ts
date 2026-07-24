import "./envBootstrap.js";

import type { Request } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { regularizeServiceErrorLogContext } from "../app.js";
import { createTestApp } from "./regularizeTestUtils.js";

describe("regularize app", () => {
  it("GET /health returns the standard success envelope and security headers", async () => {
    const app = createTestApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: "ok",
        service: "regularize-service",
        env: "test",
      },
    });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("builds correlated error context", () => {
    const context = regularizeServiceErrorLogContext({
      requestId: "request-dashboard-1",
      method: "GET",
      originalUrl: "/regularize/dashboard?year=2026",
      user_id: "user-1",
      organization_id: "organization-1",
      permission: 10,
    } as Request);

    expect(context).toEqual({
      requestId: "request-dashboard-1",
      method: "GET",
      route: "/regularize/dashboard?year=2026",
      userId: "user-1",
      organizationId: "organization-1",
      permission: 10,
    });
  });
});
