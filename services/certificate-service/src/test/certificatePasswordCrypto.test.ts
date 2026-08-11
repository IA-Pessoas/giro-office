import type { ServiceError } from "@workspace/shared";
import { createEncryptedTextCrypto } from "@workspace/shared/security";
import { describe, expect, it } from "vitest";

import { createCertificatePasswordCrypto } from "../services/certificatePasswordCrypto.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

describe("certificate password crypto", () => {
  it("requires a 32-byte key and a non-empty version", () => {
    expect(() =>
      createCertificatePasswordCrypto({
        keyBase64: "invalid-key",
        keyVersion: "v1",
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "ServiceError",
        statusCode: 500,
        message: "CERTIFICATE_PASSWORD_ENCRYPTION_KEY deve ser base64 com 32 bytes.",
      } satisfies Partial<ServiceError>),
    );

    expect(() =>
      createCertificatePasswordCrypto({
        keyBase64: encryptionKey,
        keyVersion: " ",
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "ServiceError",
        statusCode: 500,
      } satisfies Partial<ServiceError>),
    );
  });

  it("decrypts the legacy shared envelope and preserves its configured version on writes", () => {
    const legacyCrypto = createEncryptedTextCrypto({
      keyBase64: encryptionKey,
      keyVersion: "v1",
    });
    const crypto = createCertificatePasswordCrypto({
      keyBase64: encryptionKey,
      keyVersion: "v1",
    });

    const encrypted = crypto.encrypt("certificate-password");

    expect(JSON.parse(encrypted as string).v).toBe("v1");
    expect(crypto.decrypt(legacyCrypto.encrypt("legacy-password"))).toBe("legacy-password");
    expect(crypto.isEncrypted(encrypted as string)).toBe(true);
  });

  it("detects plaintext and preserves nullish values", () => {
    const crypto = createCertificatePasswordCrypto({
      keyBase64: encryptionKey,
      keyVersion: "v1",
    });

    expect(crypto.isEncrypted("legacy-password")).toBe(false);
    expect(crypto.encrypt(null)).toBeNull();
    expect(crypto.decrypt(undefined)).toBeNull();
  });

  it("converts malformed or undecryptable values into a safe ServiceError", () => {
    const crypto = createCertificatePasswordCrypto({
      keyBase64: encryptionKey,
      keyVersion: "v1",
    });
    const otherCrypto = createCertificatePasswordCrypto({
      keyBase64: Buffer.alloc(32, 8).toString("base64"),
      keyVersion: "v1",
    });
    const rawValue = "certificate-password-that-must-not-leak";

    for (const value of [rawValue, otherCrypto.encrypt(rawValue)]) {
      expect(() => crypto.decrypt(value)).toThrowError(
        expect.objectContaining({
          name: "ServiceError",
          statusCode: 422,
          message: "Senha de certificado invalida ou nao pode ser descriptografada.",
        } satisfies Partial<ServiceError>),
      );
    }
  });
});
