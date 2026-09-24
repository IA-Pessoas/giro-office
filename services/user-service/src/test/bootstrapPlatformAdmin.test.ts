import { describe, expect, it } from "vitest";

import { getPlatformAdminBootstrapInput } from "../scripts/bootstrapPlatformAdmin.js";

describe("getPlatformAdminBootstrapInput", () => {
  it("requires name, email, and password environment variables", () => {
    const required = {
      PLATFORM_ADMIN_NAME: "Platform Administrator",
      PLATFORM_ADMIN_EMAIL: "admin@example.com",
      PLATFORM_ADMIN_PASSWORD: "test-only-password",
    };

    for (const missing of Object.keys(required)) {
      const environment: NodeJS.ProcessEnv = { ...required };
      delete environment[missing];
      expect(() => getPlatformAdminBootstrapInput(environment)).toThrow(missing);
    }

    expect(() =>
      getPlatformAdminBootstrapInput({ ...required, PLATFORM_ADMIN_PASSWORD: "   " }),
    ).toThrow(
      "PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL e PLATFORM_ADMIN_PASSWORD são obrigatórias.",
    );
  });

  it("normalizes and validates the administrator email", () => {
    expect(
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: " Admin@Example.COM ",
        PLATFORM_ADMIN_PASSWORD: "test-only-password",
      }).email,
    ).toBe("admin@example.com");

    expect(
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
        PLATFORM_ADMIN_PASSWORD: "test-only-password",
      }).password,
    ).toBe("test-only-password");

    expect(() =>
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "not-an-email",
        PLATFORM_ADMIN_PASSWORD: "test-only-password",
      }),
    ).toThrow(/email/i);
  });
});
