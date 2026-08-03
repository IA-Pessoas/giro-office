import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoSensitiveValues,
  classifySensitivity,
  isSensitiveColumn,
  sanitizeQuarantineItem,
  toLegacyIdRef,
} from "../lib/sensitivity.mjs";

test("isSensitiveColumn reconhece nomes sensiveis em portugues e ingles", () => {
  for (const name of [
    "senha",
    "password",
    "passwd",
    "token",
    "secret",
    "chave",
    "private_key",
    "certificado",
    "pfx",
    "pem",
    "reset_token",
  ]) {
    assert.equal(isSensitiveColumn(name), true, name);
  }

  assert.equal(isSensitiveColumn("nome_exibicao"), false);
  assert.equal(classifySensitivity("password"), "credential");
  assert.equal(classifySensitivity("private_key"), "secret");
  assert.equal(classifySensitivity("nome_exibicao"), "none");
});

test("toLegacyIdRef preserva IDs seguros e resume IDs livres com sha256", () => {
  assert.equal(toLegacyIdRef(42), "42");
  assert.equal(
    toLegacyIdRef("c2c0a7d6-1e99-43c7-a922-23b4f7183ec5"),
    "c2c0a7d6-1e99-43c7-a922-23b4f7183ec5",
  );
  assert.equal(toLegacyIdRef("legacyID_7-A"), "legacyID_7-A");
  assert.equal(
    toLegacyIdRef("legacy id: 7"),
    "sha256:79b7d14aab00ee260f810373f46b5ea75d5a53dd37c79b5799297c6f377a58d2",
  );
});

test("sanitizeQuarantineItem remove valores e preserva somente os metadados permitidos", () => {
  const item = sanitizeQuarantineItem({
    sourceTable: "usuarios_legado",
    legacyId: "legacy id: 7",
    field: "senha",
    reasonCode: "sensitive_column",
    destinationTable: "users",
    decisionStatus: "approved",
    rawValue: "nao-pode-vazar",
  });

  assert.deepEqual(item, {
    sourceTable: "usuarios_legado",
    legacyIdRef: "sha256:79b7d14aab00ee260f810373f46b5ea75d5a53dd37c79b5799297c6f377a58d2",
    field: "senha",
    reasonCode: "sensitive_column",
    destinationTable: "users",
    decisionStatus: "unresolved",
  });
});

test("assertNoSensitiveValues aceita metadados de campos sem seus valores", () => {
  assert.doesNotThrow(() => {
    assertNoSensitiveValues({
      sensitiveColumns: ["senha", "reset_token"],
      field: "senha",
      legacyIdRef: "42",
    });
  });
});

test("assertNoSensitiveValues rejeita segredo associado a campo sensivel", () => {
  assert.throws(() => assertNoSensitiveValues({ senha: "segredo" }), /sensivel/i);
});

test("assertNoSensitiveValues rejeita credenciais e material criptografico em valores aninhados", () => {
  for (const value of [
    "postgresql://usuario:segredo@localhost:5432/base",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura",
    "-----BEGIN PRIVATE KEY-----\nsegredo\n-----END PRIVATE KEY-----",
    "-----BEGIN PFX-----\nconteudo\n-----END PFX-----",
  ]) {
    assert.throws(() => assertNoSensitiveValues({ details: { value } }), /sensivel/i);
  }
});

test("assertNoSensitiveValues rejeita JWTs com prefixos sem espacos", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura";

  for (const value of [`token=${jwt}`, `prefixo:${jwt}`]) {
    assert.throws(
      () => assertNoSensitiveValues({ details: { value } }),
      (error) => {
        assert.match(error.message, /sensivel/i);
        assert.equal(error.message.includes(jwt), false);
        return true;
      },
    );
  }
});
