import { describe, expect, it } from "vitest";
import type { ClientWorkerEnv } from "./app.js";
import { authenticateClientRequest } from "./auth.js";

const INTERNAL_TOKEN = "client-gateway-internal-token";
const SESSION_JWT = "header.payload.signature";

describe("authenticateClientRequest", () => {
  it("revalidates a gateway-forwarded browser session with the cookie JWT", async () => {
    const validations: Request[] = [];
    const env = {
      JWT_SECRET: "client-worker-test-secret-which-is-long-enough",
      INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
      USER_SERVICE_INTERNAL_TOKEN: "user-service-internal-token",
      USER_SERVICE: {
        fetch: async (request: Request) => {
          validations.push(request);
          return Response.json({ success: true, data: { valid: true } });
        },
      },
    } as unknown as ClientWorkerEnv;
    const request = new Request("https://client.internal/client/list", {
      headers: {
        cookie: `cw.session=${SESSION_JWT}; cw.csrf=csrf`,
        "x-internal-service-token": INTERNAL_TOKEN,
        "x-auth-user-id": "c0000000-0000-4000-8000-000000000001",
        "x-auth-organization-id": "a0000000-0000-4000-8000-000000000001",
        "x-auth-kind": "organization",
        "x-auth-session-id": "f0000000-0000-4000-8000-000000000001",
        "x-auth-session-version": "0",
        "x-auth-csrf-hash": "a".repeat(64),
      },
    });

    await authenticateClientRequest(request, env);

    expect(validations).toHaveLength(1);
    expect(validations[0].headers.get("authorization")).toBe(`Bearer ${SESSION_JWT}`);
  });
});
