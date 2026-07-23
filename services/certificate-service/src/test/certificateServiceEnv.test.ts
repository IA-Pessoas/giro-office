import { afterEach, describe, expect, it } from "vitest";

import { getCertificateServiceEnv } from "../config/env.js";

const baseEnv = { ...process.env };
const validKey = Buffer.alloc(32, 7).toString("base64");

function resetEnv(overrides: NodeJS.ProcessEnv = {}): void {
  process.env = {
    ...baseEnv,
    NODE_ENV: "test",
    PORT: "3041",
    DATABASE_URL: "postgresql://user:password@localhost:5432/workspace_test",
    JWT_SECRET: "test-secret",
    AUDIT_SERVICE_URL: "http://localhost:3020",
    AUDIT_SERVICE_TOKEN: "test-audit-token",
    CERTIFICATE_SERVICE_INTERNAL_TOKEN: "test-internal-token",
    CERTIFICATE_FILE_ENCRYPTION_KEY: validKey,
    ...overrides,
  };
}

afterEach(() => {
  process.env = { ...baseEnv };
});

describe("certificate service env", () => {
  it("parses local certificate file storage settings", () => {
    resetEnv({
      CERTIFICATE_STORAGE_MODE: "local",
      CERTIFICATE_STORAGE_DIR: ".data/test-certificate-files",
      CERTIFICATE_FILE_MAX_SIZE_BYTES: "12345",
      CERTIFICATE_FILE_ENCRYPTION_KEY_VERSION: "v2",
      UPLOAD_RATE_LIMIT_MAX: "12",
      UPLOAD_RATE_LIMIT_WINDOW_MS: "3456",
    });

    const env = getCertificateServiceEnv();

    expect(env.storageMode).toBe("local");
    expect(env.storageBucket).toBe("Certificados");
    expect(env.storageDir).toBe(".data/test-certificate-files");
    expect(env.certificateFileMaxSizeBytes).toBe(12345);
    expect(env.certificateFileEncryptionKey).toBe(validKey);
    expect(env.certificateFileEncryptionKeyVersion).toBe("v2");
    expect(env.uploadRateLimitMax).toBe(12);
    expect(env.uploadRateLimitWindowMs).toBe(3456);
  });

  it("requires Supabase credentials when certificate storage mode is supabase", () => {
    resetEnv({
      CERTIFICATE_STORAGE_MODE: "supabase",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    });

    expect(() => getCertificateServiceEnv()).toThrow(
      /SUPABASE_URL invalida para certificate-service/,
    );
  });

  it("rejects local certificate file storage in production", () => {
    resetEnv({
      NODE_ENV: "production",
      CERTIFICATE_STORAGE_MODE: "local",
      AUDIT_SERVICE_TOKEN: "production-audit-token-with-more-than-32-characters",
      CERTIFICATE_SERVICE_INTERNAL_TOKEN: "production-internal-token-with-more-than-32-characters",
      SERVICE_ALLOWED_ORIGINS: "https://app.example.com",
    });

    expect(() => getCertificateServiceEnv()).toThrow(
      /CERTIFICATE_STORAGE_MODE=local nao e permitido em producao/,
    );
  });

  it("rejects certificate file encryption keys that are not 32 base64 bytes", () => {
    resetEnv({
      CERTIFICATE_STORAGE_MODE: "local",
      CERTIFICATE_FILE_ENCRYPTION_KEY: "invalid",
    });

    expect(() => getCertificateServiceEnv()).toThrow(
      /CERTIFICATE_FILE_ENCRYPTION_KEY deve ser base64 com 32 bytes/,
    );
  });
});
