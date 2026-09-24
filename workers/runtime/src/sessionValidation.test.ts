import { describe, expect, it } from "vitest";
import type { ServiceBinding } from "./env.js";
import { validateWorkerSession, type WorkerAuthContext } from "./index.js";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function auth(actorKind: WorkerAuthContext["actorKind"] = "organization"): WorkerAuthContext {
  return {
    token: "session-token",
    userId: "user-1",
    organizationId: actorKind === "organization" ? "org-1" : "",
    actorKind,
    isPlatformAdmin: actorKind === "platform",
    claims: {
      user_id: "user-1",
      organization_id: actorKind === "organization" ? "org-1" : undefined,
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
      auth_kind: actorKind,
    },
  };
}

function fakeBinding(response: Response | Error): { binding: ServiceBinding; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  return {
    calls,
    binding: {
      fetch: async (input, init) => {
        calls.push({ input, init });
        if (response instanceof Error) throw response;
        return response;
      },
    },
  };
}

function requestFrom(call: FetchCall): Request {
  return new Request(call.input, call.init);
}

describe("validateWorkerSession", () => {
  it("valida sessão de organização por GET com os headers internos", async () => {
    const fake = fakeBinding(new Response(null, { status: 204 }));

    await expect(
      validateWorkerSession(auth(), fake.binding, "cookie", {
        internalServiceToken: "internal-token",
      }),
    ).resolves.toBeUndefined();

    const request = requestFrom(fake.calls[0]);
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/user/session/validate");
    expect(request.headers.get("authorization")).toBe("Bearer session-token");
    expect(request.headers.get("x-auth-session-transport")).toBe("cookie");
    expect(request.headers.get("x-internal-service-token")).toBe("internal-token");
  });

  it("valida sessão de plataforma por POST e preserva o transporte", async () => {
    const fake = fakeBinding(new Response(null, { status: 200 }));

    await expect(
      validateWorkerSession(auth("platform"), fake.binding, "bearer", {
        internalServiceToken: "internal-token",
      }),
    ).resolves.toBeUndefined();

    const request = requestFrom(fake.calls[0]);
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/platform/session/validate");
    expect(request.headers.get("authorization")).toBe("Bearer session-token");
    expect(request.headers.get("x-auth-session-transport")).toBe("bearer");
    expect(request.headers.get("x-internal-service-token")).toBe("internal-token");
  });

  it.each([401, 409])("preserva status de sessão inválida: %i", async (status) => {
    const fake = fakeBinding(new Response(null, { status }));

    await expect(
      validateWorkerSession(auth(), fake.binding, "cookie", {
        internalServiceToken: "internal-token",
      }),
    ).rejects.toMatchObject({ statusCode: status });
  });

  it.each([400, 500])("normaliza resposta não-ok %i para 503", async (status) => {
    const fake = fakeBinding(new Response(null, { status }));

    await expect(
      validateWorkerSession(auth(), fake.binding, "cookie", {
        internalServiceToken: "internal-token",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("normaliza falha de rede para 503", async () => {
    const fake = fakeBinding(new Error("network secret"));

    const error = await validateWorkerSession(auth(), fake.binding, "cookie", {
      internalServiceToken: "internal-token",
    }).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ statusCode: 503 });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("network secret");
  });
});
