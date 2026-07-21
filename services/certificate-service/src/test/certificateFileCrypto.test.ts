import { describe, expect, it } from "vitest";

import {
  createCertificateFileCrypto,
  decodeCertificateEncryptionKey,
} from "../services/certificateFileCrypto.js";

const validKey = Buffer.alloc(32, 7).toString("base64");

describe("certificate file crypto", () => {
  it("rejects encryption keys that are not 32 bytes in base64", () => {
    expect(() => decodeCertificateEncryptionKey("invalid")).toThrow(
      "CERTIFICATE_FILE_ENCRYPTION_KEY deve ser base64 com 32 bytes.",
    );
  });

  it("encrypts, decrypts and hashes the original file", () => {
    const crypto = createCertificateFileCrypto({
      keyBase64: validKey,
      keyVersion: "v1",
    });
    const original = Buffer.from("certificate-bytes");

    const encrypted = crypto.encrypt(original);
    const decrypted = crypto.decrypt({
      encryptedBuffer: encrypted.encryptedBuffer,
      ivBase64: encrypted.ivBase64,
      authTagBase64: encrypted.authTagBase64,
    });

    expect(decrypted.equals(original)).toBe(true);
    expect(encrypted.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(encrypted.keyVersion).toBe("v1");
    expect(encrypted.encryptedBuffer.equals(original)).toBe(false);
  });
});
