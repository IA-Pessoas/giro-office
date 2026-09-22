import { createCsrfToken, hashCsrfToken } from "@workspace/runtime";
import { describe, expect, it, vi } from "vitest";
import { createGatewayWorkerApp } from "./app.js";
import type { GatewayWorkerEnv } from "./env.js";

const SECRET = "gateway-worker-test-secret-with-enough-length";
const TOKEN = "gateway-internal-token";

function env(binding?: { fetch: ReturnType<typeof vi.fn> }): GatewayWorkerEnv {
  return {
    JWT_SECRET: SECRET,
    INTERNAL_SERVICE_TOKEN: TOKEN,
    DEPARTMENT_SERVICE: binding,
  };
}

function base64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function jwt(csrfHash?: string): Promise<string> {
  const payload = {
    user_id: "user-1",
    organization_id: "org-1",
    auth_kind: "organization",
    type: "owner",
    modules: { contabil: 2 },
    ...(csrfHash ? { csrf_hash: csrfHash } : {}),
  };
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

describe("gateway Worker", () => {
  it("serves health and counts configured bindings", async () => {
    const app = createGatewayWorkerApp({ env: env({ fetch: vi.fn() }) });
    expect(await (await app.request("https://gateway.test/health")).json()).toEqual({
      success: true,
      data: { status: "ok", service: "gateway" },
    });
    expect(await (await app.request("https://gateway.test/ready")).json()).toMatchObject({
      data: { services: 1 },
    });
  });

  it("rejects protected proxy calls without authentication", async () => {
    const binding = { fetch: vi.fn() };
    const app = createGatewayWorkerApp({ env: env(binding) });
    expect((await app.request("https://gateway.test/department")).status).toBe(401);
    expect(binding.fetch).not.toHaveBeenCalled();
  });

  it("forwards identity headers through the Service Binding", async () => {
    const binding = {
      fetch: vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    };
    const app = createGatewayWorkerApp({ env: env(binding) });
    const response = await app.request("https://gateway.test/department", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    expect(response.status).toBe(200);
    const forwarded = binding.fetch.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get("x-internal-service-token")).toBe(TOKEN);
    expect(forwarded.headers.get("x-auth-organization-id")).toBe("org-1");
  });

  it("requires CSRF for cookie mutations", async () => {
    const binding = { fetch: vi.fn(async () => new Response(null, { status: 204 })) };
    const csrf = await createCsrfToken();
    const app = createGatewayWorkerApp({ env: env(binding) });
    const response = await app.request("https://gateway.test/department", {
      method: "POST",
      headers: { cookie: `cw.session=${await jwt(await hashCsrfToken(csrf))}` },
    });
    expect(response.status).toBe(403);
    expect(binding.fetch).not.toHaveBeenCalled();
  });
});
