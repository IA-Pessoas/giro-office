import { createCsrfToken, hashCsrfToken } from "@workspace/runtime";
import {
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_SESSION_VERSION_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createGatewayWorkerApp } from "./app.js";
import type { GatewayWorkerEnv } from "./env.js";

const SECRET = "gateway-worker-test-secret-with-enough-length";
const TOKEN = "gateway-internal-token";

function env(
  binding?: { fetch: ReturnType<typeof vi.fn> },
  extras: Partial<GatewayWorkerEnv> = {},
): GatewayWorkerEnv {
  return {
    JWT_SECRET: SECRET,
    INTERNAL_SERVICE_TOKEN: TOKEN,
    DEPARTMENT_SERVICE: binding,
    ...extras,
  };
}

function base64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function signJwt(payload: Record<string, unknown>): Promise<string> {
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

async function jwt(csrfHash?: string, session?: Record<string, unknown>): Promise<string> {
  return signJwt({
    user_id: "user-1",
    organization_id: "org-1",
    auth_kind: "organization",
    type: "owner",
    modules: { contabil: 2 },
    ...(csrfHash ? { csrf_hash: csrfHash } : {}),
    ...session,
  });
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

  it("forwards only authenticated session claims and overwrites spoofed headers", async () => {
    const binding = {
      fetch: vi.fn(async () => new Response("ok", { status: 200 })),
    };
    const csrfHash = "a".repeat(64);
    const sessionToken = await jwt(csrfHash, {
      session_id: "gateway-session",
      session_version: 7,
    });
    const app = createGatewayWorkerApp({ env: env(undefined, { TI_SERVICE: binding }) });

    const response = await app.request("https://gateway.test/ti", {
      headers: {
        cookie: `cw.session=${sessionToken}`,
        [FORWARDED_AUTH_SESSION_ID_HEADER]: "spoofed-session",
        [FORWARDED_AUTH_SESSION_VERSION_HEADER]: "999",
        [FORWARDED_AUTH_CSRF_HASH_HEADER]: "f".repeat(64),
      },
    });

    expect(response.status).toBe(200);
    const forwarded = binding.fetch.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get(FORWARDED_AUTH_SESSION_ID_HEADER)).toBe("gateway-session");
    expect(forwarded.headers.get(FORWARDED_AUTH_SESSION_VERSION_HEADER)).toBe("7");
    expect(forwarded.headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER)).toBe(csrfHash);
  });

  it("routes the project and TI pilots through their bindings", async () => {
    const projectBinding = {
      fetch: vi.fn(async () => new Response("project", { status: 200 })),
    };
    const tiBinding = {
      fetch: vi.fn(async () => new Response("ti", { status: 200 })),
    };
    const rhBinding = {
      fetch: vi.fn(async () => new Response("rh", { status: 200 })),
    };
    const commercialBinding = {
      fetch: vi.fn(async () => new Response("commercial", { status: 200 })),
    };
    const triagemBinding = {
      fetch: vi.fn(async () => new Response("triagem", { status: 200 })),
    };
    const pessoalBinding = {
      fetch: vi.fn(async () => new Response("pessoal", { status: 200 })),
    };
    const regularizeBinding = {
      fetch: vi.fn(async () => new Response("regularize", { status: 200 })),
    };
    const app = createGatewayWorkerApp({
      env: env(undefined, {
        PROJECT_SERVICE: projectBinding,
        TI_SERVICE: tiBinding,
        RH_SERVICE: rhBinding,
        COMMERCIAL_SERVICE: commercialBinding,
        TRIAGEM_SERVICE: triagemBinding,
        PESSOAL_SERVICE: pessoalBinding,
        REGULARIZE_SERVICE: regularizeBinding,
      }),
    });

    const project = await app.request("https://gateway.test/project", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const ti = await app.request("https://gateway.test/ti", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const rh = await app.request("https://gateway.test/rh", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const commercial = await app.request("https://gateway.test/commercial", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const triagem = await app.request("https://gateway.test/triagem", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const pessoal = await app.request("https://gateway.test/pessoal", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const regularize = await app.request("https://gateway.test/regularize", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    expect(project.status).toBe(200);
    expect(ti.status).toBe(200);
    expect(rh.status).toBe(200);
    expect(commercial.status).toBe(200);
    expect(triagem.status).toBe(200);
    expect(pessoal.status).toBe(200);
    expect(regularize.status).toBe(200);
    expect(projectBinding.fetch).toHaveBeenCalledOnce();
    expect(tiBinding.fetch).toHaveBeenCalledOnce();
    expect(rhBinding.fetch).toHaveBeenCalledOnce();
    expect(commercialBinding.fetch).toHaveBeenCalledOnce();
    expect(triagemBinding.fetch).toHaveBeenCalledOnce();
    expect(pessoalBinding.fetch).toHaveBeenCalledOnce();
    expect(regularizeBinding.fetch).toHaveBeenCalledOnce();
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
