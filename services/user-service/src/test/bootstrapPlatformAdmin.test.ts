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

  it("normalizes and validates the administrator email", () => {
    expect(
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: " Admin@Example.COM ",
        PLATFORM_ADMIN_PASSWORD: "unique-password-2026",
      }).email,
    ).toBe("admin@example.com");

    expect(() =>
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "not-an-email",
        PLATFORM_ADMIN_PASSWORD: "unique-password-2026",
      }),
    ).toThrow(/email/i);
  });

  it("rejects short and common administrator passwords", () => {
    for (const password of ["short-password", "passwordpassword", "1234567890123456"]) {
      expect(() =>
        getPlatformAdminBootstrapInput({
          PLATFORM_ADMIN_NAME: "Platform Administrator",
          PLATFORM_ADMIN_EMAIL: "admin@example.com",
          PLATFORM_ADMIN_PASSWORD: password,
        }),
      ).toThrow(/password/i);
    }
  });
});
