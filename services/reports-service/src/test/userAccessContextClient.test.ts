import { ServiceError } from "@workspace/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserAccessContextClient } from "../integrations/userAccessContextClient.js";

const userId = "a0000000-0000-4000-8000-000000000001";
const organizationId = "b0000000-0000-4000-8000-000000000002";

function createClient() {
  return new UserAccessContextClient({
    userServiceUrl: "http://user-service.test",
    reportsInternalToken: "reports-token",
    sourceTimeoutMs: 100,
  });
}

describe("UserAccessContextClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("consulta o contexto interno e encaminha o request ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { user: { id: userId }, modules: { contabil: 3 } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      createClient().getAccessContext({ userId, organizationId, requestId: "request-814" }),
    ).resolves.toEqual({ user: { id: userId }, modules: { contabil: 3 } });
    expect(fetch).toHaveBeenCalledWith(
      "http://user-service.test/internal/reporting/access-context",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-token": "reports-token",
          "x-request-id": "request-814",
        },
        body: JSON.stringify({ userId, organizationId }),
        signal: expect.any(AbortSignal),
      },
    );
  });

  it.each([
    ["resposta não-ok", () => Promise.resolve(new Response(null, { status: 403 }))],
    [
      "envelope inválido",
      () => Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 200 })),
    ],
    ["falha de rede", () => Promise.reject(new Error("internal URL must not leak"))],
  ])("converte %s em erro seguro", async (_label, fetchImplementation) => {
    vi.stubGlobal("fetch", vi.fn(fetchImplementation));

    await expect(
      createClient().getAccessContext({ userId, organizationId, requestId: "request-814" }),
    ).rejects.toEqual(
      expect.objectContaining(
        new ServiceError(503, "Não foi possível validar o acesso atual ao relatório."),
      ),
    );
  });

  it("aborta a consulta no timeout configurado da fonte", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => {
              reject(new DOMException("Timeout", "AbortError"));
            });
          }),
      ),
    );

    const pending = createClient().getAccessContext({
      userId,
      organizationId,
      requestId: "request-814",
    });
    const rejection = expect(pending).rejects.toEqual(
      expect.objectContaining(
        new ServiceError(503, "Não foi possível validar o acesso atual ao relatório."),
      ),
    );
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });
});
