import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

import { isAuthorizedWebSocketUpgrade } from "../middlewares/websocketAuthorize.js";

const jwtSecret = "test-secret";

function createToken(): string {
  return jwt.sign(
    {
      user_id: "user-1",
      organization_id: "org-1",
      permission: 1,
      type: "user",
    },
    jwtSecret,
  );
}

describe("isAuthorizedWebSocketUpgrade", () => {
  it("requires a valid bearer token and an active session", async () => {
    const sessionValidator = vi.fn().mockResolvedValue(undefined);

    await expect(
      isAuthorizedWebSocketUpgrade(`Bearer ${createToken()}`, jwtSecret, sessionValidator),
    ).resolves.toBe(true);
    expect(sessionValidator).toHaveBeenCalledWith(expect.any(String));
  });

  it("rejects an absent token or an invalid session", async () => {
    await expect(
      isAuthorizedWebSocketUpgrade(undefined, jwtSecret, vi.fn()),
    ).resolves.toBe(false);
    await expect(
      isAuthorizedWebSocketUpgrade(
        `Bearer ${createToken()}`,
        jwtSecret,
        vi.fn().mockRejectedValue(new Error("inactive")),
      ),
    ).resolves.toBe(false);
  });
});
