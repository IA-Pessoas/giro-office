import { describe, expect, it } from "vitest";

import { getPlatformAdminBootstrapInput } from "../scripts/bootstrapPlatformAdmin.js";

describe("getPlatformAdminBootstrapInput", () => {
  it("rejects a password made only of whitespace", () => {
    expect(() =>
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
        PLATFORM_ADMIN_PASSWORD: "   \t ",
      }),
    ).toThrow(
      "PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL e PLATFORM_ADMIN_PASSWORD são obrigatórias.",
    );
  });

  it("preserves a valid password without trimming it", () => {
    expect(
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
        PLATFORM_ADMIN_PASSWORD: "  safe-password  ",
      }).password,
    ).toBe("  safe-password  ");
  });
});
