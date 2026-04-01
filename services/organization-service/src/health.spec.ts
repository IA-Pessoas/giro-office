import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("organization-service", () => {
  it("GET /health returns success envelope", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.service).toBe("organization-service");
    expect(res.body.data?.status).toBe("ok");
  });
});
