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
        modules: {
          certificado: 0,
          comercial: 0,
          contabil: 0,
          financeiro: 0,
          fiscal: 0,
          integracao: 0,
          marketing: 0,
          parcelamento: 0,
          pessoal: 0,
          regularize: 0,
          rh: 0,
          ti: 0,
          triagem: 0,
        },
        modulePermissionsPresent: false,
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

  it("preserva o personificador da sessão de organização (#1529)", async () => {
    const token = await signToken({
      user_id: "user-1",
      organization_id: "org-1",
      auth_kind: "organization",
      impersonator_platform_user_id: "platform-1",
    });

    const auth = await authenticateWorkerRequest(
      request({ cookie: `cw.session=${encodeURIComponent(token)}` }),
      { jwtSecret: SECRET },
    );

    expect(auth.claims.impersonator_platform_user_id).toBe("platform-1");
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

  it("normaliza todos os módulos ativos e preserva a presença do claim", async () => {
    const token = await signToken({
      user_id: "user-1",
      modules: { certificado: 3, comercial: 1, aposentado: 2, contabil: "invalid" },
    });

    const auth = await authenticateWorkerRequest(request({ authorization: `Bearer ${token}` }), {
      jwtSecret: SECRET,
      allowBearer: true,
    });

    expect(auth.claims.modules).toEqual({
      certificado: 3,
      comercial: 1,
      contabil: 0,
      financeiro: 0,
      fiscal: 0,
      integracao: 0,
      marketing: 0,
      parcelamento: 0,
      pessoal: 0,
      regularize: 0,
      rh: 0,
      ti: 0,
      triagem: 0,
    });
    expect(auth.claims.modulePermissionsPresent).toBe(true);
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

  it("rejeita plataforma super_admin no transporte Bearer", async () => {
    const token = await signToken({
      user_id: "platform-user",
      auth_kind: "platform",
      platform_role: "super_admin",
    });

    await expect(
      authenticateWorkerRequest(request({ authorization: `Bearer ${token}` }), {
        jwtSecret: SECRET,
        allowBearer: true,
      }),
    ).rejects.toMatchObject({ statusCode: 401, message: "Não autenticado." });
  });

  it("rejeita plataforma no transporte Bearer sem platform_role", async () => {
    const token = await signToken({
      user_id: "platform-user",
      auth_kind: "platform",
    });

    await expect(
      authenticateWorkerRequest(request({ authorization: `Bearer ${token}` }), {
        jwtSecret: SECRET,
        allowBearer: true,
      }),
    ).rejects.toMatchObject({ statusCode: 401, message: "Não autenticado." });
  });

  it("aceita Bearer quando o cookie cw.session tem percent-encoding inválido", async () => {
    const token = await signToken({ user_id: "bearer-user", organization_id: "org-1" });

    await expect(
      authenticateWorkerRequest(
        request({
          cookie: "cw.session=%E0%A4%A",
          authorization: `Bearer ${token}`,
        }),
        { jwtSecret: SECRET, allowBearer: true },
      ),
    ).resolves.toMatchObject({ token, userId: "bearer-user", actorKind: "organization" });
  });

  it("rejeita Authorization com separação diferente de um espaço literal", async () => {
    const token = await signToken({ user_id: "user-1" });

    await expect(
      authenticateWorkerRequest(request({ authorization: `Bearer  ${token}` }), {
        jwtSecret: SECRET,
        allowBearer: true,
      }),
    ).rejects.toMatchObject({ statusCode: 401, message: "Não autenticado." });
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

    const bearerToken = await signToken({ user_id: "bearer-user" });
    await expect(
      authenticateWorkerRequest(
        request({ cookie: "cw.session=", authorization: `Bearer ${bearerToken}` }),
        { jwtSecret: SECRET, allowBearer: true },
      ),
    ).rejects.toMatchObject({ statusCode: 401, message: "Não autenticado." });
  });
});
