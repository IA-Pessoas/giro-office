import { describe, expect, it } from "vitest";
import { createWorkerApp } from "./index.js";

describe("runtime worker", () => {
  it("returns a healthy status", async () => {
    const app = createWorkerApp({ service: "runtime" });
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "runtime",
    });
  });

  it("returns a ready status", async () => {
    const app = createWorkerApp({ service: "runtime" });
    const response = await app.request("/ready");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      service: "runtime",
    });
  });

  it("returns JSON for unknown routes", async () => {
    const app = createWorkerApp({ service: "runtime" });
    const response = await app.request("/missing");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("uses the supplied service name", async () => {
    const app = createWorkerApp({ service: "billing" });

    await expect((await app.request("/health")).json()).resolves.toEqual({
      status: "ok",
      service: "billing",
    });
    await expect((await app.request("/ready")).json()).resolves.toEqual({
      status: "ready",
      service: "billing",
    });
  });
});
