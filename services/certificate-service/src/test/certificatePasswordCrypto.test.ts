import { ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { createCertificatePasswordCrypto } from "../services/certificatePasswordCrypto.js";

const testKey = Buffer.alloc(32, 9).toString("base64");

describe("certificate password crypto", () => {
  it("encrypts an AES-256-GCM payload that decrypts to the original password", () => {
    const crypto = createCertificatePasswordCrypto({ keyBase64: testKey, keyVersion: "v1" });

    expect(crypto.decrypt(crypto.encrypt("senha-segura"))).toBe("senha-segura");
  });

  it("rejects a malformed encrypted payload", () => {
    const crypto = createCertificatePasswordCrypto({ keyBase64: testKey, keyVersion: "v1" });

    expect(() => crypto.decrypt('{"v":"v1"}')).toThrow(ServiceError);
  });
});
