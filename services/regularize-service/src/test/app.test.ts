import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it } from "vitest";

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
});
