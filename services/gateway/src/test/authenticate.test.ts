import { afterEach, describe, expect, it, vi } from "vitest";

import { createUserServiceSessionValidator } from "../middlewares/authenticate.js";

describe("createUserServiceSessionValidator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("valida o token no endpoint de sessão do user-service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const validate = createUserServiceSessionValidator(
      "http://user-service.test",
      "internal-token",
    );

    await validate("jwt-token");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/user/session/validate", "http://user-service.test"),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer jwt-token",
          "x-internal-service-token": "internal-token",
        }),
      }),
    );
  });

  it("falha fechado quando o user-service rejeita a sessão", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const validate = createUserServiceSessionValidator(
      "http://user-service.test",
      "internal-token",
    );

    await expect(validate("revoked-token")).rejects.toMatchObject({ statusCode: 401 });
  });
});
