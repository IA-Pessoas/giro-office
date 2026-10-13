import { hashCsrfToken } from "@workspace/runtime";
import {
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_SESSION_VERSION_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createGatewayWorkerApp } from "../../gateway/src/app.js";
import type { GatewayWorkerEnv } from "../../gateway/src/env.js";
import { createTiWorkerApp, type TiCategoryService, type TiWorkerEnv } from "./app.js";

const GATEWAY_SECRET = "gateway-secret-for-ti-integration";
const TI_SECRET = "different-ti-secret-for-forwarded-auth";
const INTERNAL_TOKEN = "gateway-ti-internal-token";
const AUDIT_TOKEN = "gateway-ti-audit-token";
const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "c0000000-0000-4000-8000-000000000001";
const REQUEST_ID = "e0000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "e0000000-0000-4000-8000-000000000002";
const TERM_ID = "f0000000-0000-4000-8000-000000000001";

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function signSession(claims: Record<string, unknown>): Promise<string> {
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(GATEWAY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
}

function makeCategoryService(): TiCategoryService {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: CATEGORY_ID, name: "Notebook" })),
    update: vi.fn(async () => ({ id: CATEGORY_ID, name: "Notebook" })),
  };
}

function tiEnv(userService?: {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}) {
  return {
    JWT_SECRET: TI_SECRET,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    ...(userService
      ? { USER_SERVICE_INTERNAL_TOKEN: "user-service-token", USER_SERVICE: userService }
      : {}),
  } as TiWorkerEnv;
}

function gatewayEnv(ti: {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}) {
  return {
    JWT_SECRET: GATEWAY_SECRET,
    INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN,
    // O gateway recusa com 503 sem auditoria, e exige token distinto do interno.
    AUDIT_SERVICE_TOKEN: AUDIT_TOKEN,
    AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 201 })) },
    TI_SERVICE: ti,
  } as GatewayWorkerEnv;
}

describe("Gateway to TI Worker session contract", () => {
  it("accepts a correct cookie CSRF through the gateway with distinct session claims", async () => {
    const csrf = "A".repeat(43);
    const token = await signSession({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      type: "owner",
      modules: { ti: 3 },
      permission: 3,
      session_id: "gateway-session-a",
      session_version: 7,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const categoryService = makeCategoryService();
    const userService = {
      fetch: vi.fn(
        async (request: Request) =>
          new Response(null, {
            status: request.headers.get("authorization") === `Bearer ${token}` ? 204 : 401,
          }),
      ),
    };
    const tiApp = createTiWorkerApp({ env: tiEnv(userService), categoryService });
    let forwardedRequest: Request | undefined;
    const gatewayApp = createGatewayWorkerApp({
      env: gatewayEnv({
        fetch: (input, init) => {
          forwardedRequest = new Request(input, init);
          return tiApp.fetch(forwardedRequest);
        },
      }),
    });

    const response = await gatewayApp.request("https://gateway.test/ti/inventory-categories", {
      method: "POST",
      headers: {
        cookie: `cw.session=${token}; cw.csrf=${csrf}`,
        "x-csrf-token": csrf,
        "content-type": "application/json",
        [FORWARDED_AUTH_SESSION_ID_HEADER]: "client-spoof",
      },
      body: JSON.stringify({ name: "Notebook" }),
    });

    expect(response.status).toBe(201);
    expect(categoryService.create).toHaveBeenCalledOnce();
    expect(userService.fetch).toHaveBeenCalledOnce();
    expect(forwardedRequest?.headers.get(FORWARDED_AUTH_SESSION_ID_HEADER)).toBe(
      "gateway-session-a",
    );
    expect(forwardedRequest?.headers.get(FORWARDED_AUTH_SESSION_VERSION_HEADER)).toBe("7");
    expect(forwardedRequest?.headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER)).toBe(
      await hashCsrfToken(csrf),
    );

    const read = await gatewayApp.request("https://gateway.test/ti/inventory-categories/list", {
      headers: { cookie: `cw.session=${token}` },
    });
    expect(read.status).toBe(200);
    expect(categoryService.list).toHaveBeenCalledOnce();
    expect(userService.fetch).toHaveBeenCalledTimes(2);
  });

  // #1929: abrir chamado, responder e assinar o próprio termo são do TI nível 1.
  it("lets TI level 1 use self-service through the gateway and blocks management", async () => {
    const csrf = "D".repeat(43);
    const token = await signSession({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      type: "user",
      modules: { ti: 1 },
      permission: 1,
      session_id: "gateway-session-self-service",
      session_version: 1,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const requests = {
      create: vi.fn(async () => ({ id: REQUEST_ID })),
      createMessage: vi.fn(async () => ({ id: MESSAGE_ID })),
      updateStatus: vi.fn(async () => ({ id: REQUEST_ID })),
    };
    const terms = {
      create: vi.fn(async () => ({ id: TERM_ID })),
      sign: vi.fn(async () => ({ id: TERM_ID })),
    };
    const userService = { fetch: vi.fn(async () => new Response(null, { status: 204 })) };
    const tiApp = createTiWorkerApp({
      env: tiEnv(userService),
      services: { requests, terms },
    } as never);
    const tiBinding = {
      fetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        tiApp.fetch(new Request(input, init)),
      ),
    };
    const gatewayApp = createGatewayWorkerApp({ env: gatewayEnv(tiBinding) });
    const send = (method: string, path: string, body: unknown) =>
      gatewayApp.request(`https://gateway.test${path}`, {
        method,
        headers: {
          cookie: `cw.session=${token}; cw.csrf=${csrf}`,
          "x-csrf-token": csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const self = {
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      permission: 1,
      isOrganizationOwner: false,
    };

    const created = await send("POST", "/ti/requests", {
      title: "Monitor sem imagem",
      description: "O monitor não liga.",
      category_id: CATEGORY_ID,
      anydesk_code: "123456789",
    });
    const message = await send("POST", `/ti/requests/${REQUEST_ID}/messages`, {
      message: "Segue o detalhe.",
    });
    const signed = await send("PATCH", `/ti/terms/${TERM_ID}/sign`, {});

    expect([created.status, message.status, signed.status]).toEqual([201, 201, 200]);
    expect(requests.create).toHaveBeenCalledWith(
      self,
      expect.objectContaining({ title: "Monitor sem imagem" }),
    );
    expect(requests.createMessage).toHaveBeenCalledWith(
      self,
      REQUEST_ID,
      expect.objectContaining({ message: "Segue o detalhe." }),
    );
    expect(terms.sign).toHaveBeenCalledWith(self, TERM_ID, expect.anything());

    const reached = tiBinding.fetch.mock.calls.length;
    const status = await send("PATCH", `/ti/requests/${REQUEST_ID}/status`, {
      status: "In_Progress",
    });
    const term = await send("POST", "/ti/terms", { user_id: USER_ID, reason: "Termo" });

    expect([status.status, term.status]).toEqual([403, 403]);
    expect(tiBinding.fetch).toHaveBeenCalledTimes(reached);
    expect(requests.updateStatus).not.toHaveBeenCalled();
    expect(terms.create).not.toHaveBeenCalled();
  });

  it("rejects an incorrect cookie CSRF before reaching TI", async () => {
    const csrf = "B".repeat(43);
    const token = await signSession({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      auth_kind: "organization",
      modules: { ti: 3 },
      session_id: "gateway-session-b",
      session_version: 8,
      csrf_hash: await hashCsrfToken(csrf),
    });
    const categoryService = makeCategoryService();
    const tiApp = createTiWorkerApp({ env: tiEnv(), categoryService });
    const tiBinding = {
      fetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        tiApp.fetch(new Request(input, init)),
      ),
    };
    const gatewayApp = createGatewayWorkerApp({ env: gatewayEnv(tiBinding) });

    const response = await gatewayApp.request("https://gateway.test/ti/inventory-categories", {
      method: "POST",
      headers: {
        cookie: `cw.session=${token}; cw.csrf=${csrf}`,
        "x-csrf-token": "C".repeat(43),
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Notebook" }),
    });

    expect(response.status).toBe(403);
    expect(tiBinding.fetch).not.toHaveBeenCalled();
    expect(categoryService.create).not.toHaveBeenCalled();
  });
});
