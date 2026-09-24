import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateTaskRequest } from "./auth.js";
import { TOKENS, workerEnv } from "./test/env.js";

afterEach(() => vi.restoreAllMocks());

describe("authenticateTaskRequest", () => {
  it("registra qual segredo recusou o 401, só com booleanos", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = new Request("https://task.test/task/list", {
      headers: { "x-internal-service-token": "outro", authorization: "Bearer a.b.c" },
    });

    await expect(authenticateTaskRequest(request, workerEnv())).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(warn).toHaveBeenCalledWith(
      "Token recusado",
      expect.objectContaining({
        event: "auth.token.rejected",
        forwardedHeaders: true,
        internalTokenMatches: false,
      }),
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(TOKENS.internal);
    expect(logged).not.toContain(TOKENS.jwt);
  });
});
