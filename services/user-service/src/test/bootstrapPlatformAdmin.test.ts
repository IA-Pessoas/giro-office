import { describe, expect, it } from "vitest";

import {
  assertInteractiveSecretOutput,
  getPlatformAdminBootstrapInput,
} from "../scripts/bootstrapPlatformAdmin.js";

describe("getPlatformAdminBootstrapInput", () => {
  it("requires only administrator identity", () => {
    expect(() =>
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
      }),
    ).toThrow("PLATFORM_ADMIN_NAME e PLATFORM_ADMIN_EMAIL são obrigatórias.");
  });

  it("rejects an operator-chosen password", () => {
    expect(() =>
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "admin@example.com",
        PLATFORM_ADMIN_PASSWORD: "passwordpassword",
      }),
    ).toThrow(/gerada pelo próprio comando/i);
  });

  it("normalizes and validates the administrator email", () => {
    expect(
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: " Admin@Example.COM ",
      }).email,
    ).toBe("admin@example.com");

    expect(() =>
      getPlatformAdminBootstrapInput({
        PLATFORM_ADMIN_NAME: "Platform Administrator",
        PLATFORM_ADMIN_EMAIL: "not-an-email",
      }),
    ).toThrow(/email/i);
  });

  it("refuses to print a generated secret outside an interactive terminal", () => {
    expect(() => assertInteractiveSecretOutput(false)).toThrow(/terminal interativo/i);
    expect(() => assertInteractiveSecretOutput(true)).not.toThrow();
  });
});
