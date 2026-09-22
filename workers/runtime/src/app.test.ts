import { describe, expect, expectTypeOf, it } from "vitest";
import type { WorkerBindings } from "./index.js";
import { createWorkerApp, forwardToService } from "./index.js";

describe("runtime worker", () => {
  it("forwards the original request to a declared service binding", async () => {
    const received: Request[] = [];
    const bindings: WorkerBindings<"USER_SERVICE", "JWT_SECRET"> = {
      USER_SERVICE: {
        fetch: async (input) => {
          if (!(input instanceof Request)) {
            throw new Error("expected the original Request");
          }
          received.push(input);
          return new Response("forwarded");
        },
      },
      JWT_SECRET: "secret",
    };
    const request = new Request("https://internal.example/users", {
      method: "POST",
      headers: {
        "x-request-id": "request-123",
        "x-auth-user-id": "user-456",
      },
      body: "request-body",
    });

    const response = await forwardToService(bindings, "USER_SERVICE", request);

    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(request);
    expect(received[0].url).toBe("https://internal.example/users");
    expect(received[0].method).toBe("POST");
    expect(received[0].headers.get("x-request-id")).toBe("request-123");
    expect(received[0].headers.get("x-auth-user-id")).toBe("user-456");
    await expect(received[0].text()).resolves.toBe("request-body");

    expectTypeOf(() => {
      // @ts-expect-error undeclared service bindings must fail typecheck
      return forwardToService(bindings, "UNKNOWN_SERVICE", request);
    }).returns.toEqualTypeOf<Promise<Response>>();
  });

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
