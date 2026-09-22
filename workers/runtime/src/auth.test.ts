import { describe, expect, it } from "vitest";
import { authenticateWorkerRequest, type WorkerAuthClaims } from "./index.js";

const SECRET = "test-secret";

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function signToken(claims: Record<string, unknown>): Promise<string> {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify(claims));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return `${header}.${payload}.${btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "")}`;
}

function request(headers: HeadersInit = {}): Request {
  return new Request("https://runtime.test/protected", { headers });
}

describe("authenticateWorkerRequest", () => {
  it("autentica cw.session antes de Authorization e normaliza os claims", async () => {
    const token = await signToken({
      sub: "user-1",
      organization_id: "org-1",
      permission: 2,
      auth_kind: "organization",
      session_id: "session-1",
      session_version: 3,
      csrf_hash: "a".repeat(64),
      type: "owner",
      name: "Ana",
      login: "ana@example.com",
      ignored: { secret: true },
    });

    const auth = await authenticateWorkerRequest(
      request({
        cookie: `cw.session=${encodeURIComponent(token)}`,
        authorization: `Bearer ${await signToken({ user_id: "wrong-user" })}`,
      }),
      { jwtSecret: SECRET, allowBearer: true },
    );

    expect(auth).toEqual({
      token,
      userId: "user-1",
      organizationId: "org-1",
      actorKind: "organization",
      isPlatformAdmin: false,
      claims: {
        user_id: "user-1",
        organization_id: "org-1",
        permission: 2,
        session_version: 3,
        session_id: "session-1",
        csrf_hash: "a".repeat(64),
        type: "owner",
        auth_kind: "organization",
        name: "Ana",
        login: "ana@example.com",
      } satisfies WorkerAuthClaims,
    });
  });

  it("rejeita Bearer quando a compatibilidade está desabilitada", async () => {
    const token = await signToken({ user_id: "user-1" });

    await expect(
      authenticateWorkerRequest(request({ authorization: `Bearer ${token}` }), {
        jwtSecret: SECRET,
        allowBearer: false,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("aceita Bearer somente quando allowBearer está habilitado", async () => {
    const token = await signToken({ user_id: "user-1", organization_id: "org-1" });

    await expect(
      authenticateWorkerRequest(request({ authorization: `Bearer ${token}` }), {
        jwtSecret: SECRET,
        allowBearer: true,
      }),
    ).resolves.toMatchObject({
      token,
      userId: "user-1",
      organizationId: "org-1",
      actorKind: "organization",
    });
  });

  it("normaliza plataforma super_admin sem organização", async () => {
    const token = await signToken({
      user_id: "platform-user",
      organization_id: "ignored-org",
      auth_kind: "platform",
      platform_role: "super_admin",
      permission: "not-a-number",
      session_version: -1,
      csrf_hash: "invalid",
      type: "invalid",
      name: 42,
      login: false,
    });

    await expect(
      authenticateWorkerRequest(request({ cookie: `cw.session=${token}` }), {
        jwtSecret: SECRET,
        allowBearer: false,
      }),
    ).resolves.toMatchObject({
      userId: "platform-user",
      organizationId: "",
      actorKind: "platform",
      isPlatformAdmin: true,
      claims: {
        user_id: "platform-user",
        organization_id: "ignored-org",
        auth_kind: "platform",
        platform_role: "super_admin",
      },
    });
  });

  it("rejeita cookie ou bearer inválido com erro genérico 401", async () => {
    await expect(
      authenticateWorkerRequest(request({ cookie: "cw.session=invalid" }), {
        jwtSecret: SECRET,
        allowBearer: true,
      }),
    ).rejects.toMatchObject({ statusCode: 401, message: "Não autenticado." });

    await expect(
      authenticateWorkerRequest(request({ authorization: "Bearer invalid" }), {
        jwtSecret: SECRET,
        allowBearer: true,
      }),
    ).rejects.toMatchObject({ statusCode: 401, message: "Não autenticado." });
  });
});
