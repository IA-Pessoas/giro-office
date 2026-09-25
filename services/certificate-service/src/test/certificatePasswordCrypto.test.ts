import { ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { createCertificatePasswordCrypto } from "../services/certificatePasswordCrypto.js";

const testKey = Buffer.alloc(32, 9).toString("base64");

describe("certificate password crypto", () => {
  it("rejects malformed Base64 encryption keys even when they decode to 32 bytes", () => {
    expect(() =>
      createCertificatePasswordCrypto({ keyBase64: `${testKey}!`, keyVersion: "v1" }),
    ).toThrow("CERTIFICATE_PASSWORD_ENCRYPTION_KEY deve ter 32 bytes em base64.");
  });

  it("encrypts an AES-256-GCM payload that decrypts to the original password", () => {
    const crypto = createCertificatePasswordCrypto({ keyBase64: testKey, keyVersion: "v1" });

    expect(crypto.decrypt(crypto.encrypt("senha-segura"))).toBe("senha-segura");
  });

  it("rejects a malformed encrypted payload", () => {
    const crypto = createCertificatePasswordCrypto({ keyBase64: testKey, keyVersion: "v1" });

    expect(() => crypto.decrypt('{"v":"v1"}')).toThrow(ServiceError);
  });

  it("rejects a payload encrypted with a different key version", () => {
    const encryptingCrypto = createCertificatePasswordCrypto({
      keyBase64: testKey,
      keyVersion: "v1",
    });
    const decryptingCrypto = createCertificatePasswordCrypto({
      keyBase64: testKey,
      keyVersion: "v2",
    });

    expect(() => decryptingCrypto.decrypt(encryptingCrypto.encrypt("senha-segura"))).toThrow(
      "Erro ao descriptografar senha de certificado.",
    );
  });

  it("reads payloads encrypted with the legacy key, whatever their version", () => {
    const legacyKey = Buffer.alloc(32, 7).toString("base64");
    const legacyCrypto = createCertificatePasswordCrypto({
      keyBase64: legacyKey,
      keyVersion: "v0",
    });
    const crypto = createCertificatePasswordCrypto({
      keyBase64: testKey,
      keyVersion: "v1",
      legacyKeyBase64: legacyKey,
    });

    expect(crypto.decrypt(legacyCrypto.encrypt("senha-legada"))).toBe("senha-legada");
    expect(crypto.decrypt(crypto.encrypt("senha-nova"))).toBe("senha-nova");
  });

  it("rejects a payload encrypted with an unknown key", () => {
    const otherCrypto = createCertificatePasswordCrypto({
      keyBase64: Buffer.alloc(32, 5).toString("base64"),
      keyVersion: "v1",
    });
    const crypto = createCertificatePasswordCrypto({
      keyBase64: testKey,
      keyVersion: "v1",
      legacyKeyBase64: Buffer.alloc(32, 7).toString("base64"),
    });

    expect(() => crypto.decrypt(otherCrypto.encrypt("senha"))).toThrow(
      "Erro ao descriptografar senha de certificado.",
    );
  });

  it.each(["iv", "tag", "data"] as const)("rejects a tampered %s payload field", (field) => {
    const crypto = createCertificatePasswordCrypto({ keyBase64: testKey, keyVersion: "v1" });
    const payload = JSON.parse(crypto.encrypt("senha-segura")) as Record<string, string>;
    payload[field] = `${payload[field].slice(0, -1)}${payload[field].endsWith("A") ? "B" : "A"}`;

    expect(() => crypto.decrypt(JSON.stringify(payload))).toThrow(
      "Erro ao descriptografar senha de certificado.",
    );
  });
});
