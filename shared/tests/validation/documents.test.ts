import assert from "node:assert/strict";
import test from "node:test";

import { isValidCpf, isValidCpfCnpj, normalizeCpfCnpj } from "../../src/validation/documents.ts";

test("normaliza CPF e CNPJ mascarados para o valor canônico", () => {
  assert.equal(normalizeCpfCnpj("529.982.247-25"), "52998224725");
  assert.equal(normalizeCpfCnpj("12.345.678/0001-95"), "12345678000195");
  assert.equal(normalizeCpfCnpj("ab.123.456/7800-01"), "AB123456780001");
});

test("valida CPF pelos dois dígitos verificadores e rejeita sequências repetidas", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("529.982.247-26"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("123"), false);
});

test("valida CPF ou CNPJ conforme o tipo e rejeita documento inválido", () => {
  assert.equal(isValidCpfCnpj("529.982.247-25", "PF"), true);
  assert.equal(isValidCpfCnpj("12.345.678/0001-95", "PJ"), true);
  assert.equal(isValidCpfCnpj("12.345.678/0001-00", "PJ"), false);
  assert.equal(isValidCpfCnpj("12.345.678/0001-95", "PF"), false);
  assert.equal(isValidCpfCnpj("", undefined), false);
});
