import {
  CSRF_HEADER_NAME,
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_IMPERSONATOR_PLATFORM_USER_ID_HEADER,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildForwardHeaders, buildHttpProxyMiddleware } from "./httpProxy.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const authenticatedRequest = {
  headers: {},
  method: "GET",
  originalUrl: "/user/me",
  protocol: "https",
  ip: "127.0.0.1",
  auth: {
    token: "verified-token",
    userId: "user-1",
    organizationId: "org-1",
    actorKind: "organization",
    isPlatformAdmin: false,
    claims: {
      user_id: "user-1",
      organization_id: "org-1",
      auth_kind: "organization",
      session_id: "session-1",
      csrf_hash: "a".repeat(64),
      session_version: 1,
    },
  },
} as unknown as Request;

describe("buildForwardHeaders", () => {
  it("encaminha somente o token validado para o upstream legado habilitado", () => {
    const headers = buildForwardHeaders(
      {
        ...authenticatedRequest,
        headers: { authorization: "Bearer attacker-token", cookie: "cw.session=attacker-token" },
      } as Request,
      { forwardValidatedAuthorization: true },
    );

    expect(headers.get("authorization")).toBe("Bearer verified-token");
    expect(headers.get("cookie")).toBeNull();
  });

  it("não encaminha Bearer sem opt-in, sem autenticação ou para identidade de plataforma", () => {
    expect(buildForwardHeaders(authenticatedRequest).get("authorization")).toBeNull();
    for (const auth of [undefined, { ...authenticatedRequest.auth, actorKind: "platform" }]) {
      const headers = buildForwardHeaders(
        {
          ...authenticatedRequest,
          headers: { authorization: "Bearer attacker-token" },
          auth,
        } as Request,
        { forwardValidatedAuthorization: true },
      );
      expect(headers.get("authorization")).toBeNull();
    }
  });

  it("preserva a autorização legada quando o JWT não declara módulos", () => {
    const headers = buildForwardHeaders({
      ...authenticatedRequest,
      auth: {
        ...authenticatedRequest.auth,
        claims: {
          ...authenticatedRequest.auth?.claims,
          permission: 2,
          modules: { contabil: 2, triagem: 0 },
          modulePermissionsPresent: false,
        },
      },
    } as Request);

    expect(headers.get(FORWARDED_AUTH_PERMISSION_HEADER)).toBe("2");
    expect(headers.get(FORWARDED_AUTH_MODULES_HEADER)).toBeNull();
  });
  it("mantém o vínculo secreto da sessão fora de upstreams comuns", () => {
    const headers = buildForwardHeaders(authenticatedRequest, {
      internalServiceToken: "shared-token",
    });

    expect(headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe("shared-token");
    expect(headers.get(FORWARDED_AUTH_SESSION_ID_HEADER)).toBeNull();
    expect(headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER)).toBeNull();
  });

  it("encaminha o vínculo somente quando o user-service solicita explicitamente", () => {
    const headers = buildForwardHeaders(authenticatedRequest, {
      forwardSessionBinding: true,
    });

    expect(headers.get(FORWARDED_AUTH_SESSION_ID_HEADER)).toBe("session-1");
    expect(headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER)).toBe("a".repeat(64));
  });

  it("substitui todos os headers de plataforma forjados por identidade verificada", () => {
    const request = {
      ...authenticatedRequest,
      headers: {
        [FORWARDED_AUTH_USER_ID_HEADER]: "attacker-user",
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "attacker-org",
        [FORWARDED_AUTH_PERMISSION_HEADER]: "999",
        [FORWARDED_AUTH_TYPE_HEADER]: "owner",
        [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ rh: 3 }),
        [FORWARDED_AUTH_KIND_HEADER]: "organization",
        [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: "super_admin",
      },
      auth: {
        token: "verified-platform-token",
        userId: "real-platform-user",
        organizationId: "",
        actorKind: "platform",
        isPlatformAdmin: true,
        claims: {
          user_id: "real-platform-user",
          auth_kind: "platform",
          platform_role: "super_admin",
          organization_id: "forged-claim-org",
          permission: 3,
          type: "owner",
          modules: { rh: 3 },
        },
      },
    } as unknown as Request;

    const headers = buildForwardHeaders(request, { internalServiceToken: "internal" });

    expect(headers.get(FORWARDED_AUTH_KIND_HEADER)).toBe("platform");
    expect(headers.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER)).toBe("super_admin");
    expect(headers.get(FORWARDED_AUTH_USER_ID_HEADER)).toBe("real-platform-user");
    expect(headers.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER)).toBeNull();
    expect(headers.get(FORWARDED_AUTH_PERMISSION_HEADER)).toBeNull();
    expect(headers.get(FORWARDED_AUTH_TYPE_HEADER)).toBeNull();
    expect(headers.get(FORWARDED_AUTH_MODULES_HEADER)).toBeNull();
  });

  it("não encaminha cookies fora da allowlist de sessão da plataforma", () => {
    const request = {
      ...authenticatedRequest,
      method: "GET",
      originalUrl: "/platform/audit/requests",
      headers: { cookie: "theme=dark; cw.session=forged; cw.csrf=forged" },
      auth: {
        ...authenticatedRequest.auth,
        actorKind: "platform",
        isPlatformAdmin: true,
      },
    } as unknown as Request;

    const headers = buildForwardHeaders(request, { internalServiceToken: "internal" });

    expect(headers.get("cookie")).toBeNull();
  });

  it("não encaminha cookies ao login público da plataforma", () => {
    const request = {
      headers: { cookie: "theme=dark; cw.session=forged; cw.csrf=forged" },
      method: "POST",
      originalUrl: "/platform/session",
      protocol: "https",
      ip: "127.0.0.1",
    } as unknown as Request;

    const headers = buildForwardHeaders(request, { forwardPlatformSessionCredentials: true });

    expect(headers.get("cookie")).toBeNull();
  });

  it.each([
    { label: "path canônico", path: "/platform/me", method: "GET", expectedCookie: true },
    { label: "trailing slash", path: "/platform/me/", method: "GET", expectedCookie: true },
    { label: "método errado", path: "/platform/me", method: "POST", expectedCookie: false },
  ])("aplica a allowlist inbound por método e path normalizado: $label", (entry) => {
    const request = {
      ...authenticatedRequest,
      method: entry.method,
      originalUrl: entry.path,
      headers: { cookie: "theme=dark; cw.session=forged; cw.csrf=forged" },
      auth: {
        ...authenticatedRequest.auth,
        token: "verified-platform-token",
        actorKind: "platform",
        isPlatformAdmin: true,
      },
    } as unknown as Request;

    const headers = buildForwardHeaders(request, { forwardPlatformSessionCredentials: true });

    expect(headers.get("cookie")).toBe(
      entry.expectedCookie ? "cw.session=verified-platform-token" : null,
    );
  });

  it.each([
    {
      method: "GET",
      path: "/platform/organizations/org-1",
      expectedCookie: "cw.session=verified-platform-token",
      expectedCsrf: null,
    },
    {
      method: "POST",
      path: "/platform/organizations",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
    {
      method: "PATCH",
      path: "/platform/organizations/org-1/status",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
    {
      method: "PATCH",
      path: "/platform/organizations/org-1/subscription-plan",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
    {
      method: "PATCH",
      path: "/platform/organizations/org-1/logo-url",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
    {
      method: "GET",
      path: "/platform/organizations/org-1/users/user-1",
      expectedCookie: "cw.session=verified-platform-token",
      expectedCsrf: null,
    },
    {
      method: "GET",
      path: "/platform/organizations/org-1/users/user-1/permissions",
      expectedCookie: "cw.session=verified-platform-token",
      expectedCsrf: null,
    },
    {
      method: "PUT",
      path: "/platform/organizations/org-1/users/user-1/permissions",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
    {
      method: "POST",
      path: "/platform/organizations/org-1/users",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
    {
      method: "GET",
      path: "/platform/organizations/org-1/departments",
      expectedCookie: "cw.session=verified-platform-token",
      expectedCsrf: null,
    },
    {
      method: "DELETE",
      path: "/platform/organizations/org-1/users/user-1",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
    {
      method: "POST",
      path: "/platform/organizations/org-1/users/user-1/reactivate",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
    {
      method: "POST",
      path: "/platform/organizations/org-1/ownership-transfer",
      expectedCookie: "cw.session=verified-platform-token; cw.csrf=proof",
      expectedCsrf: "proof",
    },
  ])("encaminha somente as credenciais allowlisted em $method $path", (entry) => {
    const request = {
      ...authenticatedRequest,
      method: entry.method,
      originalUrl: entry.path,
      get: (name: string) => (name === "x-csrf-token" ? "proof" : undefined),
      headers: {
        authorization: "Bearer browser-secret",
        cookie: "theme=dark; cw.session=forged; cw.csrf=proof",
        "x-csrf-token": "proof",
      },
      auth: {
        ...authenticatedRequest.auth,
        token: "verified-platform-token",
        actorKind: "platform",
        isPlatformAdmin: true,
      },
    } as unknown as Request;

    const headers = buildForwardHeaders(request, {
      forwardPlatformSessionCredentials: true,
      internalServiceToken: "trusted-internal-token",
    });

    expect(headers.get("cookie")).toBe(entry.expectedCookie);
    expect(headers.get("x-csrf-token")).toBe(entry.expectedCsrf);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe("trusted-internal-token");
  });

  it.each([
    ["POST", "/user"],
    ["PUT", "/user/user-1"],
    ["DELETE", "/user/user-1"],
    ["POST", "/user/user-1/photo"],
    ["DELETE", "/user/user-1/photo"],
    ["PUT", "/user/permission/user-1"],
  ])("encaminha o x-csrf-token real para mutação User %s %s", (method, path) => {
    const request = {
      ...authenticatedRequest,
      method,
      originalUrl: path,
      get: (name: string) =>
        name.toLowerCase() === CSRF_HEADER_NAME ? "real-csrf-token" : undefined,
      headers: {
        cookie: "cw.session=forged; cw.csrf=forged",
        [CSRF_HEADER_NAME]: "forged-header",
      },
    } as unknown as Request;

    const headers = buildForwardHeaders(request, {
      forwardSessionBinding: true,
      internalServiceToken: "trusted-internal-token",
    });

    expect(headers.get(CSRF_HEADER_NAME)).toBe("real-csrf-token");
    expect(headers.get(FORWARDED_AUTH_SESSION_ID_HEADER)).toBe("session-1");
    expect(headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER)).toBe("a".repeat(64));
    expect(headers.get("cookie")).toBeNull();
  });

  it.each([
    ["POST", "/user"],
    ["PUT", "/user/user-1"],
    ["DELETE", "/user/user-1"],
    ["POST", "/user/user-1/photo"],
    ["DELETE", "/user/user-1/photo"],
    ["PUT", "/user/permission/user-1"],
  ])("rejeita mutação User sem x-csrf-token %s %s", (method, path) => {
    const request = {
      ...authenticatedRequest,
      method,
      originalUrl: path,
      get: () => undefined,
      headers: { cookie: "cw.session=forged; cw.csrf=forged" },
    } as unknown as Request;

    expect(() => buildForwardHeaders(request, { forwardSessionBinding: true })).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it.each([
    "/platform/organizations/org-1/users/user-1",
    "/platform/organizations/org-1/departments",
  ])("remove identidade enviada pelo cliente em %s", (path) => {
    const request = {
      ...authenticatedRequest,
      method: "GET",
      originalUrl: path,
      headers: {
        cookie: "cw.session=forged; cw.csrf=forged",
        [FORWARDED_AUTH_USER_ID_HEADER]: "attacker-user",
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "attacker-org",
        [FORWARDED_AUTH_KIND_HEADER]: "organization",
        [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: "owner",
      },
      auth: {
        ...authenticatedRequest.auth,
        token: "verified-platform-token",
        userId: "real-platform-user",
        organizationId: "",
        actorKind: "platform",
        isPlatformAdmin: true,
      },
    } as unknown as Request;

    const headers = buildForwardHeaders(request, {
      forwardPlatformSessionCredentials: true,
      internalServiceToken: "trusted-internal-token",
    });

    expect(headers.get("cookie")).toBe("cw.session=verified-platform-token");
    expect(headers.get(FORWARDED_AUTH_USER_ID_HEADER)).toBe("real-platform-user");
    expect(headers.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER)).toBeNull();
    expect(headers.get(FORWARDED_AUTH_KIND_HEADER)).toBe("platform");
    expect(headers.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER)).toBe("super_admin");
  });

  it("descarta o operador enviado pelo cliente e encaminha somente o claim assinado", () => {
    const request = {
      ...authenticatedRequest,
      headers: {
        [FORWARDED_AUTH_IMPERSONATOR_PLATFORM_USER_ID_HEADER]: "attacker-platform-user",
      },
      auth: {
        ...authenticatedRequest.auth,
        claims: {
          ...authenticatedRequest.auth?.claims,
          impersonator_platform_user_id: "real-platform-user",
        },
      },
    } as Request;

    const headers = buildForwardHeaders(request, { internalServiceToken: "trusted-token" });

    expect(headers.get(FORWARDED_AUTH_IMPERSONATOR_PLATFORM_USER_ID_HEADER)).toBe(
      "real-platform-user",
    );
  });

  it("não encaminha operador spoofado sem claim de personificação", () => {
    const request = {
      ...authenticatedRequest,
      headers: {
        [FORWARDED_AUTH_IMPERSONATOR_PLATFORM_USER_ID_HEADER]: "attacker-platform-user",
      },
    } as Request;

    expect(
      buildForwardHeaders(request, { internalServiceToken: "trusted-token" }).get(
        FORWARDED_AUTH_IMPERSONATOR_PLATFORM_USER_ID_HEADER,
      ),
    ).toBeNull();
  });
});

describe("buildHttpProxyMiddleware", () => {
  it("expõe somente a resposta confirmada de transferência para o ciclo de auditoria", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new globalThis.Response(
            JSON.stringify({
              success: true,
              data: {
                currentOwner: { id: "owner-1", type: "admin", status: "inactive" },
                successor: { id: "successor-1", type: "owner", status: "active" },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const response = {
      locals: {},
      send: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const proxy = buildHttpProxyMiddleware("http://upstream.test");
    const next = vi.fn();

    await proxy(
      {
        body: {},
        get: (name: string) => (name === CSRF_HEADER_NAME ? "proof" : undefined),
        headers: { "content-type": "application/json", [CSRF_HEADER_NAME]: "proof" },
        ip: "127.0.0.1",
        method: "POST",
        originalUrl: "/platform/organizations/org-1/ownership-transfer",
        protocol: "http",
      } as Request,
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.locals.ownershipTransferAuditResult).toEqual({
      currentOwner: { id: "owner-1", type: "admin", status: "inactive" },
      successor: { id: "successor-1", type: "owner", status: "active" },
    });
  });

  it("applies an abort deadline to upstream requests", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal;
        throw new Error("upstream unavailable");
      }),
    );
    const next = vi.fn();
    const proxy = buildHttpProxyMiddleware("http://upstream.test", { upstreamTimeoutMs: 25 });

    await proxy(
      {
        headers: {},
        ip: "127.0.0.1",
        method: "GET",
        originalUrl: "/test",
        protocol: "http",
      } as Request,
      {} as never,
      next,
    );

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 502 }));
  });
});

describe("encaminhamento do corpo JSON", () => {
  function stubFetchCapturingBody(): { getBody: () => unknown } {
    let capturedBody: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body;
        return new globalThis.Response(null, { status: 204 });
      }),
    );
    return { getBody: () => capturedBody };
  }

  function buildResponse(): Response {
    return {
      locals: {},
      end: vi.fn(),
      send: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
  }

  it("reenvia os bytes originais quando express.json preservou rawBody", async () => {
    const captured = stubFetchCapturingBody();
    const proxy = buildHttpProxyMiddleware("http://upstream.test");
    // Espaçamento e ordem de chaves que um JSON.stringify do body parseado perderia.
    const rawBody = Buffer.from('{"z":1,  "a":"acentuação"}', "utf8");

    await proxy(
      {
        body: { z: 1, a: "acentuação" },
        rawBody,
        get: () => undefined,
        headers: { "content-type": "application/json" },
        ip: "127.0.0.1",
        method: "POST",
        originalUrl: "/user/me",
        protocol: "http",
      } as unknown as Request,
      buildResponse(),
      vi.fn(),
    );

    expect(captured.getBody()).toBeInstanceOf(Buffer);
    expect((captured.getBody() as Buffer).equals(rawBody)).toBe(true);
  });

  it("serializa o body quando não há rawBody", async () => {
    const captured = stubFetchCapturingBody();
    const proxy = buildHttpProxyMiddleware("http://upstream.test");

    await proxy(
      {
        body: { a: 1 },
        get: () => undefined,
        headers: { "content-type": "application/json" },
        ip: "127.0.0.1",
        method: "POST",
        originalUrl: "/user/me",
        protocol: "http",
      } as unknown as Request,
      buildResponse(),
      vi.fn(),
    );

    expect(captured.getBody()).toBe('{"a":1}');
  });
});
