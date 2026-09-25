import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { assertValidPkcs12, checkPkcs12 } from "../services/certificatePkcs12.js";

// Certificados autoassinados de teste, gerados com `openssl pkcs12 -export` (senha "secret-password").
const sha256Fixture = readFileSync(
  new URL("./fixtures/certificado-teste-sha256.p12", import.meta.url),
);
const sha1Fixture = readFileSync(new URL("./fixtures/certificado-teste-sha1.pfx", import.meta.url));

describe("certificate PKCS#12 check", () => {
  it.each([
    ["SHA-256 MAC", sha256Fixture],
    ["SHA-1 MAC (legacy)", sha1Fixture],
  ])("accepts a real PKCS#12 with the right password (%s)", (_label, fixture) => {
    expect(checkPkcs12(fixture, "secret-password")).toBe("valid");
  });

  it("rejects the right file with the wrong password", () => {
    expect(checkPkcs12(sha256Fixture, "outra-senha")).toBe("wrong_password");
    expect(checkPkcs12(sha1Fixture, "outra-senha")).toBe("wrong_password");
  });

  it("checks only the structure when no password is known", () => {
    expect(checkPkcs12(sha256Fixture, undefined)).toBe("valid");
  });

  it.each([
    ["texto renomeado", Buffer.from("isto nao e um pfx\n")],
    ["um byte", Buffer.from([1])],
    ["DER truncado", sha256Fixture.subarray(0, 200)],
    ["SEQUENCE vazia", Buffer.from([0x30, 0x00])],
    [
      "BER indefinido aninhado",
      Buffer.from(Array.from({ length: 5000 }, () => [0x30, 0x80]).flat()),
    ],
  ])("rejects a file that is not PKCS#12: %s", (_label, buffer) => {
    expect(checkPkcs12(buffer, "secret-password")).toBe("invalid");
  });

  it("maps failures to 400 errors in Portuguese", () => {
    expect(() => assertValidPkcs12(Buffer.from("texto"), "secret-password")).toThrow(
      expect.objectContaining({
        statusCode: 400,
        message: "O arquivo enviado não é um certificado digital PKCS#12 (.pfx/.p12) válido.",
      }),
    );
    expect(() => assertValidPkcs12(sha256Fixture, "outra-senha")).toThrow(
      expect.objectContaining({
        statusCode: 400,
        message:
          "A senha cadastrada não abre este certificado. Atualize a senha do certificado e envie o arquivo de novo.",
      }),
    );
    expect(() => assertValidPkcs12(sha256Fixture, "secret-password")).not.toThrow();
  });
});
