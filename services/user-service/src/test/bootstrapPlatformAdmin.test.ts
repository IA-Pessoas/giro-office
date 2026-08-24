import { describe, expect, it } from "vitest";

import { getPlatformAdminBootstrapInput } from "../scripts/bootstrapPlatformAdmin.js";

const generatedPassword = "mH9VtK2qR7xP4cN8wY5sL1dF6gJ3bA0uE_zI-oQkCrs";

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

  it("preserves a generated Base64URL password", () => {
    expect(
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
        PLATFORM_ADMIN_PASSWORD: generatedPassword,
      }).password,
    ).toBe(generatedPassword);
  });

  it("normalizes and validates the administrator email", () => {
    expect(
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: " Admin@Example.COM ",
        PLATFORM_ADMIN_PASSWORD: generatedPassword,
      }).email,
    ).toBe("admin@example.com");

    expect(() =>
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "not-an-email",
        PLATFORM_ADMIN_PASSWORD: generatedPassword,
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
