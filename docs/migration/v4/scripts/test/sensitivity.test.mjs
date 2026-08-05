import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoSensitiveSerializedContent,
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

test("toLegacyIdRef nunca preserva identificador legado bruto", () => {
  for (const value of [
    42,
    "c2c0a7d6-1e99-43c7-a922-23b4f7183ec5",
    "legacyID_7-A",
    "123.456.789-09",
    "12.345.678/0001-90",
    "+55 (71) 99999-1234",
  ]) {
    assert.match(toLegacyIdRef(value), /^sha256:[a-f0-9]{64}$/);
    assert.equal(toLegacyIdRef(value).includes(String(value)), false);
  }
  assert.equal(
    toLegacyIdRef("legacy id: 7"),
    "sha256:79b7d14aab00ee260f810373f46b5ea75d5a53dd37c79b5799297c6f377a58d2",
  );
});

test("barreira serializada cobre CNPJ, RG, telefone, endereço e PFX/DER em variações", () => {
  const unsafe = [
    ["12", ".345.678/", "0001-90"].join(""),
    ['{"rg":"', "12.345.678-9", '"}'].join(""),
    ["rg=", "MG-12.345.678"].join(""),
    ["+55 ", "(71) 99999-1234"].join(""),
    ['{"endereco":"', "Rua Exemplo, 10", '"}'].join(""),
    ["address=", "Avenida Exemplo 20"].join(""),
    ["pfx=", "3082", "A1".repeat(96)].join(""),
    ["pkcs12:", Buffer.from("material-criptografico".repeat(12)).toString("base64")].join(""),
    ['{"pfx_hex":"3082', "B2".repeat(96), '"}'].join(""),
    ["der_base64=", Buffer.from("der-material".repeat(20)).toString("base64")].join(""),
  ];

  for (const value of unsafe) {
    assert.throws(() => assertNoSensitiveSerializedContent(value), /sensivel/i);
  }
  assert.doesNotThrow(() =>
    assertNoSensitiveSerializedContent(
      '{"destinationColumn":"address","sourceColumn":"rg","sensitivity":"personal"}',
    ),
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

test("assertNoSensitiveValues preserva valores benignos de tres segmentos", () => {
  for (const value of ["versao-1.2.3", "build.2026.08"]) {
    assert.doesNotThrow(() => assertNoSensitiveValues({ details: { value } }));
  }
});
